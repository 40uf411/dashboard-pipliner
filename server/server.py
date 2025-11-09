"""WebSocket server implementing the Alger protocol.

The server enforces a strict request/response cadence with incrementing
message identifiers and basic credential checks delivered via the
connection query string.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, Tuple
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from websockets import ConnectionClosed
from websockets.exceptions import InvalidHandshake
from websockets.server import WebSocketServerProtocol, serve

SUBPROTOCOL = "alger"
USERNAME = "admin"
PASSWORD = "admin"
HOST = "0.0.0.0"
PORT = 8765

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
LOGGER = logging.getLogger("alger-server")

REQUEST_TYPES = {100, 101, 102, 103, 104, 106, 107}

CODE_LOGIN_OK = 200
CODE_LOGIN_UNKNOWN = 300
CODE_USER_DATA = 201
CODE_USER_DATA_ERROR = 301
CODE_PIPELINE_FULL = 202
CODE_PIPELINE_FULL_ERROR = 302
CODE_EXECUTION_FROM_DB_OK = 203
CODE_EXECUTION_FROM_DB_ERROR = 303
CODE_EXECUTION_FROM_PAYLOAD_OK = 204
CODE_EXECUTION_FROM_PAYLOAD_ERROR = 304
CODE_STATUS_UPDATE_OK = 205
CODE_STATUS_UPDATE_ERROR = 305
CODE_STOP_EXECUTION_OK = 206
CODE_STOP_EXECUTION_ERROR = 306
CODE_PIPELINE_FINISHED_OK = 207
CODE_PIPELINE_FINISHED_ERROR = 307
CODE_MESSAGE_ID_ERROR = 395
CODE_UNKNOWN_TYPE = 396
CODE_TOO_MANY_EXECUTIONS = 397
CODE_EXECUTIONS_HALTED = 398
CODE_MAINTENANCE_MODE = 399


def _default_server_state() -> Dict[str, Any]:
    return {
        "active_executions": 0,
        "max_concurrent_executions": 3,
        "executions": {},
        "executions_halted": False,
        "maintenance_mode": False,
        "pipelines": {
            "demo": {
                "id": "demo",
                "name": "Demo Pipeline",
                "nodes": ["extract", "transform", "load"],
            }
        },
    }


SERVER_STATE: Dict[str, Any] = _default_server_state()


def reset_server_state() -> None:
    """Reset mutable server state (useful for tests)."""
    SERVER_STATE.clear()
    SERVER_STATE.update(_default_server_state())


class ProtocolError(Exception):
    """Raised when a message violates the Alger protocol."""

    def __init__(self, message: str, error_code: int = CODE_UNKNOWN_TYPE) -> None:
        super().__init__(message)
        self.error_code = error_code


@dataclass
class AlgerMessage:
    """Typed representation of an Alger protocol frame."""

    message_id: int
    request_id: int
    type_code: int
    content: Dict[str, Any]

    @classmethod
    def parse(cls, raw_payload: str) -> "AlgerMessage":
        """Parse and validate the incoming JSON payload."""
        try:
            decoded = json.loads(raw_payload)
        except json.JSONDecodeError as exc:
            raise ProtocolError("Payload is not valid JSON") from exc

        try:
            message_id = int(decoded["id"])
            request_id = int(decoded["requestId"])
            type_code = int(decoded["type"])
            content_raw = decoded["content"]
        except (KeyError, TypeError, ValueError) as exc:
            raise ProtocolError("Missing or non-integer protocol fields") from exc

        if not isinstance(content_raw, str):
            raise ProtocolError("Content field must be a JSON-encoded string")

        try:
            content = json.loads(content_raw or "{}")
        except json.JSONDecodeError as exc:
            raise ProtocolError("Content must contain valid JSON") from exc

        return cls(
            message_id=message_id,
            request_id=request_id,
            type_code=type_code,
            content=content,
        )

    def to_json(self) -> str:
        """Serialize the message back to the wire format."""
        payload = {
            "id": self.message_id,
            "requestId": self.request_id,
            "type": self.type_code,
            "content": json.dumps(self.content),
        }
        return json.dumps(payload)


def ensure_credentials(path: str) -> None:
    """Ensure the connection query string carries valid credentials."""
    parsed = urlparse(path)
    params = parse_qs(parsed.query)
    username = params.get("username", [None])[0]
    password = params.get("password", [None])[0]

    if username != USERNAME or password != PASSWORD:
        raise PermissionError("Invalid username/password pair")


def build_status_response(
    message_id: int,
    request_id: int,
    type_code: int,
    content: Dict[str, Any],
) -> AlgerMessage:
    """Helper for constructing Alger messages."""
    return AlgerMessage(
        message_id=message_id,
        request_id=request_id,
        type_code=type_code,
        content=content,
    )


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
    if SERVER_STATE["active_executions"] >= SERVER_STATE["max_concurrent_executions"]:
        return (
            CODE_TOO_MANY_EXECUTIONS,
            {"error": "Too many pipeline execution requests in progress."},
        )
    return None


def handle_login(message: AlgerMessage) -> Tuple[int, Dict[str, Any]]:
    username = message.content.get("username")
    password = message.content.get("password")
    if username == USERNAME and password == PASSWORD:
        return CODE_LOGIN_OK, {"status": "login-ok"}
    return CODE_LOGIN_UNKNOWN, {"error": "unknown credentials or password mismatch"}


def handle_get_user_data(message: AlgerMessage) -> Tuple[int, Dict[str, Any]]:
    user_id = message.content.get("userId")
    if not user_id:
        return CODE_USER_DATA_ERROR, {"error": "userId is required"}
    if str(user_id) != "admin":
        return CODE_USER_DATA_ERROR, {"error": f"user '{user_id}' not found"}

    profile = {
        "id": "admin",
        "name": "Administrator",
        "roles": ["admin", "operator"],
        "email": "admin@example.com",
    }
    return CODE_USER_DATA, {"user": profile}


def handle_full_pipeline(message: AlgerMessage) -> Tuple[int, Dict[str, Any]]:
    dataset = list(SERVER_STATE["pipelines"].values())
    if not dataset:
        return CODE_PIPELINE_FULL_ERROR, {"error": "no pipeline data available"}
    return CODE_PIPELINE_FULL, {"pipelines": dataset}


def handle_execute_from_db(message: AlgerMessage) -> Tuple[int, Dict[str, Any]]:
    pipeline_id = message.content.get("pipelineId")
    if not pipeline_id:
        return CODE_EXECUTION_FROM_DB_ERROR, {"error": "pipelineId is required"}
    if pipeline_id not in SERVER_STATE["pipelines"]:
        return CODE_EXECUTION_FROM_DB_ERROR, {"error": "pipeline not found"}

    blocker = _execution_blocker()
    if blocker:
        return blocker

    execution_id = str(uuid4())
    SERVER_STATE["executions"][execution_id] = {
        "id": execution_id,
        "pipelineId": pipeline_id,
        "params": message.content.get("params", {}),
        "status": "running",
        "output": {"file": f"{pipeline_id}-output.txt", "content": "sample-data"},
    }
    SERVER_STATE["active_executions"] += 1
    return CODE_EXECUTION_FROM_DB_OK, {
        "executionId": execution_id,
        "status": "pipeline-execution-started",
    }


def handle_execute_from_payload(message: AlgerMessage) -> Tuple[int, Dict[str, Any]]:
    graph = message.content.get("graph")
    if not graph:
        return CODE_EXECUTION_FROM_PAYLOAD_ERROR, {"error": "graph definition missing"}

    blocker = _execution_blocker()
    if blocker:
        return blocker

    execution_id = str(uuid4())
    SERVER_STATE["executions"][execution_id] = {
        "id": execution_id,
        "pipelineId": "ad-hoc",
        "graph": graph,
        "params": message.content.get("params", {}),
        "status": "running",
        "output": {"file": "ad-hoc-output.txt", "content": "sample-data"},
    }
    SERVER_STATE["active_executions"] += 1
    return CODE_EXECUTION_FROM_PAYLOAD_OK, {
        "executionId": execution_id,
        "status": "ad-hoc-execution-started",
    }


def handle_stop_execution(message: AlgerMessage) -> Tuple[int, Dict[str, Any]]:
    execution_id = message.content.get("executionId")
    if not execution_id:
        return CODE_STOP_EXECUTION_ERROR, {"error": "executionId is required"}

    execution = SERVER_STATE["executions"].get(execution_id)
    if not execution:
        return CODE_STOP_EXECUTION_ERROR, {"error": "execution not found"}

    execution["status"] = "stopped"
    SERVER_STATE["active_executions"] = max(0, SERVER_STATE["active_executions"] - 1)
    return CODE_STOP_EXECUTION_OK, {
        "executionId": execution_id,
        "status": "stopped",
    }


def handle_request_output(message: AlgerMessage) -> Tuple[int, Dict[str, Any]]:
    execution_id = message.content.get("executionId")
    if not execution_id:
        return CODE_PIPELINE_FINISHED_ERROR, {"error": "executionId is required"}

    execution = SERVER_STATE["executions"].get(execution_id)
    if not execution:
        return CODE_PIPELINE_FINISHED_ERROR, {"error": "execution not found"}

    return CODE_PIPELINE_FINISHED_OK, {
        "executionId": execution_id,
        "file": execution["output"]["file"],
        "content": execution["output"]["content"],
    }


MESSAGE_HANDLERS = {
    100: handle_login,
    101: handle_get_user_data,
    102: handle_full_pipeline,
    103: handle_execute_from_db,
    104: handle_execute_from_payload,
    106: handle_stop_execution,
    107: handle_request_output,
}


def route_message(message: AlgerMessage) -> Tuple[int, Dict[str, Any]]:
    """Return response type and content for a given incoming message."""
    if message.type_code not in REQUEST_TYPES:
        raise ProtocolError(
            f"Unsupported message type: {message.type_code}",
            error_code=CODE_UNKNOWN_TYPE,
        )

    # if message.request_id not in (0,):
    #     raise ProtocolError(
    #         "requestId must be 0 for client-initiated commands",
    #         error_code=CODE_MESSAGE_ID_ERROR,
    #     )

    handler = MESSAGE_HANDLERS[message.type_code]
    return handler(message)


async def alger_handler(websocket: WebSocketServerProtocol) -> None:
    """Handle each WebSocket client adhering to Alger protocol."""
    try:
        ensure_credentials(websocket.path)
    except PermissionError as exc:
        LOGGER.warning("Authentication failed: %s", exc)
        await websocket.close(code=4401, reason=str(exc))
        return

    if websocket.subprotocol != SUBPROTOCOL:
        LOGGER.warning("Rejected client without Alger subprotocol")
        await websocket.close(code=4406, reason="Subprotocol 'alger' required")
        return

    last_message_id = 0
    LOGGER.info("Client connected from %s", websocket.remote_address)

    while True:
        try:
            raw_message = await websocket.recv()
        except ConnectionClosed:
            LOGGER.info("Client disconnected")
            break

        try:
            message = AlgerMessage.parse(raw_message)
        except ProtocolError as exc:
            LOGGER.error("Protocol violation: %s", exc)
            await websocket.send(
                build_status_response(
                    message_id=last_message_id + 1,
                    request_id=0,
                    type_code=exc.error_code,
                    content={"error": str(exc)},
                ).to_json()
            )
            last_message_id += 1
            continue

        expected_id = last_message_id + 1
        if message.message_id != expected_id:
            LOGGER.warning(
                "Incorrect message id. Expected %s, got %s",
                expected_id,
                message.message_id,
            )
            error_response = build_status_response(
                message_id=expected_id,
                request_id=message.message_id,
                type_code=CODE_MESSAGE_ID_ERROR,
                content={
                    "error": "incorrect message id",
                    "expectedId": expected_id,
                    "receivedId": message.message_id,
                },
            )
            await websocket.send(error_response.to_json())
            last_message_id = expected_id
            continue

        last_message_id = message.message_id

        try:
            response_type, response_content = route_message(message)
        except ProtocolError as exc:
            response_type = exc.error_code
            response_content = {"error": str(exc)}

        response = build_status_response(
            message_id=last_message_id + 1,
            request_id=message.message_id,
            type_code=response_type,
            content=response_content,
        )
        await websocket.send(response.to_json())
        last_message_id = response.message_id


async def run_server(stop_event: asyncio.Event | None = None) -> None:
    """Start the Alger WebSocket server until cancelled or stop_event set."""
    LOGGER.info("Starting Alger WebSocket server on %s:%s", HOST, PORT)
    try:
        async with serve(
            alger_handler,
            HOST,
            PORT,
            subprotocols=[SUBPROTOCOL],
        ):
            if stop_event is None:
                await asyncio.Future()  # Run indefinitely.
            else:
                await stop_event.wait()
    except InvalidHandshake as exc:
        LOGGER.error("Failed to start server handshake: %s", exc)
        raise


async def main() -> None:
    """Entry point used by the CLI runner."""
    await run_server()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        LOGGER.info("Server shutdown requested via keyboard interrupt.")
