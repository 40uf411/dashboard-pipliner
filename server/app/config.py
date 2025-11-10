"""Configuration constants and helpers for the Alger server."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

SUBPROTOCOL = "alger"
USERNAME = "admin"
PASSWORD = "admin"
HOST = "0.0.0.0"
PORT = 8765

BASE_DIR = Path(__file__).resolve().parent.parent
SQLITE_DIR = BASE_DIR / "sqlite_db"
SQLITE_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = SQLITE_DIR / "alger.sqlite3"
OUTPUTS_DIR = BASE_DIR / "outputs"
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)


def default_server_state() -> Dict[str, Any]:
    return {
        "max_concurrent_executions": 1,
        "executions_halted": False,
        "maintenance_mode": False,
    }
