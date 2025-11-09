## Alger WebSocket Server

This folder hosts a standalone WebSocket server that speaks the custom **Alger** protocol required by the dashboard project.

### Requirements

- Python 3.10+
- [`websockets`](https://websockets.readthedocs.io/) (`pip install websockets`)

### Running the server

```bash
python server.py
```

The server listens on `ws://localhost:8765` and only accepts connections that:

1. Provide the WebSocket subprotocol `alger`.
2. Include valid credentials via the query string:
   - `username=admin`
   - `password=admin`

Example client URL: `ws://localhost:8765/?username=admin&password=admin`

### Message contract

All frames are JSON objects with the following fields:

| Field      | Type | Description                                                                 |
|------------|------|-----------------------------------------------------------------------------|
| `id`       | int  | Sequential identifier. Client starts at 1; server responses increment by 1.|
| `requestId`| int  | References the `id` that this message responds to (0 if none).             |
| `type`     | int  | Channel semantics (`1xx` requests, `2xx` positive responses, `3xx` errors). |
| `content`  | str  | JSON-encoded string containing the payload.                                |

The server tracks the last observed `id` per connection. Any incoming message whose `id` is not exactly one greater than the last accepted message is ignored.

### Message types

| Request (client) | Success (server) | Error (server) | Description |
|------------------|------------------|----------------|-------------|
| 100 Login        | 200 Login OK     | 300 Unknown user | Authenticates the session payload. |
| 101 Get user data| 201 User data    | 301 Fetch error | Returns static profile information. |
| 102 Get pipeline catalog | 202 Catalog data | 302 Catalog error | Lists available pipeline graphs. |
| 103 Execute pipeline from DB | 203 Execution started | 303 Failed to start/fetch | Launches a stored pipeline using `pipelineId`. |
| 104 Execute ad-hoc pipeline | 204 Execution started | 304 Could not run | Launches a pipeline described in the message `graph`. |
| 106 Stop execution | 206 Stop confirmed | 306 Stop failed | Attempts to stop a running execution via `executionId`. |
| 107 Request execution output | 207 Output payload | 307 Output unavailable | Returns the stored output file for a finished execution. |
| —                | 205 Status update | 305 Status update error | Reserved for server push notifications. |
| —                | 207 Pipeline finished | 307 Pipeline crashed | Server-issued completion or crash notifications. |

### System error codes

- `395` Incorrect client `id`/`requestId`. The server responds with what it expected.
- `396` Unknown or unsupported message type and malformed payloads.
- `397` Too many concurrent executions (capacity reached).
- `398` Pipeline executions halted by an operator.
- `399` Server in maintenance mode.

Extend the handlers inside `server.py` if you need richer domain-specific logic or additional message types.

### Testing

The `server/test_server.py` script runs asynchronous integration tests against the live server instance.

```bash
python test_server.py
```

It spins up the server in-process, exercises login, catalog, execution, and error flows, and then shuts everything down cleanly.
