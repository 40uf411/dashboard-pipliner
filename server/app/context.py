"""Connection-scoped context helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Protocol


class StatusCallback(Protocol):
    """Protocol for asynchronous status update emitters."""

    def __call__(self, type_code: int, payload: Dict[str, Any], request_id: int) -> None:
        ...


@dataclass
class RequestContext:
    """Carries metadata about the connected client and conversation."""

    user_id: str
    username: str
    connection_id: str
    conversation_id: str
    client_ip: str | None = None
    log_label: str = ""
    status_callback: StatusCallback | None = None
