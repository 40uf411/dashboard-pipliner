"""FastAPI surface for interacting with Alger execution artifacts."""

from __future__ import annotations

import json
import mimetypes
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional
from urllib.parse import quote

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.config import DB_PATH, OUTPUTS_DIR

app = FastAPI(title="Zofia Execution API", version="0.1.0")
OUTPUTS_ROOT = OUTPUTS_DIR.resolve()


class ExecutionOutput(BaseModel):
    file: Optional[str] = None
    content: Optional[str] = None


class ExecutionSummary(BaseModel):
    id: str
    pipeline_id: Optional[str] = None
    source: Optional[str] = None
    graph: Optional[Dict[str, Any]] = None
    params: Dict[str, Any] = Field(default_factory=dict)
    status: Optional[str] = None
    requested_by: Optional[str] = None
    output: ExecutionOutput
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class FileInfo(BaseModel):
    path: str
    name: str
    category: Optional[str] = None
    size_bytes: int
    media_type: Optional[str] = None
    modified_at: str
    download_url: str


def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Return a short-lived SQLite connection per request."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def _deserialize_json(value: Optional[str]) -> Optional[Dict[str, Any]]:
    if value in (None, "", "null"):
        return None
    return json.loads(value)


def _row_to_execution(row: sqlite3.Row) -> ExecutionSummary:
    return ExecutionSummary(
        id=row["id"],
        pipeline_id=row["pipeline_id"],
        source=row["source"],
        graph=_deserialize_json(row["graph"]),
        params=_deserialize_json(row["params"]) or {},
        status=row["status"],
        requested_by=row["requested_by"],
        output=ExecutionOutput(
            file=row["output_file"],
            content=row["output_content"],
        ),
        started_at=row["started_at"],
        completed_at=row["completed_at"],
    )


def _get_execution_or_404(
    conn: sqlite3.Connection, execution_id: str
) -> ExecutionSummary:
    row = conn.execute(
        """
        SELECT
            id,
            pipeline_id,
            source,
            graph,
            params,
            status,
            requested_by,
            output_file,
            output_content,
            started_at,
            completed_at
        FROM executions
        WHERE id = ?
        """,
        (execution_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(
            status_code=404, detail=f"Execution '{execution_id}' was not found."
        )
    return _row_to_execution(row)


def _execution_root(execution_id: str) -> Path:
    root = (OUTPUTS_ROOT / execution_id).resolve()
    try:
        root.relative_to(OUTPUTS_ROOT)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid execution id.") from exc
    return root


def _resolve_requested_file(root: Path, relative_path: str) -> Path:
    if not relative_path:
        raise HTTPException(status_code=400, detail="File path must be provided.")
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid file path.") from exc
    return candidate


def _collect_files(execution_id: str, root: Path) -> List[FileInfo]:
    if not root.exists():
        return []

    files: List[FileInfo] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(root)
        posix_path = relative.as_posix()
        category = relative.parts[0] if len(relative.parts) > 1 else None
        stat = path.stat()
        media_type, _ = mimetypes.guess_type(path.name)
        files.append(
            FileInfo(
                path=posix_path,
                name=path.name,
                category=category,
                size_bytes=stat.st_size,
                media_type=media_type,
                modified_at=datetime.fromtimestamp(stat.st_mtime).isoformat(),
                download_url=f"/executions/{execution_id}/files/{quote(posix_path)}",
            )
        )
    return files


@app.get("/executions", response_model=List[ExecutionSummary])
def list_executions(
    conn: sqlite3.Connection = Depends(get_db),
) -> List[ExecutionSummary]:
    rows = conn.execute(
        """
        SELECT
            id,
            pipeline_id,
            source,
            graph,
            params,
            status,
            requested_by,
            output_file,
            output_content,
            started_at,
            completed_at
        FROM executions
        ORDER BY started_at DESC
        """
    ).fetchall()
    return [_row_to_execution(row) for row in rows]


@app.get("/executions/{execution_id}/files", response_model=List[FileInfo])
def list_execution_files(
    execution_id: str, conn: sqlite3.Connection = Depends(get_db)
) -> List[FileInfo]:
    _get_execution_or_404(conn, execution_id)
    root = _execution_root(execution_id)
    return _collect_files(execution_id, root)


@app.get("/executions/{execution_id}/files/{file_path:path}")
def stream_execution_file(
    execution_id: str,
    file_path: str,
    conn: sqlite3.Connection = Depends(get_db),
) -> FileResponse:
    _get_execution_or_404(conn, execution_id)
    root = _execution_root(execution_id)
    if not root.exists():
        raise HTTPException(
            status_code=404, detail="No files recorded for this execution."
        )
    requested_file = _resolve_requested_file(root, file_path)
    if not requested_file.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"File '{file_path}' was not found for execution '{execution_id}'.",
        )
    media_type, _ = mimetypes.guess_type(requested_file.name)
    return FileResponse(
        path=requested_file,
        media_type=media_type or "application/octet-stream",
        filename=requested_file.name,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
