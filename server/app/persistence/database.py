"""Persistence layer for the Alger server.

This module exposes an abstract gateway plus a SQLite-backed implementation
capable of recording every interaction that flows through the WebSocket
server.  All data-centric operations inside ``server.py`` are routed through
the gateway so that alternative databases can be wired in later by providing
another implementation of :class:`PersistenceGateway`.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

JsonDict = Dict[str, Any]


def _serialize(data: Any) -> Optional[str]:
    if data is None:
        return None
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False)


def _deserialize(data: Optional[str]) -> Any:
    if data in (None, "", "null"):
        return None
    return json.loads(data)


class PersistenceGateway(ABC):
    """Abstraction boundary for database operations used by the server."""

    @abstractmethod
    def initialize(self) -> None:
        """Provision tables and seed default data if required."""

    @abstractmethod
    def reset(self) -> None:
        """Drop any runtime state so tests can start from a clean slate."""

    # -- User and auth lifecycle -------------------------------------------------
    @abstractmethod
    def ensure_user(self, username: str, defaults: JsonDict) -> JsonDict:
        """Return an existing user or create one with ``defaults``."""

    @abstractmethod
    def record_login_attempt(
        self, user_id: str, success: bool, details: JsonDict
    ) -> None:
        """Persist audit data for each login attempt."""

    @abstractmethod
    def record_user_action(self, user_id: str, action: str, details: JsonDict) -> None:
        """Audit arbitrary user-triggered events."""

    # -- Connection and conversation tracking -----------------------------------
    @abstractmethod
    def open_connection(self, user_id: str, client_info: JsonDict) -> str:
        """Insert a row for a live websocket connection."""

    @abstractmethod
    def close_connection(self, connection_id: str) -> None:
        """Mark the websocket connection as closed."""

    @abstractmethod
    def open_conversation(self, user_id: str, connection_id: str) -> str:
        """Start a conversation log bound to a connection."""

    @abstractmethod
    def close_conversation(self, conversation_id: str) -> None:
        """Mark a conversation as finished."""

    @abstractmethod
    def log_message(
        self,
        conversation_id: str,
        direction: str,
        *,
        message_id: Optional[int],
        request_id: Optional[int],
        type_code: Optional[int],
        status_code: Optional[int],
        payload: Optional[JsonDict],
        error: Optional[str] = None,
    ) -> None:
        """Capture every inbound/outbound frame."""

    @abstractmethod
    def log_error(
        self,
        conversation_id: Optional[str],
        *,
        execution_id: Optional[str],
        message_id: Optional[int],
        type_code: Optional[int],
        severity: str,
        message: str,
        payload: Optional[JsonDict] = None,
    ) -> None:
        """Store structured diagnostics for operator review."""

    # -- Pipelines ----------------------------------------------------------------
    @abstractmethod
    def list_pipelines(self) -> List[JsonDict]:
        """Return persisted pipeline definitions."""

    @abstractmethod
    def get_pipeline(self, pipeline_id: str) -> Optional[JsonDict]:
        """Fetch a single pipeline definition."""

    @abstractmethod
    def upsert_pipeline(self, pipeline: JsonDict) -> None:
        """Insert or update a pipeline definition."""

    # -- Executions ---------------------------------------------------------------
    @abstractmethod
    def create_execution(
        self,
        *,
        pipeline_id: Optional[str],
        source: str,
        graph: Optional[JsonDict],
        params: JsonDict,
        requested_by: str,
        status: str,
        output: JsonDict,
    ) -> JsonDict:
        """Create a pipeline execution row and return the stored payload."""

    @abstractmethod
    def get_execution(self, execution_id: str) -> Optional[JsonDict]:
        """Return a previously recorded execution."""

    @abstractmethod
    def update_execution_status(
        self,
        execution_id: str,
        *,
        status: str,
        output: Optional[JsonDict] = None,
    ) -> None:
        """Update execution status and optional output payload."""

    @abstractmethod
    def add_execution_event(
        self, execution_id: str, event_type: str, description: str, payload: JsonDict
    ) -> None:
        """Append granular execution events."""

    @abstractmethod
    def count_active_executions(self) -> int:
        """Return the number of executions that are still running."""


class SQLitePersistenceGateway(PersistenceGateway):
    """SQLite implementation that satisfies ``PersistenceGateway``."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        self._lock = threading.RLock()
        self._conn = self._connect()

    def _connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        with conn:  # ensure UTF-8 + FK enforcement
            conn.execute("PRAGMA foreign_keys = ON;")
        return conn

    # -- Lifecycle ----------------------------------------------------------------
    def initialize(self) -> None:
        with self._lock:
            self._apply_schema()
        self._seed_defaults()

    def reset(self) -> None:
        with self._lock:
            self._conn.close()
            if self.db_path.exists():
                self.db_path.unlink()
            self._conn = self._connect()
            self._apply_schema()
        self._seed_defaults()

    def _apply_schema(self) -> None:
        with self._conn:
            self._conn.executescript(_SCHEMA)
            self._ensure_pipeline_schema()

    def _ensure_pipeline_schema(self) -> None:
        rows = self._conn.execute("PRAGMA table_info(pipelines)").fetchall()
        if not rows:
            return
        columns = {row["name"] for row in rows}
        if "nodes" in columns and "full_graph" not in columns:
            self._conn.execute(
                "ALTER TABLE pipelines RENAME COLUMN nodes TO full_graph;"
            )
            rows = self._conn.execute("PRAGMA table_info(pipelines)").fetchall()
            columns = {row["name"] for row in rows}
        needs_rebuild = False
        if "definition" in columns:
            needs_rebuild = True
        if "description" not in columns:
            needs_rebuild = True
        if needs_rebuild:
            self._rebuild_pipelines_table(columns)

    def _rebuild_pipelines_table(self, legacy_columns: set[str]) -> None:
        self._conn.execute("ALTER TABLE pipelines RENAME TO pipelines_legacy;")
        self._conn.execute(_PIPELINES_TABLE_SQL)
        rows = self._conn.execute("SELECT * FROM pipelines_legacy").fetchall()
        for row in rows:
            record = dict(row)
            full_graph = record.get("full_graph")
            if full_graph is None and "definition" in legacy_columns:
                full_graph = record.get("definition")
            if full_graph is None and "nodes" in legacy_columns:
                full_graph = record.get("nodes")
            description = record.get("description") if "description" in legacy_columns else None
            metadata = record.get("metadata")
            self._conn.execute(
                """
                INSERT INTO pipelines (
                    id, name, full_graph, description, metadata, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
                """,
                (
                    record.get("id"),
                    record.get("name"),
                    full_graph,
                    description,
                    metadata,
                    record.get("created_at"),
                    record.get("updated_at"),
                ),
            )
        self._conn.execute("DROP TABLE pipelines_legacy;")

    def _seed_defaults(self) -> None:
        admin_defaults = {
            "display_name": "Administrator",
            "email": "admin@example.com",
            "roles": ["admin", "operator"],
        }
        self.ensure_user("admin", admin_defaults)
        if not self.get_pipeline("demo"):
            self.upsert_pipeline(
                {
                    "id": "demo",
                    "name": "Demo Pipeline",
                    "full_graph": {
                        "pipeline": {
                            "id": "demo",
                            "name": "Demo Pipeline",
                            "nodes": ["extract", "transform", "load"],
                        }
                    },
                    "description": "Baseline ETL demo pipeline",
                    "metadata": {"seeded": True},
                }
            )

    # -- User helpers -------------------------------------------------------------
    def ensure_user(self, username: str, defaults: JsonDict) -> JsonDict:
        user = self._fetch_user(username=username)
        if user:
            return user
        user_id = str(uuid4())
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO users (id, username, display_name, email, roles, metadata)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    username,
                    defaults.get("display_name"),
                    defaults.get("email"),
                    _serialize(defaults.get("roles", [])),
                    _serialize(defaults.get("metadata", {})),
                ),
            )
        return self._fetch_user(user_id=user_id)  # type: ignore[arg-type]

    def _fetch_user(
        self, *, user_id: Optional[str] = None, username: Optional[str] = None
    ) -> Optional[JsonDict]:
        query = "SELECT * FROM users WHERE "
        params: tuple[Any, ...]
        if user_id:
            query += "id = ?"
            params = (user_id,)
        else:
            query += "username = ?"
            params = (username,)
        row = self._conn.execute(query, params).fetchone()
        if not row:
            return None
        payload = dict(row)
        payload["roles"] = _deserialize(payload.get("roles"))
        payload["metadata"] = _deserialize(payload.get("metadata"))
        return payload

    def record_login_attempt(
        self, user_id: str, success: bool, details: JsonDict
    ) -> None:
        details = dict(details)
        details["success"] = success
        self.record_user_action(user_id, "login_attempt", details)
        if success:
            with self._lock, self._conn:
                self._conn.execute(
                    """
                    UPDATE users
                    SET last_login = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (user_id,),
                )

    def record_user_action(
        self, user_id: str, action: str, details: JsonDict
    ) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO user_actions (user_id, action, details)
                VALUES (?, ?, ?)
                """,
                (user_id, action, _serialize(details)),
            )

    # -- Connections --------------------------------------------------------------
    def open_connection(self, user_id: str, client_info: JsonDict) -> str:
        connection_id = str(uuid4())
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO connections (
                    id, user_id, client_ip, client_port, user_agent, origin, path, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
                """,
                (
                    connection_id,
                    user_id,
                    client_info.get("ip"),
                    client_info.get("port"),
                    client_info.get("user_agent"),
                    client_info.get("origin"),
                    client_info.get("path"),
                ),
            )
        return connection_id

    def close_connection(self, connection_id: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """
                UPDATE connections
                SET status = 'closed',
                    disconnected_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (connection_id,),
            )

    def open_conversation(self, user_id: str, connection_id: str) -> str:
        conversation_id = str(uuid4())
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO conversations (id, user_id, connection_id)
                VALUES (?, ?, ?)
                """,
                (conversation_id, user_id, connection_id),
            )
        return conversation_id

    def close_conversation(self, conversation_id: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """
                UPDATE conversations
                SET ended_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (conversation_id,),
            )

    def log_message(
        self,
        conversation_id: str,
        direction: str,
        *,
        message_id: Optional[int],
        request_id: Optional[int],
        type_code: Optional[int],
        status_code: Optional[int],
        payload: Optional[JsonDict],
        error: Optional[str] = None,
    ) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO conversation_messages (
                    conversation_id,
                    direction,
                    message_id,
                    request_id,
                    type_code,
                    status_code,
                    payload,
                    error
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    conversation_id,
                    direction,
                    message_id,
                    request_id,
                    type_code,
                    status_code,
                    _serialize(payload),
                    error,
                ),
            )

    def log_error(
        self,
        conversation_id: Optional[str],
        *,
        execution_id: Optional[str],
        message_id: Optional[int],
        type_code: Optional[int],
        severity: str,
        message: str,
        payload: Optional[JsonDict] = None,
    ) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO error_logs (
                    conversation_id,
                    execution_id,
                    message_id,
                    type_code,
                    severity,
                    message,
                    payload
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    conversation_id,
                    execution_id,
                    message_id,
                    type_code,
                    severity,
                    message,
                    _serialize(payload),
                ),
            )

    # -- Pipelines ----------------------------------------------------------------
    def list_pipelines(self) -> List[JsonDict]:
        rows = self._conn.execute("SELECT * FROM pipelines ORDER BY id ASC").fetchall()
        return [self._hydrate_pipeline(row) for row in rows]

    def get_pipeline(self, pipeline_id: str) -> Optional[JsonDict]:
        row = self._conn.execute(
            "SELECT * FROM pipelines WHERE id = ?", (pipeline_id,)
        ).fetchone()
        if not row:
            return None
        return self._hydrate_pipeline(row)

    def upsert_pipeline(self, pipeline: JsonDict) -> None:
        full_graph = pipeline.get("full_graph")
        if full_graph is None and "nodes" in pipeline:
            full_graph = {"pipeline": {"nodes": pipeline["nodes"]}}
        description = pipeline.get("description")
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO pipelines (id, name, full_graph, description, metadata)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    full_graph=excluded.full_graph,
                    description=excluded.description,
                    metadata=excluded.metadata,
                    updated_at=CURRENT_TIMESTAMP
                """,
                (
                    pipeline["id"],
                    pipeline["name"],
                    _serialize(full_graph),
                    description,
                    _serialize(pipeline.get("metadata")),
                ),
            )

    def _hydrate_pipeline(self, row: sqlite3.Row) -> JsonDict:
        payload = dict(row)
        full_graph = _deserialize(payload.get("full_graph")) or {}
        payload["full_graph"] = full_graph
        payload["nodes"] = (
            full_graph.get("pipeline", {}).get("nodes", []) if isinstance(full_graph, dict) else []
        )
        payload["metadata"] = _deserialize(payload.get("metadata")) or {}
        return payload

    # -- Executions ----------------------------------------------------------------
    def create_execution(
        self,
        *,
        pipeline_id: Optional[str],
        source: str,
        graph: Optional[JsonDict],
        params: JsonDict,
        requested_by: str,
        status: str,
        output: JsonDict,
    ) -> JsonDict:
        execution_id = str(uuid4())
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO executions (
                    id,
                    pipeline_id,
                    source,
                    graph,
                    params,
                    status,
                    requested_by,
                    output_file,
                    output_content
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    execution_id,
                    pipeline_id,
                    source,
                    _serialize(graph),
                    _serialize(params),
                    status,
                    requested_by,
                    output.get("file"),
                    output.get("content"),
                ),
            )
        self.add_execution_event(
            execution_id,
            "status",
            f"Execution created with status '{status}'",
            {"status": status, "source": source},
        )
        execution = self.get_execution(execution_id)
        assert execution is not None
        return execution

    def get_execution(self, execution_id: str) -> Optional[JsonDict]:
        row = self._conn.execute(
            "SELECT * FROM executions WHERE id = ?", (execution_id,)
        ).fetchone()
        if not row:
            return None
        payload = dict(row)
        payload["graph"] = _deserialize(payload.get("graph")) or {}
        payload["params"] = _deserialize(payload.get("params")) or {}
        payload["output"] = {
            "file": payload.pop("output_file"),
            "content": payload.pop("output_content"),
        }
        return payload

    def update_execution_status(
        self,
        execution_id: str,
        *,
        status: str,
        output: Optional[JsonDict] = None,
    ) -> None:
        output = output or {}
        with self._lock, self._conn:
            self._conn.execute(
                """
                UPDATE executions
                SET status = ?,
                    output_file = COALESCE(?, output_file),
                    output_content = COALESCE(?, output_content),
                    completed_at = CASE
                        WHEN ? IN ('finished', 'failed', 'stopped')
                        THEN CURRENT_TIMESTAMP
                        ELSE completed_at
                    END
                WHERE id = ?
                """,
                (
                    status,
                    output.get("file"),
                    output.get("content"),
                    status,
                    execution_id,
                ),
            )
        self.add_execution_event(
            execution_id,
            "status",
            f"Execution status updated to '{status}'",
            {"status": status},
        )

    def add_execution_event(
        self, execution_id: str, event_type: str, description: str, payload: JsonDict
    ) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO execution_events (
                    execution_id,
                    event_type,
                    description,
                    payload
                )
                VALUES (?, ?, ?, ?)
                """,
                (
                    execution_id,
                    event_type,
                    description,
                    _serialize(payload),
                ),
            )

    def count_active_executions(self) -> int:
        row = self._conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM executions
            WHERE status IN ('running', 'queued')
            """
        ).fetchone()
        return int(row["cnt"]) if row else 0


_PIPELINES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS pipelines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    full_graph TEXT,
    description TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""

_SCHEMA = (
    _PIPELINES_TABLE_SQL
    + """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    email TEXT,
    roles TEXT,
    metadata TEXT,
    last_login TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    client_ip TEXT,
    client_port INTEGER,
    user_agent TEXT,
    origin TEXT,
    path TEXT,
    status TEXT,
    connected_at TEXT DEFAULT CURRENT_TIMESTAMP,
    disconnected_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    connection_id TEXT,
    context TEXT,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    ended_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    direction TEXT CHECK(direction IN ('incoming','outgoing')),
    message_id INTEGER,
    request_id INTEGER,
    type_code INTEGER,
    status_code INTEGER,
    payload TEXT,
    error TEXT,
    recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    pipeline_id TEXT,
    source TEXT,
    graph TEXT,
    params TEXT,
    status TEXT,
    requested_by TEXT,
    output_file TEXT,
    output_content TEXT,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE SET NULL,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS execution_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id TEXT,
    event_type TEXT,
    description TEXT,
    payload TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT,
    execution_id TEXT,
    message_id INTEGER,
    type_code INTEGER,
    severity TEXT,
    message TEXT,
    payload TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
    FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE SET NULL
);
"""
)
