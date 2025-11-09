"""Stateful services (database, handlers, routing)."""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, Tuple

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
    CODE_STOP_EXECUTION_ERROR,
    CODE_STOP_EXECUTION_OK,
    CODE_TOO_MANY_EXECUTIONS,
    CODE_USER_DATA,
    CODE_USER_DATA_ERROR,
    CODE_UNKNOWN_TYPE,
)
from .config import DB_PATH, PASSWORD, USERNAME, default_server_state
from .context import RequestContext
from .dag_runner import decode_summary, encode_summary, run_graph
from .protocol import ProtocolError

REQUEST_TYPES = {100, 101, 102, 103, 104, 106, 107}

DATABASE = SQLitePersistenceGateway(DB_PATH)
DATABASE.initialize()

SERVER_STATE: Dict[str, Any] = default_server_state()
LOGGER = logging.getLogger("alger-server")


def _log(level: int, context: RequestContext, message: str, *args: Any) -> None:
    if context and context.log_label:
        LOGGER.log(level, "%s " + message, context.log_label, *args)
    else:
        LOGGER.log(level, message, *args)


def reset_server_state() -> None:
    SERVER_STATE.clear()
    SERVER_STATE.update(default_server_state())
    DATABASE.reset()


def _execution_blocker() -> Tuple[int, Dict[str, Any]] | None:
    if SERVER_STATE["maintenance_mode"]:
        return (
            CODE_MAINTENANCE_MODE,
            {"error": "Pipelines unavailable while maintenance mode is active."},
        )
    if SERVER_STATE["executions_halted"]:
        return (
            CODE_EXECUTIONS_HALTED,
            {"error": "Pipeline executions are halted."},
        )
    active_count = DATABASE.count_active_executions()
    if active_count >= SERVER_STATE["max_concurrent_executions"]:
        return (
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
        return CODE_LOGIN_OK, {"status": "login-ok"}
    return CODE_LOGIN_UNKNOWN, {"error": "unknown credentials or password mismatch"}


def handle_get_user_data(message, context):
    user_id = message.content.get("userId")
    if not user_id:
        return CODE_USER_DATA_ERROR, {"error": "userId is required"}
    if str(user_id) != context.username:
        return CODE_USER_DATA_ERROR, {"error": f"user '{user_id}' not found"}

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
    return CODE_USER_DATA, {"user": profile}


def handle_full_pipeline(message, context):
    dataset = DATABASE.list_pipelines()
    if not dataset:
        return CODE_PIPELINE_FULL_ERROR, {"error": "no pipeline data available"}
    DATABASE.record_user_action(
        context.user_id,
        "list_pipelines",
        {"messageId": message.message_id, "pipelineCount": len(dataset)},
    )
    return CODE_PIPELINE_FULL, {"pipelines": dataset}


def handle_execute_from_db(message, context):
    pipeline_id = message.content.get("pipelineId")
    if not pipeline_id:
        return CODE_EXECUTION_FROM_DB_ERROR, {"error": "pipelineId is required"}
    pipeline = DATABASE.get_pipeline(pipeline_id)
    if not pipeline:
        return CODE_EXECUTION_FROM_DB_ERROR, {"error": "pipeline not found"}
    graph_payload = pipeline.get("full_graph")
    if not graph_payload:
        return CODE_EXECUTION_FROM_DB_ERROR, {"error": "pipeline graph missing"}

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
    return _run_and_finalize_execution(
        message=message,
        context=context,
        execution_id=execution["id"],
        graph_payload=graph_payload,
        success_code=CODE_EXECUTION_FROM_DB_OK,
        failure_code=CODE_EXECUTION_FROM_DB_ERROR,
    )


def handle_execute_from_payload(message, context):
    graph = message.content.get("graph")
    if not graph:
        return CODE_EXECUTION_FROM_PAYLOAD_ERROR, {"error": "graph definition missing"}

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
    return _run_and_finalize_execution(
        message=message,
        context=context,
        execution_id=execution["id"],
        graph_payload=graph,
        success_code=CODE_EXECUTION_FROM_PAYLOAD_OK,
        failure_code=CODE_EXECUTION_FROM_PAYLOAD_ERROR,
    )


def _run_and_finalize_execution(
    *,
    message,
    context,
    execution_id: str,
    graph_payload: Dict[str, Any],
    success_code: int,
    failure_code: int,
):
    strategy = message.content.get("strategy", "kahn")
    _log(
        logging.INFO,
        context,
        "Running DAG execution %s via strategy '%s'",
        execution_id,
        strategy,
    )
    try:
        _, summary = run_graph(graph_payload, strategy=strategy)
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
            payload={"pipelineId": message.content.get("pipelineId"), "strategy": strategy},
        )
        _log(
            logging.ERROR,
            context,
            "Execution %s failed: %s",
            execution_id,
            exc,
        )
        return failure_code, {"error": str(exc)}

    DATABASE.update_execution_status(
        execution_id,
        status="finished",
        output={"file": f"{execution_id}.json", "content": encode_summary(summary)},
    )
    DATABASE.add_execution_event(
        execution_id,
        "summary",
        "Execution finished with DAG summary.",
        summary,
    )
    DATABASE.record_user_action(
        context.user_id,
        "execute_pipeline",
        {
            "messageId": message.message_id,
            "executionId": execution_id,
            "strategy": strategy,
            "pipelineId": message.content.get("pipelineId"),
        },
    )
    _log(
        logging.INFO,
        context,
        "Execution %s finished successfully",
        execution_id,
    )
    return success_code, {
        "executionId": execution_id,
        "status": "pipeline-execution-started",
    }


def handle_stop_execution(message, context):
    execution_id = message.content.get("executionId")
    if not execution_id:
        return CODE_STOP_EXECUTION_ERROR, {"error": "executionId is required"}

    execution = DATABASE.get_execution(execution_id)
    if not execution:
        return CODE_STOP_EXECUTION_ERROR, {"error": "execution not found"}

    DATABASE.update_execution_status(execution_id, status="stopped")
    DATABASE.record_user_action(
        context.user_id,
        "stop_execution",
        {"executionId": execution_id, "messageId": message.message_id},
    )
    _log(logging.WARNING, context, "Execution %s stopped by client", execution_id)
    return CODE_STOP_EXECUTION_OK, {
        "executionId": execution_id,
        "status": "stopped",
    }


def handle_request_output(message, context):
    execution_id = message.content.get("executionId")
    if not execution_id:
        return CODE_PIPELINE_FINISHED_ERROR, {"error": "executionId is required"}

    execution = DATABASE.get_execution(execution_id)
    if not execution:
        return CODE_PIPELINE_FINISHED_ERROR, {"error": "execution not found"}

    if execution.get("status") == "running":
        DATABASE.update_execution_status(execution_id, status="finished")
        execution = DATABASE.get_execution(execution_id) or execution

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
        execution.get("status"),
    )
    return CODE_PIPELINE_FINISHED_OK, {
        "executionId": execution_id,
        "file": execution["output"]["file"],
        "content": decoded_content,
    }


Handler = Callable[[Any, RequestContext], Tuple[int, Dict[str, Any]]]

MESSAGE_HANDLERS: Dict[int, Handler] = {
    100: handle_login,
    101: handle_get_user_data,
    102: handle_full_pipeline,
    103: handle_execute_from_db,
    104: handle_execute_from_payload,
    106: handle_stop_execution,
    107: handle_request_output,
}


def route_message(message, context):
    if message.type_code not in REQUEST_TYPES:
        from .protocol import ProtocolError
        raise ProtocolError(
            f"Unsupported message type: {message.type_code}",
            error_code=396,
        )
    handler = MESSAGE_HANDLERS[message.type_code]
    return handler(message, context)
