from typing import Any

from pydantic import BaseModel


class N8nCheckpointPayload(BaseModel):
    client_id: str
    summary_text: str
    structured_diff: dict[str, Any] = {}
    raw_conversation: str | None = None
    status: str = "draft"
