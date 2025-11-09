"""Connection-scoped context helpers."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RequestContext:
    """Carries metadata about the connected client and conversation."""

    user_id: str
    username: str
    connection_id: str
    conversation_id: str
    client_ip: str | None = None
