"""Stateful services (database, handlers, routing)."""

from __future__ import annotations

import asyncio
import json
import logging
from time import perf_counter
from typing import Any, Callable, Coroutine, Dict, Optional, Tuple

import numpy as np

try:
    from PIL import Image
except Exception:  # Pillow is optional; fall back to NumPy artifacts if missing
    Image = None

from .dag import PipelineError
from .persistence import SQLitePersistenceGateway

from .codes import (
    CODE_EXECUTION_FROM_DB_ERROR,
    CODE_EXECUTION_FROM_DB_OK,
    CODE_EXECUTION_FROM_PAYLOAD_ERROR,
    CODE_EXECUTION_FROM_PAYLOAD_OK,
    CODE_EXECUTIONS_HALTED,
    CODE_LOGIN_OK,
    CODE_LOGIN_UNKNOWN,
    CODE_MAINTENANCE_MODE,
    CODE_PIPELINE_FINISHED_ERROR,
    CODE_PIPELINE_FINISHED_OK,
    CODE_PIPELINE_FULL,
    CODE_PIPELINE_FULL_ERROR,
    CODE_STATUS_UPDATE_ERROR,
    CODE_STATUS_UPDATE_OK,
    CODE_STOP_EXECUTION_ERROR,
    CODE_STOP_EXECUTION_OK,
    CODE_TOO_MANY_EXECUTIONS,
    CODE_USER_DATA,
    CODE_USER_DATA_ERROR,
    CODE_UNKNOWN_TYPE,
)
from .config import DB_PATH, OUTPUTS_DIR, PASSWORD, USERNAME, default_server_state
from .context import RequestContext
from .dag_runner import decode_summary, encode_summary, run_graph
from .protocol import ProtocolError

REQUEST_TYPES = {100, 101, 102, 103, 104, 106, 107}

DATABASE = SQLitePersistenceGateway(DB_PATH)
DATABASE.initialize()

SERVER_STATE: Dict[str, Any] = default_server_state()
LOGGER = logging.getLogger("alger-server")


HandlerResult = Tuple[int, Dict[str, Any], Optional[Coroutine[Any, Any, None]]]


def _log(level: int, context: RequestContext, message: str, *args: Any) -> None:
    if context and context.log_label:
        LOGGER.log(level, "%s " + message, context.log_label, *args)
    else:
        LOGGER.log(level, message, *args)


def _result(code: int, content: Dict[str, Any], post: Optional[Coroutine[Any, Any, None]] = None) -> HandlerResult:
    return code, content, post


def reset_server_state() -> None:
    SERVER_STATE.clear()
    SERVER_STATE.update(default_server_state())
    DATABASE.reset()


def _execution_blocker() -> HandlerResult | None:
    if SERVER_STATE["maintenance_mode"]:
        return _result(
            CODE_MAINTENANCE_MODE,
            {"error": "Pipelines unavailable while maintenance mode is active."},
        )
    if SERVER_STATE["executions_halted"]:
        return _result(
            CODE_EXECUTIONS_HALTED,
            {"error": "Pipeline executions are halted."},
        )
    active_count = DATABASE.count_active_executions()
    if active_count >= SERVER_STATE["max_concurrent_executions"]:
        return _result(
            CODE_TOO_MANY_EXECUTIONS,
            {
                "error": "Too many pipeline execution requests in progress.",
                "activeExecutions": active_count,
            },
        )
    return None


def handle_login(message, context):
    username = message.content.get("username")
    provided_password = message.content.get("password")
    success = username == USERNAME and provided_password == PASSWORD
    DATABASE.record_login_attempt(
        context.user_id,
        success,
        {
            "messageId": message.message_id,
            "requestedUsername": username,
        },
    )
    if success:
        DATABASE.record_user_action(
            context.user_id,
            "login",
            {"messageId": message.message_id},
        )
        return _result(CODE_LOGIN_OK, {"status": "login-ok"})
    return _result(CODE_LOGIN_UNKNOWN, {"error": "unknown credentials or password mismatch"})


def handle_get_user_data(message, context):
    user_id = message.content.get("userId")
    if not user_id:
        return _result(CODE_USER_DATA_ERROR, {"error": "userId is required"})
    if str(user_id) != context.username:
        return _result(CODE_USER_DATA_ERROR, {"error": f"user '{user_id}' not found"})

    user = DATABASE.ensure_user(
        context.username,
        {
            "display_name": "Administrator",
            "email": "admin@example.com",
            "roles": ["admin", "operator"],
        },
    )
    profile = {
        "id": user["username"],
        "name": user.get("display_name") or user["username"],
        "roles": user.get("roles") or [],
        "email": user.get("email"),
        "metadata": user.get("metadata") or {},
        "lastLogin": user.get("last_login"),
    }
    DATABASE.record_user_action(
        context.user_id,
        "get_user_data",
        {"messageId": message.message_id},
    )
    return _result(CODE_USER_DATA, {"user": profile})


def handle_full_pipeline(message, context):
    dataset = DATABASE.list_pipelines()
    if not dataset:
        return _result(CODE_PIPELINE_FULL_ERROR, {"error": "no pipeline data available"})
    DATABASE.record_user_action(
        context.user_id,
        "list_pipelines",
        {"messageId": message.message_id, "pipelineCount": len(dataset)},
    )
    return _result(CODE_PIPELINE_FULL, {"pipelines": dataset})


def handle_execute_from_db(message, context):
    pipeline_id = message.content.get("pipelineId")
    if not pipeline_id:
        return _result(CODE_EXECUTION_FROM_DB_ERROR, {"error": "pipelineId is required"})
    pipeline = DATABASE.get_pipeline(pipeline_id)
    if not pipeline:
        return _result(CODE_EXECUTION_FROM_DB_ERROR, {"error": "pipeline not found"})
    graph_payload = pipeline.get("full_graph")
    if not graph_payload:
        return _result(CODE_EXECUTION_FROM_DB_ERROR, {"error": "pipeline graph missing"})

    _log(logging.INFO, context, "Pipeline '%s' requested from DB", pipeline_id)
    blocker = _execution_blocker()
    if blocker:
        return blocker

    execution = DATABASE.create_execution(
        pipeline_id=pipeline_id,
        source="db",
        graph=graph_payload,
        params=message.content.get("params", {}),
        requested_by=context.user_id,
        status="running",
        output={"file": None, "content": None},
    )
    _log(
        logging.INFO,
        context,
        "Execution %s (pipeline=%s) created; starting DAG run",
        execution["id"],
        pipeline_id,
    )
    execution_coro = _run_and_finalize_execution(
        message=message,
        context=context,
        execution_id=execution["id"],
        graph_payload=graph_payload,
        pipeline_id=pipeline_id,
    )
    return _result(
        CODE_EXECUTION_FROM_DB_OK,
        {
            "executionId": execution["id"],
            "status": "pipeline-execution-started",
        },
        execution_coro,
    )


def handle_execute_from_payload(message, context):
    graph = message.content.get("graph")
    if not graph:
        return _result(CODE_EXECUTION_FROM_PAYLOAD_ERROR, {"error": "graph definition missing"})

    _log(logging.INFO, context, "Ad-hoc payload execution requested")
    blocker = _execution_blocker()
    if blocker:
        return blocker

    execution = DATABASE.create_execution(
        pipeline_id=None,
        source="payload",
        graph=graph,
        params=message.content.get("params", {}),
        requested_by=context.user_id,
        status="running",
        output={"file": None, "content": None},
    )
    _log(
        logging.INFO,
        context,
        "Execution %s (payload) created; starting DAG run",
        execution["id"],
    )
    execution_coro = _run_and_finalize_execution(
        message=message,
        context=context,
        execution_id=execution["id"],
        graph_payload=graph,
        pipeline_id=None,
    )
    return _result(
        CODE_EXECUTION_FROM_PAYLOAD_OK,
        {
            "executionId": execution["id"],
            "status": "pipeline-execution-started",
        },
        execution_coro,
    )


NODE_EXECUTION_DELAY_RANGE = (0.1, 0.35)
FORCED_TRACK_KINDS = {"simulation", "structural", "figure", "text", "log"}


def _slugify_token(value: Any, fallback: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        raw = fallback
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in raw)
    slug = slug.strip("-")
    return slug or fallback


def _safe_filename(value: Any, fallback: str) -> str:
    raw = str(value or "")
    if not raw:
        raw = fallback
    cleaned = "".join(ch if ch.isalnum() or ch in ("-", "_", ".") else "_" for ch in raw)
    cleaned = cleaned.strip("._")
    return cleaned or fallback


def _normalise_actor(actor: Any, fallback_id: str) -> Dict[str, str]:
    if isinstance(actor, dict):
        actor_id = (
            actor.get("id")
            or actor.get("userId")
            or actor.get("username")
            or actor.get("slug")
            or fallback_id
        )
        label = (
            actor.get("label")
            or actor.get("name")
            or actor.get("displayName")
            or actor.get("username")
            or str(actor_id)
        )
        return {"id": str(actor_id), "label": str(label)}
    if actor:
        return {"id": str(actor), "label": str(actor)}
    return {"id": fallback_id, "label": fallback_id}


def _resolve_pipeline_owner(pipeline_id: Optional[str], graph_payload: Dict[str, Any], fallback_user: str) -> Dict[str, str]:
    def _extract_from_meta(meta: Dict[str, Any]) -> Dict[str, str] | None:
        if not isinstance(meta, dict):
            return None
        owner = (
            meta.get("owner")
            or meta.get("ownerId")
            or meta.get("owner_id")
            or meta.get("createdBy")
            or meta.get("created_by")
        )
        if owner:
            return _normalise_actor(owner, fallback_user)
        server_meta = meta.get("server")
        if isinstance(server_meta, dict) and server_meta.get("user"):
            return _normalise_actor(server_meta["user"], fallback_user)
        return None

    if pipeline_id:
        pipeline = DATABASE.get_pipeline(pipeline_id)
        if pipeline:
            owner = _extract_from_meta(pipeline.get("metadata") or {})
            if owner:
                return owner

    candidate = None
    if isinstance(graph_payload, dict):
        root = graph_payload.get("pipeline")
        if isinstance(root, dict):
            candidate = _extract_from_meta(root.get("meta") or {})
        if not candidate:
            candidate = _extract_from_meta(graph_payload.get("meta") or {})
    return candidate or _normalise_actor(fallback_user, fallback_user)


def _should_track_node(node) -> bool:
    if getattr(node, "track_output", False):
        return True
    kind = getattr(node.node_type, "kind", "") or ""
    return kind.lower() in FORCED_TRACK_KINDS


def _prepare_image_array(value: np.ndarray) -> np.ndarray | None:
    arr = np.asarray(value)
    if arr.ndim == 3 and arr.shape[0] in (1, 3):
        arr = np.moveaxis(arr, 0, -1)
    if arr.ndim == 3 and arr.shape[2] == 1:
        arr = np.repeat(arr, 3, axis=2)
    if arr.ndim not in (2, 3):
        return None
    arr = arr.astype(np.float32)
    span = float(arr.max() - arr.min()) if arr.size else 0.0
    if span > 0:
        arr = (arr - arr.min()) / span
    elif arr.size:
        arr = arr - arr.min()
    arr = np.clip(arr * 255.0, 0, 255).astype(np.uint8)
    if arr.ndim == 2:
        arr = np.stack([arr] * 3, axis=2)
    elif arr.shape[2] not in (1, 3):
        return None
    return arr


def _write_tracked_output_file(execution_id: str, node, value: Any) -> Dict[str, Any] | None:
    exec_dir = OUTPUTS_DIR / str(execution_id)
    base_dir = exec_dir / _slugify_token(node.node_type.kind, "node")
    base_dir.mkdir(parents=True, exist_ok=True)
    stem = _safe_filename(node.node_id, "node")
    artifact: Dict[str, Any] | None = None

    def _export_numpy_payload(array: np.ndarray) -> Dict[str, Any]:
        if Image is not None:
            prepared = _prepare_image_array(array)
            if prepared is not None:
                path = base_dir / f"{stem}.jpg"
                Image.fromarray(prepared).save(path, format="JPEG", quality=90)
                return {"path": path, "format": "jpg"}
        path = base_dir / f"{stem}.npy"
        np.save(path, array)
        return {"path": path, "format": "npy"}

    def _finalize(path_obj, fmt):
        info = {
            "path": str(path_obj.relative_to(OUTPUTS_DIR)).replace("\\", "/"),
            "absolutePath": str(path_obj),
            "format": fmt,
        }
        try:
            info["size"] = path_obj.stat().st_size
        except OSError:
            info["size"] = None
        return info

    def _write_text(ext: str, text: str) -> Dict[str, Any]:
        path = base_dir / f"{stem}.{ext}"
        path.write_text(text, encoding="utf-8")
        return {"path": path, "format": ext}

    if isinstance(value, np.ndarray):
        artifact = _export_numpy_payload(value)
    elif isinstance(value, (bytes, bytearray)):
        path = base_dir / f"{stem}.bin"
        path.write_bytes(bytes(value))
        artifact = {"path": path, "format": "bin"}
    elif isinstance(value, str):
        artifact = _write_text("txt", value)
    elif isinstance(value, (int, float, bool)):
        artifact = _write_text("txt", str(value))
    elif isinstance(value, (dict, list)):
        serializable = value
        embed_image = None
        if isinstance(value, dict):
            serializable = dict(value)
            embed_image = serializable.pop("_image", None)
        if isinstance(embed_image, np.ndarray):
            image_artifact = _export_numpy_payload(embed_image)
            if serializable:
                meta_path = base_dir / f"{stem}.json"
                meta_path.write_text(json.dumps(serializable, indent=2, default=str), encoding="utf-8")
                image_artifact["metadata"] = _finalize(meta_path, "json")
            artifact = image_artifact
        else:
            path = base_dir / f"{stem}.json"
            path.write_text(json.dumps(serializable, indent=2, default=str), encoding="utf-8")
            artifact = {"path": path, "format": "json"}
    else:
        artifact = _write_text("txt", repr(value))

    if artifact:
        metadata_info = artifact.pop("metadata", None)
        path_obj = artifact["path"]
        if not isinstance(path_obj, str):
            artifact = _finalize(path_obj, artifact.get("format"))
        if metadata_info:
            artifact["metadata"] = metadata_info
        return artifact
    return None


def _persist_tracked_output(
    execution_id: str,
    node,
    node_output: Any,
    pipeline_owner: Dict[str, str],
    executor: Dict[str, str],
) -> None:
    if not _should_track_node(node):
        return
    if node_output is None:
        return
    try:
        artifact = _write_tracked_output_file(execution_id, node, node_output)
    except Exception:
        LOGGER.exception("Failed to persist tracked output for node %s", node.node_id)
        return
    if not artifact:
        return
    artifact["executionId"] = execution_id
    DATABASE.add_execution_event(
        execution_id,
        "tracked-output",
        f"Tracked output saved for node '{node.node_id}' ({node.node_type.kind}).",
        {
            "nodeId": node.node_id,
            "nodeKind": node.node_type.kind,
            "artifact": artifact,
            "pipelineOwner": pipeline_owner,
            "executedBy": executor,
        },
    )


async def _run_and_finalize_execution(
    *,
    message,
    context,
    execution_id: str,
    graph_payload: Dict[str, Any],
    pipeline_id: Optional[str],
) -> None:
    strategy = message.content.get("strategy", "kahn")
    _log(
        logging.INFO,
        context,
        "Running DAG execution %s via strategy '%s'",
        execution_id,
        strategy,
    )
    status_callback = context.status_callback
    request_id = message.message_id
    started_at = perf_counter()
    order_position = {"value": 0}
    pipeline_owner_actor = _resolve_pipeline_owner(pipeline_id, graph_payload, context.user_id)
    executor_actor = _normalise_actor(context.user_id, context.user_id)

    def _emit_node_status(error: Exception | None, node_id: str, node_kind: str, duration: float, predecessors: list[str]) -> None:
        if not status_callback:
            return
        order_position["value"] += 1
        payload = {
            "executionId": execution_id,
            "nodeId": node_id,
            "nodeKind": node_kind,
            "status": "error" if error else "success",
            "durationMs": round(duration * 1000, 3),
            "predecessors": predecessors,
            "order": order_position["value"],
        }
        if pipeline_id:
            payload["pipelineId"] = pipeline_id
        if error:
            payload["error"] = str(error)
        try:
            status_callback(
                CODE_STATUS_UPDATE_ERROR if error else CODE_STATUS_UPDATE_OK,
                payload,
                request_id,
            )
        except Exception:
            LOGGER.exception("Failed to emit status update for execution %s", execution_id)

    def observer(node_id, node, _node_input, node_output, duration, predecessors, error) -> None:
        _emit_node_status(error, node_id, node.node_type.kind, duration, predecessors)
        if not error:
            _persist_tracked_output(execution_id, node, node_output, pipeline_owner_actor, executor_actor)

    try:
        _, summary = await asyncio.to_thread(
            run_graph,
            graph_payload,
            strategy=strategy,
            observer=observer,
            simulate_delay_range=NODE_EXECUTION_DELAY_RANGE,
        )
    except PipelineError as exc:
        DATABASE.update_execution_status(
            execution_id,
            status="failed",
            output={"file": f"{execution_id}-error.json", "content": encode_summary({"error": str(exc)})},
        )
        DATABASE.log_error(
            context.conversation_id,
            execution_id=execution_id,
            message_id=message.message_id,
            type_code=message.type_code,
            severity="pipeline",
            message=str(exc),
            payload={"pipelineId": pipeline_id, "strategy": strategy},
        )
        _log(
            logging.ERROR,
            context,
            "Execution %s failed: %s",
            execution_id,
            exc,
        )
        if status_callback:
            status_callback(
                CODE_PIPELINE_FINISHED_ERROR,
                {
                    "executionId": execution_id,
                    "status": "error",
                    "error": str(exc),
                    "durationMs": round((perf_counter() - started_at) * 1000, 3),
                    "strategy": strategy,
                    "pipelineId": pipeline_id,
                },
                request_id,
            )
        return
    except Exception as exc:  # pragma: no cover - defensive
        LOGGER.exception("Unexpected DAG failure for execution %s", execution_id)
        DATABASE.update_execution_status(
            execution_id,
            status="failed",
            output={"file": f"{execution_id}-error.json", "content": encode_summary({"error": str(exc)})},
        )
        if status_callback:
            status_callback(
                CODE_PIPELINE_FINISHED_ERROR,
                {
                    "executionId": execution_id,
                    "status": "error",
                    "error": str(exc),
                    "durationMs": round((perf_counter() - started_at) * 1000, 3),
                    "strategy": strategy,
                    "pipelineId": pipeline_id,
                },
                request_id,
            )
        return

    DATABASE.update_execution_status(
        execution_id,
        status="finished",
        output={"file": f"{execution_id}.json", "content": encode_summary(summary)},
    )
    DATABASE.add_execution_event(
        execution_id,
        "summary",
        "Execution finished with DAG summary.",
        {
            **summary,
            "pipelineOwner": pipeline_owner_actor,
            "executedBy": executor_actor,
        },
    )
    DATABASE.record_user_action(
        context.user_id,
        "execute_pipeline",
        {
            "messageId": message.message_id,
            "executionId": execution_id,
            "strategy": strategy,
            "pipelineId": pipeline_id,
        },
    )
    _log(
        logging.INFO,
        context,
        "Execution %s finished successfully",
        execution_id,
    )
    if status_callback:
        status_callback(
            CODE_PIPELINE_FINISHED_OK,
            {
                "executionId": execution_id,
                "status": "success",
                "summary": summary,
                "durationMs": round((perf_counter() - started_at) * 1000, 3),
                "strategy": strategy,
                "pipelineId": pipeline_id,
            },
            request_id,
        )


def handle_stop_execution(message, context):
    execution_id = message.content.get("executionId")
    if not execution_id:
        return _result(CODE_STOP_EXECUTION_ERROR, {"error": "executionId is required"})

    execution = DATABASE.get_execution(execution_id)
    if not execution:
        return _result(CODE_STOP_EXECUTION_ERROR, {"error": "execution not found"})

    DATABASE.update_execution_status(execution_id, status="stopped")
    DATABASE.record_user_action(
        context.user_id,
        "stop_execution",
        {"executionId": execution_id, "messageId": message.message_id},
    )
    _log(logging.WARNING, context, "Execution %s stopped by client", execution_id)
    return _result(
        CODE_STOP_EXECUTION_OK,
        {
            "executionId": execution_id,
            "status": "stopped",
        },
    )


def handle_request_output(message, context):
    execution_id = message.content.get("executionId")
    if not execution_id:
        return _result(CODE_PIPELINE_FINISHED_ERROR, {"error": "executionId is required"})

    execution = DATABASE.get_execution(execution_id)
    if not execution:
        return _result(CODE_PIPELINE_FINISHED_ERROR, {"error": "execution not found"})

    status = execution.get("status")
    if status == "running":
        return _result(
            CODE_PIPELINE_FINISHED_ERROR,
            {"error": f"execution '{execution_id}' is still running"},
        )

    DATABASE.record_user_action(
        context.user_id,
        "request_output",
        {"executionId": execution_id, "messageId": message.message_id},
    )
    decoded_content = decode_summary(execution["output"]["content"])
    _log(
        logging.INFO,
        context,
        "Fetched output for execution %s (status=%s)",
        execution_id,
        status,
    )
    if status == "failed":
        return _result(
            CODE_PIPELINE_FINISHED_ERROR,
            {
                "executionId": execution_id,
                "status": status,
                "file": execution["output"]["file"],
                "content": decoded_content,
            },
        )
    if status != "finished":
        return _result(
            CODE_PIPELINE_FINISHED_ERROR,
            {"error": f"execution '{execution_id}' is not available (status={status})"},
        )
    return _result(
        CODE_PIPELINE_FINISHED_OK,
        {
            "executionId": execution_id,
            "file": execution["output"]["file"],
            "content": decoded_content,
        },
    )


Handler = Callable[[Any, RequestContext], HandlerResult]

MESSAGE_HANDLERS: Dict[int, Handler] = {
    100: handle_login,
    101: handle_get_user_data,
    102: handle_full_pipeline,
    103: handle_execute_from_db,
    104: handle_execute_from_payload,
    106: handle_stop_execution,
    107: handle_request_output,
}


def route_message(message, context) -> HandlerResult:
    if message.type_code not in REQUEST_TYPES:
        from .protocol import ProtocolError
        raise ProtocolError(
            f"Unsupported message type: {message.type_code}",
            error_code=396,
        )
    handler = MESSAGE_HANDLERS[message.type_code]
    return handler(message, context)
