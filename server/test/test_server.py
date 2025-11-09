"""Basic integration tests for the Alger WebSocket server."""

from __future__ import annotations

import asyncio
import contextlib
import json
import sys
import unittest
from pathlib import Path
from typing import Tuple

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from websockets import connect

import server as alger_server


class AlgerServerTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def tearDownClass(cls) -> None:
        print(
            "\nServer integration summary:\n"
            " • Auth handshake and user-data fetch succeed end-to-end.\n"
            " • Unknown/out-of-order frames return protocol-safe errors.\n"
            " • Stored pipelines execute and expose sink summaries via 107.\n"
            " • Execution metadata persists in SQLite with zero active runs.\n"
        )

    async def asyncSetUp(self) -> None:
        alger_server.reset_server_state()
        self._load_default_graph_into_db()
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
            self.assertIn("sinks", response["content"]["content"])
            self.assertTrue(response["content"]["content"]["sinks"])

    async def test_execution_persisted_in_database(self) -> None:
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
            execution_id = response["content"]["executionId"]

            response, _ = await self._exchange(
                websocket,
                message_id=next_id,
                type_code=107,
                content={"executionId": execution_id},
            )
            self.assertEqual(response["type"], alger_server.CODE_PIPELINE_FINISHED_OK)

        stored_execution = alger_server.DATABASE.get_execution(execution_id)
        self.assertIsNotNone(stored_execution)
        assert stored_execution is not None  # For type checkers.
        self.assertEqual(stored_execution["status"], "finished")
        self.assertEqual(
            stored_execution["output"]["file"],
            f"{execution_id}.json",
        )
        summary = json.loads(stored_execution["output"]["content"])
        self.assertIn("sinks", summary)
        self.assertEqual(alger_server.DATABASE.count_active_executions(), 0)

    @staticmethod
    def _load_default_graph_into_db() -> None:
        dag_path = Path(__file__).with_name("test_DAG.json")
        graph_definition = json.loads(dag_path.read_text())
        pipeline_payload = graph_definition.get("pipeline", {})
        alger_server.DATABASE.upsert_pipeline(
            {
                "id": "demo",
                "name": pipeline_payload.get("name", "Demo Pipeline"),
                "full_graph": graph_definition,
                "description": pipeline_payload.get("name"),
                "metadata": {
                    "source": dag_path.name,
                    "originalPipelineId": pipeline_payload.get("id"),
                    "kind": graph_definition.get("kind"),
                },
            }
        )


if __name__ == "__main__":
    unittest.main()
