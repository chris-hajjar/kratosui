from __future__ import annotations

import json
import time
from pathlib import Path

from dotenv import load_dotenv
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerStdio, MCPServerSSE
from pydantic_ai.messages import ModelRequest, ModelResponse, UserPromptPart, TextPart

from skills_loader import Skill
from tracer import extract_trace
from usage_tracker import log_tool_calls, log_usage

load_dotenv(Path(__file__).parent.parent / ".env")

BASE_DIR = Path(__file__).parent
MCP_CONFIG_PATH = BASE_DIR / "mcp_config.json"

BASE_SYSTEM_PROMPT = (
    "You are a helpful AI assistant. Be concise and clear. "
    "When tool results contain rows of data (a list of records), ALWAYS present them as a markdown table — never as nested bullet points. "
    "When a tool returns a simple flat list of strings (e.g. column names, field names), write them as a single line of comma-separated plain text — never as individual code blocks, code-formatted bullets, or multi-line lists. "
    "Reserve code formatting only for actual code snippets or query syntax. "
    "If a tool call fails, explain what went wrong in plain language."
)

_agent: Agent | None = None
_servers: dict[str, MCPServerStdio | MCPServerSSE] = {}
_server_health: dict[str, dict] = {}
_server_tools: dict[str, list] = {}


def load_mcp_servers() -> list:
    global _servers
    config = json.loads(MCP_CONFIG_PATH.read_text())
    _servers = {}
    for name, cfg in config["mcpServers"].items():
        server_type = cfg.get("type", "stdio")
        if server_type == "sse":
            headers = cfg.get("headers") or None
            server = MCPServerSSE(cfg["url"], headers=headers)
        else:
            server = MCPServerStdio(cfg["command"], args=cfg.get("args", []))
        _servers[name] = server
    return list(_servers.values())


async def refresh_server_info() -> None:
    """Populate health status and tool list for each connected server."""
    for name, server in _servers.items():
        try:
            tools = await server.list_tools()
            _server_health[name] = {"status": "ok"}
            _server_tools[name] = [
                {"name": t.name, "description": t.description or ""}
                for t in tools
            ]
        except Exception as e:
            _server_health[name] = {"status": "error", "message": str(e)}
            _server_tools[name] = []


def get_server_health() -> dict:
    return _server_health


def get_server_tools(name: str) -> list:
    return _server_tools.get(name, [])


def get_agent() -> Agent:
    global _agent
    if _agent is None:
        servers = load_mcp_servers()
        _agent = Agent("openai:gpt-4o", toolsets=servers, system_prompt=BASE_SYSTEM_PROMPT)
    return _agent


def reset_agent() -> None:
    """Force agent rebuild on next request (after MCP config changes)."""
    global _agent
    _agent = None


def build_history(messages: list[dict]) -> list:
    """Convert frontend message list to pydantic-ai message history."""
    history = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "user":
            history.append(ModelRequest(parts=[UserPromptPart(content=content)]))
        elif role == "assistant":
            history.append(ModelResponse(parts=[TextPart(content=content)]))
    return history


async def stream_chat(message: str, history: list[dict], skill: Skill | None, model: str = "openai:gpt-4o"):
    """Async generator yielding SSE-ready dicts."""
    agent = get_agent()
    msg_history = build_history(history)
    instructions = skill.body if skill else None
    start = time.monotonic()

    async with agent.run_stream(
        message,
        instructions=instructions,
        message_history=msg_history,
        model=model,
    ) as result:
        async for delta in result.stream_text(delta=True):
            yield {"type": "text_delta", "content": delta}

        total_ms = int((time.monotonic() - start) * 1000)
        all_msgs = result.all_messages()
        trace = extract_trace(all_msgs, skill.name if skill else None, total_ms)

        usage = result.usage()
        request_id = log_usage(
            model=model,
            input_tokens=usage.request_tokens or 0,
            output_tokens=usage.response_tokens or 0,
            skill_name=skill.name if skill else None,
            duration_ms=total_ms,
        )
        log_tool_calls(
            request_id=request_id,
            model=model,
            skill_name=skill.name if skill else None,
            tools=trace.get("tools", []),
        )

        yield {"type": "trace", **trace}

    yield {"type": "done"}
