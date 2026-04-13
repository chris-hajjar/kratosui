from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import re
import secrets
import time
import urllib.parse
from contextlib import AsyncExitStack
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from dotenv import load_dotenv
from pydantic_ai import Agent, RunContext
from pydantic_ai.mcp import MCPServerStdio, MCPServerSSE, MCPServerStreamableHTTP
from pydantic_ai.messages import ModelRequest, ModelResponse, UserPromptPart, TextPart, ToolCallPart

from skills_loader import Skill, load_skills, build_skill_index
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
    "If a tool call fails, explain what went wrong in plain language.\n\n"
    "## Chart Rendering\n"
    "When tool results contain visual data, you MUST emit a fenced chart block FIRST, before any text:\n"
    "```chart\n"
    '{\"type\": \"candlestick\", \"title\": \"AAPL Price History\", \"x_key\": \"date\", \"data\": [...]}\n'
    "```\n"
    "Types: candlestick (OHLC price history), line (time-series), area (filled line), bar (categorical), gauge (single 0–100 value e.g. RSI).\n"
    "For gauge, data format is [{\"name\": \"RSI\", \"value\": <number>}]. "
    "For multi-series line/area, include a y_keys array listing each series key. "
    "Pass the raw data array from the tool result directly — do not summarize or truncate it. "
    "Do NOT describe what the chart looks like — provide analysis and insights instead. "
    "You may emit multiple chart blocks in one response (e.g. candlestick then gauge).\n\n"
    "## Document Artifacts\n"
    "You MUST emit a fenced artifact block whenever the user asks you to:\n"
    "- write a report, summary, or analysis\n"
    "- generate or export a CSV, spreadsheet, or data file\n"
    "- create any document intended to be saved or downloaded\n"
    "Emit the artifact block FIRST, then follow with a brief plain-text summary. "
    "NEVER write the report content as regular markdown text — it must go inside the artifact block.\n"
    "Format:\n"
    "```artifact\n"
    '{\"type\": \"markdown\", \"filename\": \"report.md\", \"content\": \"# Title\\n...\"}\n'
    "```\n"
    "or:\n"
    "```artifact\n"
    '{\"type\": \"csv\", \"filename\": \"data.csv\", \"content\": \"col1,col2\\nval1,val2\"}\n'
    "```\n"
    "Types: csv (comma-separated data), markdown (formatted report as .md). "
    "Write the FULL content inline in the \"content\" field. Escape newlines as \\n, escape quotes as \\\". "
    "After the artifact block, write 2-3 sentences of plain-text highlights only — do not repeat the full content.\n"
)

DEFAULT_INIT_TIMEOUT = 15.0

_agent: Agent | None = None
_servers: dict[str, MCPServerStdio | MCPServerSSE | MCPServerStreamableHTTP] = {}
_server_timeouts: dict[str, float] = {}
_server_health: dict[str, dict] = {}
_server_tools: dict[str, list] = {}
_exit_stack: AsyncExitStack | None = None
_pending_oauth: dict[str, dict] = {}  # server_name -> {code_verifier, state, redirect_uri, token_endpoint, client_id}

_server_enabled: dict[str, bool] = {}
_server_disabled_tools: dict[str, set[str]] = {}

# Cross-turn tool history: session_id -> list of pydantic-ai ModelMessage objects
_session_history: dict[str, list] = {}


def _generate_pkce() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) using S256 method."""
    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return code_verifier, code_challenge


async def _discover_oauth(server_url: str) -> dict | None:
    """Fetch /.well-known/oauth-authorization-server from the server's origin. Returns metadata or None."""
    parsed = urllib.parse.urlparse(server_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{origin}/.well-known/oauth-authorization-server")
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return None


def get_pending_oauth(name: str) -> dict | None:
    return _pending_oauth.get(name)


def clear_pending_oauth(name: str) -> None:
    _pending_oauth.pop(name, None)


@dataclass
class AgentDeps:
    activated_skills: list[str] = field(default_factory=list)


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
    """Read mcp_config.json and populate _servers / _server_timeouts / _server_enabled / _server_disabled_tools."""
    global _servers, _server_timeouts, _server_enabled, _server_disabled_tools
    config = json.loads(MCP_CONFIG_PATH.read_text())
    _servers = {}
    _server_timeouts = {}
    _server_enabled = {}
    _server_disabled_tools = {}
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
        _server_enabled[name] = cfg.get("enabled", True)
        _server_disabled_tools[name] = set(cfg.get("disabledTools", []))


async def _try_start(exit_stack: AsyncExitStack, name: str, server) -> bool:
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
        msg = _extract_error(exc)
        # 401 → attempt OAuth discovery
        if "401" in msg and hasattr(server, "url"):
            metadata = await _discover_oauth(server.url)
            if metadata:
                authorization_endpoint = metadata.get("authorization_endpoint")
                token_endpoint = metadata.get("token_endpoint")
                registration_endpoint = metadata.get("registration_endpoint")
                if authorization_endpoint and token_endpoint:
                    code_verifier, code_challenge = _generate_pkce()
                    random_state = secrets.token_urlsafe(16)
                    state = f"{name}:{random_state}"
                    redirect_uri = "http://localhost:8000/api/mcp/oauth/callback"
                    client_id = "kratos-ui"
                    # Try dynamic client registration if the server supports it
                    if registration_endpoint:
                        try:
                            async with httpx.AsyncClient(timeout=5.0) as client:
                                reg_resp = await client.post(
                                    registration_endpoint,
                                    json={
                                        "client_name": "Kratos UI",
                                        "redirect_uris": [redirect_uri],
                                        "grant_types": ["authorization_code"],
                                        "response_types": ["code"],
                                        "token_endpoint_auth_method": "none",
                                    },
                                )
                                if reg_resp.status_code in (200, 201):
                                    client_id = reg_resp.json().get("client_id", client_id)
                        except Exception:
                            pass
                    auth_url = authorization_endpoint + "?" + urllib.parse.urlencode({
                        "response_type": "code",
                        "client_id": client_id,
                        "redirect_uri": redirect_uri,
                        "state": state,
                        "code_challenge": code_challenge,
                        "code_challenge_method": "S256",
                    })
                    _pending_oauth[name] = {
                        "code_verifier": code_verifier,
                        "state": state,
                        "redirect_uri": redirect_uri,
                        "token_endpoint": token_endpoint,
                        "client_id": client_id,
                    }
                    _server_health[name] = {
                        "status": "needs_auth",
                        "auth_url": auth_url,
                        "message": "OAuth authentication required — click Connect to authorise",
                    }
                    return False
        _server_health[name] = {"status": "error", "message": msg}
        return False


def _register_function_tools(agent: Agent) -> None:
    """Register the get_skill function tool on the agent."""

    @agent.tool
    def get_skill(ctx: RunContext[AgentDeps], name: str) -> str:
        """Load a skill's full instructions by name. Call this when a skill is relevant to the user's request."""
        skills = load_skills()
        active = [s for s in skills if s.status == "active"]
        match = next((s for s in active if s.name.lower() == name.lower()), None)
        if match is None:
            valid = ", ".join(s.name for s in active)
            return f"Skill '{name}' not found. Valid active skills: {valid}"
        if match.name not in ctx.deps.activated_skills:
            ctx.deps.activated_skills.append(match.name)
        return match.body


async def startup_servers() -> None:
    """Start all configured MCP servers gracefully. Failed servers are recorded but don't crash startup."""
    global _agent, _exit_stack

    await shutdown_servers()
    _load_server_objects()

    stack = AsyncExitStack()
    await stack.__aenter__()

    working = []
    for name, server in _servers.items():
        if not _server_enabled.get(name, True):
            _server_health[name] = {"status": "disabled"}
            continue
        ok = await _try_start(stack, name, server)
        if ok:
            disabled = _server_disabled_tools.get(name, set())
            if disabled:
                toolset = server.filtered(lambda ctx, td, d=disabled: td.name not in d)
            else:
                toolset = server
            working.append(toolset)

    _exit_stack = stack
    _agent = Agent("openai:gpt-4o", toolsets=working, system_prompt=BASE_SYSTEM_PROMPT, deps_type=AgentDeps)
    _register_function_tools(_agent)


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
        status = _server_health.get(name, {}).get("status")
        if status == "disabled":
            # Preserve existing tool cache so frontend can still show toggles
            continue
        if status != "ok":
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


def get_server_enabled() -> dict[str, bool]:
    return _server_enabled.copy()


def get_server_disabled_tools(name: str) -> list[str]:
    return list(_server_disabled_tools.get(name, set()))


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

    # Build skill index from active skills and inject as instructions
    all_skills = load_skills()
    active_skills = [s for s in all_skills if s.status == "active"]
    instructions = build_skill_index(active_skills) if active_skills else None

    deps = AgentDeps()
    start = time.monotonic()

    async with agent.run_stream(
        message,
        instructions=instructions,
        message_history=msg_history,
        model=model,
        deps=deps,
    ) as result:
        async for delta in result.stream_text(delta=True):
            yield {"type": "text_delta", "content": delta}

        total_ms = int((time.monotonic() - start) * 1000)
        all_msgs = result.all_messages()

        # Store full message history (including tool calls/returns) for next turn
        if session_id:
            _session_history[session_id] = all_msgs

        new_msgs = all_msgs[len(msg_history):]

        # Emit skill_activated events for skills the model loaded via get_skill
        emitted: set[str] = set()
        for name in deps.activated_skills:
            if name not in emitted:
                emitted.add(name)
                yield {"type": "skill_activated", "name": name}

        skill_names = ", ".join(deps.activated_skills) if deps.activated_skills else None
        trace = extract_trace(new_msgs, skill_names, total_ms)

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
