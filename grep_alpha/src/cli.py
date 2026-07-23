import typer
import os
import subprocess
from src.yaml_manager import YAMLManager
from src.data_fetcher import sync_tickers
from typing import Optional

app = typer.Typer(help="CLI Momentum & Watchlist Tracker")
watch_app = typer.Typer(help="Watchlist management")
app.add_typer(watch_app, name="watch")

manager = YAMLManager()

@watch_app.command("ls")
def list_watchlists():
    """List all active watchlists."""
    categories = manager.list_watchlists()
    if not categories:
        typer.echo("No watchlists found.")
    else:
        typer.echo("Watchlists:")
        for cat in categories:
            typer.echo(f" - {cat}")

@watch_app.command("add")
def add_ticker(
    ticker: str = typer.Argument(..., help="Ticker symbol"),
    category: str = typer.Argument(..., help="Watchlist category"),
    thesis: str = typer.Option("", "--thesis", "-t", help="Optional thesis")
):
    """Add a ticker to a specific watchlist."""
    try:
        manager.add_ticker(category, ticker, thesis)
        typer.echo(f"Added {ticker.upper()} to {category}.")
    except Exception as e:
        typer.echo(f"Error adding ticker: {e}", err=True)

@watch_app.command("rm")
def remove_ticker(
    ticker: str = typer.Argument(..., help="Ticker symbol"),
    category: str = typer.Argument(..., help="Watchlist category")
):
    """Remove a ticker from a specific watchlist."""
    try:
        manager.remove_ticker(category, ticker)
        typer.echo(f"Removed {ticker.upper()} from {category}.")
    except Exception as e:
        typer.echo(f"Error removing ticker: {e}", err=True)

@watch_app.command("note")
def update_note(
    ticker: str = typer.Argument(..., help="Ticker symbol"),
    category: str = typer.Argument(..., help="Watchlist category"),
    thesis: str = typer.Argument(..., help="Thesis text")
):
    """Add/update a thesis string for a ticker."""
    try:
        manager.update_thesis(category, ticker, thesis)
        typer.echo(f"Updated note for {ticker.upper()} in {category}.")
    except Exception as e:
        typer.echo(f"Error updating note: {e}", err=True)

@watch_app.command("sync")
def sync():
    """Fetch missing daily data from Alpaca for all tickers."""
    try:
        typer.echo("Starting sync...")
        sync_tickers()
        typer.echo("Sync complete.")
    except Exception as e:
        typer.echo(f"Sync failed: {e}", err=True)

@watch_app.command("review")
def review(
    category: str = typer.Argument(..., help="Watchlist category to review")
):
    """Launch the Streamlit web interface for a specific watchlist."""
    try:
        typer.echo(f"Launching review for {category}...")
        env = os.environ.copy()
        env["WATCHLIST_CATEGORY"] = category
        subprocess.run(["streamlit", "run", "src/app.py"], env=env)
    except Exception as e:
        typer.echo(f"Failed to launch review: {e}", err=True)

if __name__ == "__main__":
    app()
