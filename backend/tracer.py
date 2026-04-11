from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from pydantic_ai.messages import ModelMessage, ToolCallPart, ToolReturnPart


def _summarize(value: Any, max_len: int = 200) -> str:
    if isinstance(value, str):
        s = value
    else:
        try:
            s = json.dumps(value, default=str)
        except Exception:
            s = str(value)
    return s[:max_len] + ("…" if len(s) > max_len else "")


@dataclass
class ToolEvent:
    name: str
    args: dict
    summary: str
    result: str = field(default="")


def extract_trace(
    messages: list[ModelMessage],
    skill_name: str | None,
    total_ms: int,
) -> dict:
    """Build a receipt from pydantic-ai message history."""
    # Collect tool calls indexed by tool_call_id
    call_map: dict[str, dict] = {}
    events: list[ToolEvent] = []

    for msg in messages:
        if not hasattr(msg, "parts"):
            continue
        for part in msg.parts:
            if isinstance(part, ToolCallPart):
                try:
                    args = part.args_as_dict()
                except Exception:
                    args = {}
                call_map[part.tool_call_id] = {"name": part.tool_name, "args": args}
            elif isinstance(part, ToolReturnPart):
                tc = call_map.get(part.tool_call_id, {})
                raw = part.content
                if isinstance(raw, str):
                    full_result = raw
                else:
                    try:
                        full_result = json.dumps(raw, default=str)
                    except Exception:
                        full_result = str(raw)
                events.append(
                    ToolEvent(
                        name=tc.get("name", part.tool_name),
                        args=tc.get("args", {}),
                        summary=_summarize(part.content),
                        result=full_result,
                    )
                )

    return {
        "skill": skill_name,
        "tools": [
            {"name": e.name, "args": e.args, "summary": e.summary, "result": e.result}
            for e in events
        ],
        "total_ms": total_ms,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
