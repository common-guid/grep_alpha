"""Ingest screen results from a read-only drop folder (Syncthing receive-only on prod).

The screener writes one JSON v1 file per run into its send-only Syncthing folder;
prod receives it into a host dir mounted read-only at GA_SCREENS_DROP_DIR. Every
~15s (and at startup) this scans *.json, skips Syncthing temp files, and runs each
new or changed file through the SAME validation and storage as POST /api/screens.

Each (filename, sha256) is recorded in `screen_ingests`, so a file is processed
once; an edited file (new hash) is processed again. Invalid files are recorded as
rejected with their errors and not retried until their content changes. The app
never writes, renames or deletes anything in the drop folder.
"""
from __future__ import annotations

import fnmatch
import hashlib
import json
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from grep_alpha.src import screens as sc

log = logging.getLogger("grep_alpha.screens_drop")

ENV_DIR = "GA_SCREENS_DROP_DIR"
SCAN_INTERVAL_SECONDS = 15.0
# Syncthing writes ".syncthing.<name>.tmp" while transferring; "~syncthing~*" are its
# temp/ignored names on some platforms. Producers' own temp files: "*.tmp", ".*", "~*".
IGNORE_PATTERNS = (".syncthing.*", "~syncthing~*", ".*", "~*", "*.tmp", "*.part", "*.partial")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def is_candidate(name: str) -> bool:
    if not name.lower().endswith(".json"):
        return False
    return not any(fnmatch.fnmatch(name, p) for p in IGNORE_PATTERNS)


def _already(conn_factory: Callable, filename: str, digest: str) -> bool:
    with conn_factory() as conn:
        return conn.execute("SELECT 1 FROM screen_ingests WHERE filename=? AND sha256=?",
                            (filename, digest)).fetchone() is not None


def _record(conn_factory: Callable, filename: str, digest: str, status: str, size: int,
            screen: Optional[str] = None, run_id: Optional[int] = None, errors: Optional[List[str]] = None,
            detail: Optional[Dict[str, Any]] = None) -> None:
    with conn_factory() as conn:
        conn.execute("""INSERT OR IGNORE INTO screen_ingests
                        (filename, sha256, size, status, screen, run_id, errors_json, detail_json, ingested_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                     (filename, digest, size, status, screen, run_id, json.dumps(errors or []),
                      json.dumps(detail or {}), _now()))
        conn.commit()


def scan_once(directory: str, conn_factory: Callable) -> Dict[str, List[str]]:
    """Process new/changed files. Returns {'ingested': [...], 'rejected': [...], 'skipped': [...]}."""
    out: Dict[str, List[str]] = {"ingested": [], "rejected": [], "skipped": []}
    try:
        names = sorted(os.listdir(directory))
    except OSError as e:
        log.warning("screens drop dir unreadable (%s): %s", directory, type(e).__name__)
        return out
    for name in names:
        path = os.path.join(directory, name)
        if not is_candidate(name) or not os.path.isfile(path):
            continue
        try:
            size = os.path.getsize(path)
            if size > sc.MAX_BODY_BYTES:
                data = None
            else:
                with open(path, "rb") as f:  # read-only; never modified
                    data = f.read()
        except OSError:
            continue  # vanished mid-scan or unreadable; try next scan
        digest = hashlib.sha256(data if data is not None else f"{name}:{size}".encode()).hexdigest()
        if _already(conn_factory, name, digest):
            out["skipped"].append(name)
            continue
        if data is None:
            _record(conn_factory, name, digest, "rejected", size, errors=[f"file > {sc.MAX_BODY_BYTES} bytes"])
            log.warning("screens drop: rejected %s (too large)", name)
            out["rejected"].append(name)
            continue
        try:
            raw = json.loads(data.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            _record(conn_factory, name, digest, "rejected", size, errors=["not valid UTF-8 JSON"])
            log.warning("screens drop: rejected %s (not JSON)", name)
            out["rejected"].append(name)
            continue
        try:
            payload, run_id, replaced, pruned = sc.ingest(conn_factory, raw)
        except sc.ScreenValidationError as e:
            screen = raw.get("screen") if isinstance(raw, dict) and isinstance(raw.get("screen"), str) else None
            _record(conn_factory, name, digest, "rejected", size, screen=screen, errors=e.errors[:50])
            log.warning("screens drop: rejected %s: %s", name, "; ".join(e.errors[:5]))
            out["rejected"].append(name)
            continue
        _record(conn_factory, name, digest, "ingested", size, screen=payload["screen"], run_id=run_id,
                detail={"run_at": payload["run_at"], "as_of": payload["as_of"], "row_count": len(payload["rows"]),
                        "replaced": replaced, "pruned": pruned})
        log.info("screens drop: ingested %s -> %s run %s (%d rows)", name, payload["screen"], run_id, len(payload["rows"]))
        out["ingested"].append(name)
    return out


def recent(conn_factory: Callable, limit: int = 50) -> List[Dict[str, Any]]:
    with conn_factory() as conn:
        rows = conn.execute("""SELECT id, filename, sha256, size, status, screen, run_id, errors_json, detail_json, ingested_at
                               FROM screen_ingests ORDER BY id DESC LIMIT ?""", (limit,)).fetchall()
    return [{"id": r[0], "filename": r[1], "sha256": r[2], "size": r[3], "status": r[4], "screen": r[5],
             "run_id": r[6], "errors": json.loads(r[7]), **json.loads(r[8]), "processed_at": r[9]} for r in rows]


class DropWatcher:
    def __init__(self, directory: Optional[str], conn_factory: Callable, interval: float = SCAN_INTERVAL_SECONDS):
        self.directory = directory
        self.conn_factory = conn_factory
        self.interval = interval
        self.last_scan_at: Optional[str] = None
        self.last_error: Optional[str] = None
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return bool(self.directory)

    def scan(self) -> Dict[str, List[str]]:
        if not self.enabled:
            return {"ingested": [], "rejected": [], "skipped": []}
        with self._lock:
            try:
                res = scan_once(self.directory, self.conn_factory)
                self.last_error = None if os.path.isdir(self.directory) else "drop dir not found"
                return res
            except Exception as e:  # keep the watcher alive
                self.last_error = type(e).__name__
                log.error("screens drop scan failed: %s", type(e).__name__)
                return {"ingested": [], "rejected": [], "skipped": []}
            finally:
                self.last_scan_at = _now()

    def start(self) -> None:
        if not self.enabled or (self._thread and self._thread.is_alive()):
            return
        self._stop.clear()

        def run():
            self.scan()
            while not self._stop.wait(self.interval):
                self.scan()
        self._thread = threading.Thread(target=run, name="screens-drop-watcher", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
