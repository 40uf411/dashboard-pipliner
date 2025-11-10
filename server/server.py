"""WebSocket server implementing the Alger protocol."""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import Future
from typing import Any, Callable, Dict, Optional

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
    format="%(asctime)s | pid=%(process)d | %(levelname)s | %(name)s | %(message)s",
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


def _log_with_context(level: int, context: RequestContext | None, message: str, *args: Any) -> None:
    if context and context.log_label:
        LOGGER.log(level, "%s " + message, context.log_label, *args)
    else:
        LOGGER.log(level, message, *args)


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


class MessageDispatcher:
    """Serialize outgoing frames and keep protocol ids in sync."""

    def __init__(self, websocket: WebSocketServerProtocol, conversation_id: str | None) -> None:
        self._websocket = websocket
        self._conversation_id = conversation_id
        self.last_message_id = 0
        self._lock = asyncio.Lock()

    async def send(self, *, type_code: int, request_id: int, content: Dict[str, Any]) -> AlgerMessage:
        async with self._lock:
            message_id = self.last_message_id + 1
            response = build_status_response(
                message_id=message_id,
                request_id=request_id,
                type_code=type_code,
                content=content,
            )
            await self._websocket.send(response.to_json())
            _log_message(
                self._conversation_id,
                "outgoing",
                {
                    "id": response.message_id,
                    "requestId": response.request_id,
                    "type": response.type_code,
                    "status_code": response.type_code,
                    "body": {"content": response.content},
                },
            )
            self.last_message_id = message_id
            return response


def _monitor_async_result(fut: asyncio.Future[Any] | Future, label: str) -> None:
    def _done(result_future: asyncio.Future[Any] | Future) -> None:
        try:
            result_future.result()
        except Exception as exc:
            LOGGER.error("%s failed: %s", label, exc)

    fut.add_done_callback(_done)


def _create_status_callback(
    dispatcher: "MessageDispatcher",
    loop: asyncio.AbstractEventLoop,
) -> Callable[[int, Dict[str, Any], int], None]:
    def _callback(type_code: int, payload: Dict[str, Any], request_id: int) -> None:
        async def _send() -> None:
            await dispatcher.send(type_code=type_code, request_id=request_id, content=payload)

        try:
            running_loop = asyncio.get_running_loop()
        except RuntimeError:
            running_loop = None

        if running_loop is loop:
            task = loop.create_task(_send())
            _monitor_async_result(task, "status-update")
        else:
            future = asyncio.run_coroutine_threadsafe(_send(), loop)
            _monitor_async_result(future, "status-update")

    return _callback


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
    context.log_label = f"[conn={connection_id} user={context.username}]"
    _log_with_context(
        logging.INFO,
        context,
        "Client connected from %s",
        websocket.remote_address,
    )

    dispatcher = MessageDispatcher(websocket, conversation_id)
    loop = asyncio.get_running_loop()
    context.status_callback = _create_status_callback(dispatcher, loop)

    try:
        while True:
            try:
                raw_message = await websocket.recv()
            except ConnectionClosed:
                _log_with_context(logging.INFO, context, "Client disconnected")
                break

            try:
                message = AlgerMessage.parse(raw_message, error_code=CODE_UNKNOWN_TYPE)
            except ProtocolError as exc:
                LOGGER.error("Protocol violation: %s", exc)
                await dispatcher.send(
                    type_code=exc.error_code,
                    request_id=0,
                    content={"error": str(exc)},
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

            expected_id = dispatcher.last_message_id + 1
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
                await dispatcher.send(
                    type_code=CODE_MESSAGE_ID_ERROR,
                    request_id=message.message_id,
                    content=error_payload,
                )
                continue

            post_send = None
            try:
                response_type, response_content, post_send = route_message(message, context)
            except ProtocolError as exc:
                response_type = exc.error_code
                response_content = {"error": str(exc)}

            await dispatcher.send(
                type_code=response_type,
                request_id=message.message_id,
                content=response_content,
            )

            if post_send is not None:
                task = asyncio.create_task(post_send)
                _monitor_async_result(task, f"post-send-{context.connection_id}")
    finally:
        if context:
            context.status_callback = None
        if conversation_id:
            DATABASE.close_conversation(conversation_id)
        if connection_id:
            DATABASE.close_connection(connection_id)
        _log_with_context(logging.INFO, context, "Connection closed and cleaned up")


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
