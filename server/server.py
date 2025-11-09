"""WebSocket server implementing the Alger protocol."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

from websockets import ConnectionClosed
from websockets.exceptions import InvalidHandshake
from websockets.server import WebSocketServerProtocol, serve

from app import (
    HOST,
    PORT,
    SUBPROTOCOL,
    AlgerMessage,
    ProtocolError,
    RequestContext,
    build_status_response,
    ensure_credentials,
)
from app.codes import (
    CODE_EXECUTION_FROM_DB_ERROR,
    CODE_EXECUTION_FROM_DB_OK,
    CODE_EXECUTION_FROM_PAYLOAD_ERROR,
    CODE_EXECUTION_FROM_PAYLOAD_OK,
    CODE_EXECUTIONS_HALTED,
    CODE_LOGIN_OK,
    CODE_LOGIN_UNKNOWN,
    CODE_MAINTENANCE_MODE,
    CODE_MESSAGE_ID_ERROR,
    CODE_PIPELINE_FINISHED_ERROR,
    CODE_PIPELINE_FINISHED_OK,
    CODE_PIPELINE_FULL,
    CODE_PIPELINE_FULL_ERROR,
    CODE_STATUS_UPDATE_ERROR,
    CODE_STATUS_UPDATE_OK,
    CODE_STOP_EXECUTION_ERROR,
    CODE_STOP_EXECUTION_OK,
    CODE_TOO_MANY_EXECUTIONS,
    CODE_UNKNOWN_TYPE,
    CODE_USER_DATA,
    CODE_USER_DATA_ERROR,
)
from app.services import DATABASE, reset_server_state, route_message

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
LOGGER = logging.getLogger("alger-server")

__all__ = [
    "HOST",
    "PORT",
    "SUBPROTOCOL",
    "CODE_EXECUTION_FROM_DB_ERROR",
    "CODE_EXECUTION_FROM_DB_OK",
    "CODE_EXECUTION_FROM_PAYLOAD_ERROR",
    "CODE_EXECUTION_FROM_PAYLOAD_OK",
    "CODE_EXECUTIONS_HALTED",
    "CODE_LOGIN_OK",
    "CODE_LOGIN_UNKNOWN",
    "CODE_MAINTENANCE_MODE",
    "CODE_MESSAGE_ID_ERROR",
    "CODE_PIPELINE_FINISHED_ERROR",
    "CODE_PIPELINE_FINISHED_OK",
    "CODE_PIPELINE_FULL",
    "CODE_PIPELINE_FULL_ERROR",
    "CODE_STATUS_UPDATE_ERROR",
    "CODE_STATUS_UPDATE_OK",
    "CODE_STOP_EXECUTION_ERROR",
    "CODE_STOP_EXECUTION_OK",
    "CODE_TOO_MANY_EXECUTIONS",
    "CODE_UNKNOWN_TYPE",
    "CODE_USER_DATA",
    "CODE_USER_DATA_ERROR",
    "reset_server_state",
    "run_server",
    "main",
]


def _log_message(conversation_id: str | None, direction: str, payload: Dict[str, Any]) -> None:
    if not conversation_id:
        return
    DATABASE.log_message(
        conversation_id,
        direction,
        message_id=payload.get("id"),
        request_id=payload.get("requestId"),
        type_code=payload.get("type"),
        status_code=payload.get("status_code"),
        payload=payload.get("body"),
        error=payload.get("error"),
    )


async def alger_handler(websocket: WebSocketServerProtocol) -> None:
    """Handle each WebSocket client adhering to Alger protocol."""
    connection_id: str | None = None
    conversation_id: str | None = None
    try:
        username = ensure_credentials(websocket.path)
    except PermissionError as exc:
        LOGGER.warning("Authentication failed: %s", exc)
        await websocket.close(code=4401, reason=str(exc))
        return

    if websocket.subprotocol != SUBPROTOCOL:
        LOGGER.warning("Rejected client without Alger subprotocol")
        await websocket.close(code=4406, reason="Subprotocol 'alger' required")
        return

    user = DATABASE.ensure_user(
        username,
        {
            "display_name": "Administrator",
            "email": "admin@example.com",
            "roles": ["admin", "operator"],
        },
    )
    remote_ip: str | None = None
    remote_port: int | None = None
    remote = websocket.remote_address
    if isinstance(remote, tuple) and remote:
        remote_ip = str(remote[0])
        if len(remote) > 1:
            try:
                remote_port = int(remote[1])
            except (TypeError, ValueError):
                remote_port = None
    elif remote:
        remote_ip = str(remote)

    client_info = {
        "ip": remote_ip,
        "port": remote_port,
        "user_agent": websocket.request_headers.get("User-Agent"),
        "origin": websocket.request_headers.get("Origin"),
        "path": websocket.path,
    }
    connection_id = DATABASE.open_connection(user["id"], client_info)
    conversation_id = DATABASE.open_conversation(user["id"], connection_id)
    context = RequestContext(
        user_id=user["id"],
        username=user["username"],
        connection_id=connection_id,
        conversation_id=conversation_id,
        client_ip=remote_ip,
    )

    last_message_id = 0
    LOGGER.info("Client connected from %s", websocket.remote_address)

    try:
        while True:
            try:
                raw_message = await websocket.recv()
            except ConnectionClosed:
                LOGGER.info("Client disconnected")
                break

            try:
                message = AlgerMessage.parse(raw_message, error_code=CODE_UNKNOWN_TYPE)
            except ProtocolError as exc:
                LOGGER.error("Protocol violation: %s", exc)
                error_response = build_status_response(
                    message_id=last_message_id + 1,
                    request_id=0,
                    type_code=exc.error_code,
                    content={"error": str(exc)},
                )
                await websocket.send(error_response.to_json())
                last_message_id += 1
                _log_message(
                    conversation_id,
                    "outgoing",
                    {
                        "id": error_response.message_id,
                        "requestId": error_response.request_id,
                        "type": error_response.type_code,
                        "status_code": error_response.type_code,
                        "body": {"content": error_response.content},
                        "error": str(exc),
                    },
                )
                continue

            _log_message(
                conversation_id,
                "incoming",
                {
                    "id": message.message_id,
                    "requestId": message.request_id,
                    "type": message.type_code,
                    "body": message.as_dict(),
                },
            )

            expected_id = last_message_id + 1
            if message.message_id != expected_id:
                LOGGER.warning(
                    "Incorrect message id. Expected %s, got %s",
                    expected_id,
                    message.message_id,
                )
                error_payload = {
                    "error": "incorrect message id",
                    "expectedId": expected_id,
                    "receivedId": message.message_id,
                }
                error_response = build_status_response(
                    message_id=expected_id,
                    request_id=message.message_id,
                    type_code=CODE_MESSAGE_ID_ERROR,
                    content=error_payload,
                )
                await websocket.send(error_response.to_json())
                _log_message(
                    conversation_id,
                    "outgoing",
                    {
                        "id": error_response.message_id,
                        "requestId": error_response.request_id,
                        "type": error_response.type_code,
                        "status_code": error_response.type_code,
                        "body": {"content": error_response.content},
                        "error": error_payload["error"],
                    },
                )
                last_message_id = expected_id
                continue

            last_message_id = message.message_id

            try:
                response_type, response_content = route_message(message, context)
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
            _log_message(
                conversation_id,
                "outgoing",
                {
                    "id": response.message_id,
                    "requestId": response.request_id,
                    "type": response.type_code,
                    "status_code": response.type_code,
                    "body": {"content": response.content},
                },
            )
            last_message_id = response.message_id
    finally:
        if conversation_id:
            DATABASE.close_conversation(conversation_id)
        if connection_id:
            DATABASE.close_connection(connection_id)


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
