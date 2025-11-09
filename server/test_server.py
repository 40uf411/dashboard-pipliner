"""Basic integration tests for the Alger WebSocket server."""

from __future__ import annotations

import asyncio
import contextlib
import json
import unittest
from typing import Tuple

from websockets import connect

import server as alger_server


class AlgerServerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        alger_server.reset_server_state()
        self.stop_event = asyncio.Event()
        self.server_task = asyncio.create_task(
            alger_server.run_server(stop_event=self.stop_event)
        )
        await asyncio.sleep(0.1)  # Ensure the server is listening before tests run.

    async def asyncTearDown(self) -> None:
        self.stop_event.set()
        try:
            await asyncio.wait_for(self.server_task, timeout=1)
        except asyncio.TimeoutError:
            self.server_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.server_task

    async def _connect(self):
        return await connect(
            f"ws://localhost:{alger_server.PORT}/?username=admin&password=admin",
            subprotocols=[alger_server.SUBPROTOCOL],
        )

    async def _exchange(
        self,
        websocket,
        message_id: int,
        type_code: int,
        content: dict,
        request_id: int = 0,
    ) -> Tuple[dict, int]:
        payload = {
            "id": message_id,
            "requestId": request_id,
            "type": type_code,
            "content": json.dumps(content),
        }
        await websocket.send(json.dumps(payload))
        raw_response = await websocket.recv()
        response = json.loads(raw_response)
        if isinstance(response.get("content"), str):
            try:
                response["content"] = json.loads(response["content"])
            except json.JSONDecodeError:
                response["content"] = {}
        next_message_id = response["id"] + 1
        return response, next_message_id

    async def test_login_success(self) -> None:
        async with await self._connect() as websocket:
            response, next_id = await self._exchange(
                websocket,
                message_id=1,
                type_code=100,
                content={"username": "admin", "password": "admin"},
            )
            self.assertEqual(response["type"], alger_server.CODE_LOGIN_OK)
            self.assertEqual(response["requestId"], 1)
            self.assertEqual(next_id, 3)

            response, _ = await self._exchange(
                websocket,
                message_id=next_id,
                type_code=101,
                content={"userId": "admin"},
            )
            self.assertEqual(response["type"], alger_server.CODE_USER_DATA)
            self.assertIn("user", response["content"])

    async def test_unknown_type_triggers_396(self) -> None:
        async with await self._connect() as websocket:
            response, next_id = await self._exchange(
                websocket,
                message_id=1,
                type_code=100,
                content={"username": "admin", "password": "admin"},
            )
            self.assertEqual(response["type"], alger_server.CODE_LOGIN_OK)

            response, _ = await self._exchange(
                websocket,
                message_id=next_id,
                type_code=150,
                content={},
            )
            self.assertEqual(response["type"], alger_server.CODE_UNKNOWN_TYPE)
            self.assertEqual(response["requestId"], next_id)

    async def test_out_of_order_message_id_returns_395(self) -> None:
        async with await self._connect() as websocket:
            response, next_id = await self._exchange(
                websocket,
                message_id=1,
                type_code=100,
                content={"username": "admin", "password": "admin"},
            )
            self.assertEqual(response["type"], alger_server.CODE_LOGIN_OK)

            bad_id = next_id + 1
            response, recovered_next_id = await self._exchange(
                websocket,
                message_id=bad_id,
                type_code=101,
                content={"userId": "admin"},
            )
            self.assertEqual(response["type"], alger_server.CODE_MESSAGE_ID_ERROR)
            self.assertEqual(response["content"]["expectedId"], next_id)
            self.assertEqual(recovered_next_id, response["id"] + 1)

    async def test_pipeline_execution_and_output(self) -> None:
        async with await self._connect() as websocket:
            response, next_id = await self._exchange(
                websocket,
                message_id=1,
                type_code=100,
                content={"username": "admin", "password": "admin"},
            )
            self.assertEqual(response["type"], alger_server.CODE_LOGIN_OK)

            response, next_id = await self._exchange(
                websocket,
                message_id=next_id,
                type_code=103,
                content={"pipelineId": "demo"},
            )
            self.assertEqual(response["type"], alger_server.CODE_EXECUTION_FROM_DB_OK)
            execution_id = response["content"]["executionId"]

            response, _ = await self._exchange(
                websocket,
                message_id=next_id,
                type_code=107,
                content={"executionId": execution_id},
            )
            self.assertEqual(response["type"], alger_server.CODE_PIPELINE_FINISHED_OK)
            self.assertEqual(response["content"]["executionId"], execution_id)


if __name__ == "__main__":
    unittest.main()
