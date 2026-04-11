from __future__ import annotations

import asyncio
import json
import re
import time
from contextlib import AsyncExitStack
from pathlib import Path

from dotenv import load_dotenv
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerStdio, MCPServerSSE, MCPServerStreamableHTTP
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

DEFAULT_INIT_TIMEOUT = 15.0

_agent: Agent | None = None
_servers: dict[str, MCPServerStdio | MCPServerSSE | MCPServerStreamableHTTP] = {}
_server_timeouts: dict[str, float] = {}
_server_health: dict[str, dict] = {}
_server_tools: dict[str, list] = {}
_exit_stack: AsyncExitStack | None = None

# Cross-turn tool history: session_id -> list of pydantic-ai ModelMessage objects
_session_history: dict[str, list] = {}


def _extract_error(exc: BaseException) -> str:
    """Pull a short, readable message out of an exception (including ExceptionGroups)."""
    # Unwrap ExceptionGroup — anyio wraps errors this way
    if hasattr(exc, "exceptions") and exc.exceptions:
        return _extract_error(exc.exceptions[0])
    msg = str(exc)
    # Condense verbose httpx status errors
    m = re.search(r"(Client error '[^']+' for url '[^']+)", msg)
    if m:
        return m.group(1)
    # Trim extremely long messages
    return msg[:300]


def _load_server_objects() -> None:
    """Read mcp_config.json and populate _servers / _server_timeouts."""
    global _servers, _server_timeouts
    config = json.loads(MCP_CONFIG_PATH.read_text())
    _servers = {}
    _server_timeouts = {}
    for name, cfg in config["mcpServers"].items():
        server_type = cfg.get("type", "stdio")
        if server_type == "streamable-http":
            headers = cfg.get("headers") or None
            server = MCPServerStreamableHTTP(cfg["url"], headers=headers)
        elif server_type == "sse":
            headers = cfg.get("headers") or None
            server = MCPServerSSE(cfg["url"], headers=headers)
        else:
            server = MCPServerStdio(cfg["command"], args=cfg.get("args", []))
        _servers[name] = server
        _server_timeouts[name] = float(cfg.get("initTimeout", DEFAULT_INIT_TIMEOUT))


async def _try_start(exit_stack: AsyncExitStack, name: str, server: MCPServerStdio | MCPServerSSE) -> bool:
    """Attempt to start a single server. Updates _server_health. Returns True on success."""
    timeout = _server_timeouts.get(name, DEFAULT_INIT_TIMEOUT)
    _server_health[name] = {"status": "connecting"}
    try:
        await asyncio.wait_for(exit_stack.enter_async_context(server), timeout=timeout)
        _server_health[name] = {"status": "ok"}
        return True
    except asyncio.TimeoutError:
        _server_health[name] = {"status": "error", "message": f"Timed out after {timeout:.0f}s"}
        return False
    except BaseException as exc:
        _server_health[name] = {"status": "error", "message": _extract_error(exc)}
        return False


async def startup_servers() -> None:
    """Start all configured MCP servers gracefully. Failed servers are recorded but don't crash startup."""
    global _agent, _exit_stack

    await shutdown_servers()
    _load_server_objects()

    stack = AsyncExitStack()
    await stack.__aenter__()

    working: list[MCPServerStdio | MCPServerSSE] = []
    for name, server in _servers.items():
        ok = await _try_start(stack, name, server)
        if ok:
            working.append(server)

    _exit_stack = stack
    _agent = Agent("openai:gpt-4o", toolsets=working, system_prompt=BASE_SYSTEM_PROMPT)


async def shutdown_servers() -> None:
    global _exit_stack, _agent
    if _exit_stack:
        try:
            await _exit_stack.aclose()
        except Exception:
            pass
        _exit_stack = None
    _agent = None


async def reinitialize() -> dict:
    """Reload config, restart all servers, rebuild agent. Returns new health status."""
    await startup_servers()
    await refresh_server_info()
    return _server_health.copy()


async def refresh_server_info() -> None:
    """Populate tool list for each connected server."""
    for name, server in _servers.items():
        if _server_health.get(name, {}).get("status") != "ok":
            _server_tools[name] = []
            continue
        try:
            tools = await server.list_tools()
            _server_tools[name] = [
                {"name": t.name, "description": t.description or ""}
                for t in tools
            ]
        except Exception as e:
            _server_health[name] = {"status": "error", "message": str(e)[:300]}
            _server_tools[name] = []


def get_server_health() -> dict:
    return _server_health


def get_server_tools(name: str) -> list:
    return _server_tools.get(name, [])


def get_agent() -> Agent:
    if _agent is None:
        raise RuntimeError("Agent not initialized — call startup_servers() first.")
    return _agent


def reset_agent() -> None:
    """Signal that the agent needs rebuilding (call reinitialize() to apply)."""
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


async def stream_chat(
    message: str,
    history: list[dict],
    skills: list[Skill],
    model: str = "openai:gpt-4o",
    session_id: str = "",
):
    """Async generator yielding SSE-ready dicts."""
    agent = get_agent()

    # Use stored cross-turn tool history if available; fall back to rebuilt history
    if session_id and session_id in _session_history:
        msg_history = _session_history[session_id]
    else:
        msg_history = build_history(history)

    # Build combined instructions from all matched skills
    if skills:
        parts = [f"### Skill: {s.name}\n{s.body}" for s in skills]
        instructions = "\n\n---\n\n".join(parts)
    else:
        instructions = None

    skill_names = ", ".join(s.name for s in skills) if skills else None
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

        # Store full message history (including tool calls/returns) for next turn
        if session_id:
            _session_history[session_id] = all_msgs

        trace = extract_trace(all_msgs, skill_names, total_ms)

        usage = result.usage()
        request_id = log_usage(
            model=model,
            input_tokens=usage.request_tokens or 0,
            output_tokens=usage.response_tokens or 0,
            skill_name=skill_names,
            duration_ms=total_ms,
        )
        log_tool_calls(
            request_id=request_id,
            model=model,
            skill_name=skill_names,
            tools=trace.get("tools", []),
        )

        yield {"type": "trace", **trace}

    yield {"type": "done"}
