"""Protocol primitives shared by the Alger server."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict
from urllib.parse import parse_qs, urlparse

from .config import PASSWORD, USERNAME


class ProtocolError(Exception):
    """Raised when a message violates the Alger protocol."""

    def __init__(self, message: str, error_code: int) -> None:
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
    def parse(cls, raw_payload: str, *, error_code: int) -> "AlgerMessage":
        """Parse and validate the incoming JSON payload."""
        try:
            decoded = json.loads(raw_payload)
        except json.JSONDecodeError as exc:
            raise ProtocolError("Payload is not valid JSON", error_code) from exc

        try:
            message_id = int(decoded["id"])
            request_id = int(decoded["requestId"])
            type_code = int(decoded["type"])
            content_raw = decoded["content"]
        except (KeyError, TypeError, ValueError) as exc:
            raise ProtocolError(
                "Missing or non-integer protocol fields", error_code
            ) from exc

        if not isinstance(content_raw, str):
            raise ProtocolError("Content field must be a JSON-encoded string", error_code)

        try:
            content = json.loads(content_raw or "{}")
        except json.JSONDecodeError as exc:
            raise ProtocolError("Content must contain valid JSON", error_code) from exc

        return cls(
            message_id=message_id,
            request_id=request_id,
            type_code=type_code,
            content=content,
        )

    def as_dict(self) -> Dict[str, Any]:
        return {
            "id": self.message_id,
            "requestId": self.request_id,
            "type": self.type_code,
            "content": self.content,
        }

    def to_json(self) -> str:
        payload = {
            "id": self.message_id,
            "requestId": self.request_id,
            "type": self.type_code,
            "content": json.dumps(self.content),
        }
        return json.dumps(payload)


def ensure_credentials(path: str) -> str:
    """Ensure the connection query string carries valid credentials."""
    parsed = urlparse(path)
    params = parse_qs(parsed.query)
    username = params.get("username", [None])[0]
    password = params.get("password", [None])[0]

    if username != USERNAME or password != PASSWORD:
        raise PermissionError("Invalid username/password pair")
    return str(username)


def build_status_response(
    *,
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
