"""Keep symbols held in the Alpaca paper account on FlipCharts/watchlist.yaml.

Why a persisted record: on prod, FlipCharts/watchlist.yaml is a bind mount of the
repo checkout (docker-compose.yml) and is also baked into the image (Dockerfile).
A deploy (git pull / reset + rebuild) or a weekly-refresh merge replaces the file
with master's copy, which would silently drop symbols the app added on prod only.
So every auto-add is also written to paper_autoadds.json in the state dir (the
persistent app_data volume on prod) and re-merged into the live YAML:
  - at startup,
  - whenever the YAML file changes (a watcher thread polls mtime/size/inode),
  - after every sync and every Watchlist Manager save.
Re-merging is idempotent: it only appends record symbols that are missing.

Writes append a text block to the end of the file in place (no rewrite, no
rename), so existing formatting is untouched and single-file bind mounts keep
working. A timestamped backup is taken first.

A record entry is dropped only when the operator removes that symbol through the
Watchlist Manager AND it is no longer held; otherwise it would be re-added.
"""
from __future__ import annotations

import datetime as _dt
import json
import logging
import os
import shutil
import threading
from typing import Callable, Dict, Iterable, List, Optional

import yaml

log = logging.getLogger("grep_alpha.paper_watchlist")

PAPER_TAG = "paper"
RECORD_NAME = "paper_autoadds.json"
LOG_NAME = "paper_autoadd.log"

_write_lock = threading.RLock()


def default_state_dir(workspace_root: str) -> str:
    if os.environ.get("GA_STATE_DIR"):
        return os.environ["GA_STATE_DIR"]
    if os.environ.get("DB_PATH"):
        return os.path.dirname(os.path.abspath(os.environ["DB_PATH"]))
    return os.path.join(workspace_root, ".ga_state")


def _today() -> str:
    return _dt.date.today().strftime("%Y-%m-%d")


def _now_utc() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def yaml_symbols_from_text(text: str) -> set:
    data = yaml.safe_load(text) or []
    if not isinstance(data, list):
        return set()
    return {str(i.get("symbol", "")).upper() for i in data if isinstance(i, dict) and i.get("symbol")}


def entry_block(symbol: str, added: str, today: str) -> str:
    return (
        f"- symbol: {symbol}\n"
        f"  status: watching\n"
        f"  target_entry: null\n"
        f"  thesis: ''\n"
        f"  tags: {PAPER_TAG}\n"
        f"  date: '{today}'\n"
        f"  added: '{added}'\n"
    )


class PaperWatchlist:
    def __init__(self, yaml_path: str, state_dir: str, backups_dir: Optional[str] = None,
                 mirror_paths: Iterable[str] = (), today: Callable[[], str] = _today):
        self.yaml_path = yaml_path
        self.state_dir = state_dir
        self.backups_dir = backups_dir
        self.mirror_paths = [p for p in mirror_paths if p]
        self._today = today
        self._watch_stop = threading.Event()
        self._watch_thread: Optional[threading.Thread] = None
        self._last_sig = None

    # --- record ---
    @property
    def record_path(self) -> str:
        return os.path.join(self.state_dir, RECORD_NAME)

    def load_record(self) -> Dict[str, Dict[str, str]]:
        try:
            with open(self.record_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            syms = data.get("symbols", {}) if isinstance(data, dict) else {}
            return {str(k).upper(): v for k, v in syms.items() if isinstance(v, dict)}
        except FileNotFoundError:
            return {}
        except (OSError, ValueError) as e:
            log.error("paper auto-add record unreadable (%s); treating as empty", type(e).__name__)
            return {}

    def _save_record(self, rec: Dict[str, Dict[str, str]]) -> None:
        os.makedirs(self.state_dir, exist_ok=True)
        tmp = self.record_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"version": 1, "symbols": dict(sorted(rec.items()))}, f, indent=2)
            f.write("\n")
        os.replace(tmp, self.record_path)  # the record lives in the state dir, not a bind-mounted file

    def _log(self, event: str, **fields) -> None:
        line = {"ts": _now_utc(), "event": event, **fields}
        log.info("paper-watchlist %s", json.dumps(line))
        try:
            os.makedirs(self.state_dir, exist_ok=True)
            with open(os.path.join(self.state_dir, LOG_NAME), "a", encoding="utf-8") as f:
                f.write(json.dumps(line) + "\n")
        except OSError:
            pass

    # --- yaml ---
    def _read_yaml_text(self) -> str:
        try:
            with open(self.yaml_path, "r", encoding="utf-8") as f:
                return f.read()
        except FileNotFoundError:
            return ""

    def current_symbols(self) -> set:
        return yaml_symbols_from_text(self._read_yaml_text())

    def _backup(self) -> None:
        if not self.backups_dir or not os.path.exists(self.yaml_path):
            return
        try:
            os.makedirs(self.backups_dir, exist_ok=True)
            stamp = _dt.datetime.now().strftime("%Y-%m-%d_%H%M%S_%f")
            shutil.copy2(self.yaml_path, os.path.join(self.backups_dir, f"watchlist_{stamp}_paper.yaml"))
        except OSError:
            pass

    def _append(self, entries: List[tuple]) -> None:
        """Append (symbol, added) entries to the YAML (and dist mirrors) in place."""
        if not entries:
            return
        today = self._today()
        text = "".join(entry_block(s, a, today) for s, a in entries)
        self._backup()
        targets = [self.yaml_path] + [p for p in self.mirror_paths if os.path.exists(os.path.dirname(p))]
        for path in targets:
            existing = ""
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    existing = f.read()
            have = yaml_symbols_from_text(existing)
            block = "".join(entry_block(s, a, today) for s, a in entries if s not in have)
            if not block:
                continue
            prefix = "" if (not existing or existing.endswith("\n")) else "\n"
            with open(path, "a", encoding="utf-8") as f:  # in place: keeps the inode for bind mounts
                f.write(prefix + block)
        self._last_sig = self._signature()

    # --- operations ---
    def sync(self, held: Iterable[str], source: str) -> Dict[str, List[str]]:
        """Record every held symbol and append the ones missing from the YAML. Idempotent."""
        held = sorted({str(s).upper() for s in held if s})
        with _write_lock:
            rec = self.load_record()
            on_list = self.current_symbols()
            today = self._today()
            new_record = False
            for s in held:
                if s not in rec:
                    rec[s] = {"added": today if s not in on_list else "", "first_seen": _now_utc(),
                              "source": source, "was_on_watchlist": s in on_list}
                    new_record = True
            if new_record:
                self._save_record(rec)
            missing = [s for s in held if s not in on_list]
            entries = [(s, rec[s].get("added") or today) for s in missing]
            self._append(entries)
            restored = self._reconcile_locked(rec)
            already = [s for s in held if s in on_list]
            if missing:
                self._log("auto_add", symbols=missing, source=source)
            return {"added": missing, "already_on_watchlist": already, "restored": restored}

    def _reconcile_locked(self, rec: Dict[str, Dict[str, str]]) -> List[str]:
        """Re-append recorded auto-adds (not originally on the list) that the YAML has lost."""
        on_list = self.current_symbols()
        lost = sorted(s for s, v in rec.items() if not v.get("was_on_watchlist") and s not in on_list)
        if lost:
            self._append([(s, rec[s].get("added") or self._today()) for s in lost])
            self._log("restore", symbols=lost)
        return lost

    def reconcile(self) -> List[str]:
        with _write_lock:
            return self._reconcile_locked(self.load_record())

    def forget_removed(self, new_yaml_text: str, held: set) -> List[str]:
        """Called before a Watchlist Manager save: honor deliberate removals of symbols no longer held."""
        with _write_lock:
            rec = self.load_record()
            if not rec:
                return []
            keep = yaml_symbols_from_text(new_yaml_text)
            dropped = sorted(s for s, v in rec.items()
                             if not v.get("was_on_watchlist") and s not in keep and s not in held)
            if dropped:
                for s in dropped:
                    rec.pop(s, None)
                self._save_record(rec)
                self._log("forget", symbols=dropped, reason="removed in Watchlist Manager, not held")
            return dropped

    # --- watcher ---
    def _signature(self):
        try:
            st = os.stat(self.yaml_path)
            return (st.st_ino, st.st_mtime_ns, st.st_size)
        except OSError:
            return None

    def check_once(self) -> List[str]:
        sig = self._signature()
        if sig is not None and sig != self._last_sig:
            self._last_sig = sig
            restored = self.reconcile()
            self._last_sig = self._signature()
            return restored
        return []

    def start_watcher(self, interval: float = 15.0) -> None:
        if self._watch_thread and self._watch_thread.is_alive():
            return
        self._watch_stop.clear()

        def run():
            while not self._watch_stop.wait(interval):
                try:
                    self.check_once()
                except Exception as e:  # keep the watcher alive
                    log.error("paper watchlist watcher error: %s", type(e).__name__)
        self._watch_thread = threading.Thread(target=run, name="paper-watchlist-watcher", daemon=True)
        self._watch_thread.start()

    def stop_watcher(self) -> None:
        self._watch_stop.set()
