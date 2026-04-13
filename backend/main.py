from __future__ import annotations

import json
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import frontmatter
import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agent import (
    startup_servers, shutdown_servers, reinitialize, reset_agent,
    stream_chat, refresh_server_info, get_server_health, get_server_tools,
    get_server_enabled, get_server_disabled_tools,
    get_pending_oauth, clear_pending_oauth,
)
from skills_loader import delete_skill, load_skills, save_skill
from usage_tracker import export_csv, get_logs, get_skill_stats, get_stats, get_tool_stats, init_db

BASE_DIR = Path(__file__).parent
MCP_CONFIG_PATH = BASE_DIR / "mcp_config.json"


# ---------------------------------------------------------------------------
# Lifespan — keep MCP servers alive for the process lifetime
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    await startup_servers()
    await refresh_server_info()
    yield
    await shutdown_servers()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    model: str = "openai:gpt-4o-mini"
    session_id: str = ""


class SkillPayload(BaseModel):
    name: str
    description: str = ""
    status: str = "active"
    when_to_use: str = ""
    body: str = ""


class MCPServerPayload(BaseModel):
    name: str
    type: str = "stdio"
    command: str = ""
    args: list[str] = []
    url: str = ""
    headers: dict[str, str] = {}


# ---------------------------------------------------------------------------
# Chat endpoint
# ---------------------------------------------------------------------------

@app.post("/api/chat")
async def chat(req: ChatRequest):
    async def event_stream():
        history = [m.model_dump() for m in req.history]
        try:
            async for event in stream_chat(req.message, history, req.model, req.session_id):
                yield {"data": json.dumps(event)}
        except Exception as exc:
            yield {
                "data": json.dumps({
                    "type": "error",
                    "message": str(exc),
                    "source": "agent",
                })
            }

    return EventSourceResponse(event_stream())


# ---------------------------------------------------------------------------
# Skills CRUD
# ---------------------------------------------------------------------------

@app.get("/api/skills")
def get_skills():
    skills = load_skills()
    return [
        {
            "name": s.name,
            "description": s.description,
            "status": s.status,
            "when_to_use": s.when_to_use,
            "body": s.body,
            "filename": s.filename,
        }
        for s in skills
    ]


@app.post("/api/skills")
def create_skill(payload: SkillPayload):
    filename = _skill_filename(payload.name)
    save_skill(filename, payload.model_dump())
    return {"filename": filename}


@app.post("/api/skills/upload")
async def upload_skill(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".md"):
        raise HTTPException(status_code=400, detail="Only .md files are accepted")
    raw = await file.read()
    text = raw.decode("utf-8")
    post = frontmatter.loads(text)
    stem = Path(file.filename).stem
    skill_data = {
        "name": post.get("name", stem),
        "description": post.get("description", ""),
        "status": post.get("status", "active"),
        "when_to_use": post.get("when_to_use", ""),
        "body": post.content.strip(),
    }
    filename = _skill_filename(skill_data["name"])
    save_skill(filename, skill_data)
    return {"filename": filename, "name": skill_data["name"]}


@app.put("/api/skills/{filename}")
def update_skill(filename: str, payload: SkillPayload):
    save_skill(filename, payload.model_dump())
    return {"ok": True}


@app.delete("/api/skills/{filename}")
def remove_skill(filename: str):
    delete_skill(filename)
    return {"ok": True}


# ---------------------------------------------------------------------------
# MCP config CRUD
# ---------------------------------------------------------------------------

@app.get("/api/mcp")
def get_mcp():
    config = json.loads(MCP_CONFIG_PATH.read_text())
    servers = []
    for name, cfg in config["mcpServers"].items():
        servers.append({
            "name": name,
            "type": cfg.get("type", "stdio"),
            "command": cfg.get("command", ""),
            "args": cfg.get("args", []),
            "url": cfg.get("url", ""),
            "headers": cfg.get("headers", {}),
            "enabled": cfg.get("enabled", True),
            "disabledTools": cfg.get("disabledTools", []),
        })
    return servers


@app.get("/api/browse")
def browse_file():
    """Open a native macOS file picker via osascript and return the selected path."""
    import subprocess
    script = (
        'tell application "System Events"\n'
        '  activate\n'
        '  set f to choose file with prompt "Select MCP server file"\n'
        '  return POSIX path of f\n'
        'end tell'
    )
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=60,
        )
        path = result.stdout.strip()
        return {"path": path}
    except subprocess.TimeoutExpired:
        return {"path": ""}
    except Exception as e:
        return {"path": "", "error": str(e)}


@app.get("/api/mcp/status")
def mcp_status():
    return get_server_health()


@app.get("/api/mcp/{name}/tools")
def mcp_tools(name: str):
    disabled = set(get_server_disabled_tools(name))
    return [
        {**t, "enabled": t["name"] not in disabled}
        for t in get_server_tools(name)
    ]


@app.patch("/api/mcp/{name}/enabled")
async def set_server_enabled(name: str, body: dict):
    config = json.loads(MCP_CONFIG_PATH.read_text())
    if name not in config["mcpServers"]:
        raise HTTPException(status_code=404, detail="Server not found")
    config["mcpServers"][name]["enabled"] = body["enabled"]
    MCP_CONFIG_PATH.write_text(json.dumps(config, indent=2))
    health = await reinitialize()
    return {"ok": True, "health": health}


@app.patch("/api/mcp/{name}/tools/{tool_name}/enabled")
async def set_tool_enabled(name: str, tool_name: str, body: dict):
    config = json.loads(MCP_CONFIG_PATH.read_text())
    if name not in config["mcpServers"]:
        raise HTTPException(status_code=404, detail="Server not found")
    srv = config["mcpServers"][name]
    disabled = set(srv.get("disabledTools", []))
    if body["enabled"]:
        disabled.discard(tool_name)
    else:
        disabled.add(tool_name)
    srv["disabledTools"] = sorted(disabled)
    MCP_CONFIG_PATH.write_text(json.dumps(config, indent=2))
    health = await reinitialize()
    return {"ok": True, "health": health}


def _build_mcp_entry(payload: MCPServerPayload) -> dict:
    entry: dict = {"type": payload.type}
    if payload.type in ("sse", "streamable-http"):
        entry["url"] = payload.url
        if payload.headers:
            entry["headers"] = payload.headers
    else:
        entry["command"] = payload.command
        entry["args"] = payload.args
    return entry


@app.post("/api/mcp")
def add_mcp(payload: MCPServerPayload):
    config = json.loads(MCP_CONFIG_PATH.read_text())
    config["mcpServers"][payload.name] = _build_mcp_entry(payload)
    MCP_CONFIG_PATH.write_text(json.dumps(config, indent=2))
    return {"ok": True}


@app.put("/api/mcp/{name}")
def update_mcp(name: str, payload: MCPServerPayload):
    config = json.loads(MCP_CONFIG_PATH.read_text())
    if name not in config["mcpServers"]:
        raise HTTPException(status_code=404, detail="Server not found")
    config["mcpServers"][name] = _build_mcp_entry(payload)
    MCP_CONFIG_PATH.write_text(json.dumps(config, indent=2))
    return {"ok": True}


@app.delete("/api/mcp/{name}")
def remove_mcp(name: str):
    config = json.loads(MCP_CONFIG_PATH.read_text())
    config["mcpServers"].pop(name, None)
    MCP_CONFIG_PATH.write_text(json.dumps(config, indent=2))
    return {"ok": True}


@app.post("/api/mcp/reinitialize")
async def reinitialize_mcp():
    """Reload config, reconnect all servers, rebuild agent — no restart needed."""
    health = await reinitialize()
    return {"ok": True, "health": health}


@app.get("/api/mcp/oauth/callback", response_class=HTMLResponse)
async def mcp_oauth_callback(code: str, state: str):
    """OAuth redirect target. Exchanges the auth code for a bearer token and reconnects the server."""
    if ":" not in state:
        return HTMLResponse(_oauth_page("error", "Invalid state parameter."), status_code=400)

    server_name, _ = state.split(":", 1)
    pending = get_pending_oauth(server_name)

    if pending is None:
        return HTMLResponse(_oauth_page("error", "No pending OAuth session for this server."), status_code=400)
    if pending["state"] != state:
        return HTMLResponse(_oauth_page("error", "State mismatch — possible CSRF."), status_code=400)

    # Exchange code for token
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_resp = await client.post(
                pending["token_endpoint"],
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": pending["redirect_uri"],
                    "client_id": pending["client_id"],
                    "code_verifier": pending["code_verifier"],
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            token_resp.raise_for_status()
            token_data = token_resp.json()
    except Exception as exc:
        return HTMLResponse(_oauth_page("error", f"Token exchange failed: {exc}"), status_code=502)

    access_token = token_data.get("access_token")
    if not access_token:
        return HTMLResponse(_oauth_page("error", "No access_token in response."), status_code=502)

    # Persist token into mcp_config.json
    config = json.loads(MCP_CONFIG_PATH.read_text())
    srv_cfg = config["mcpServers"].get(server_name, {})
    srv_cfg.setdefault("headers", {})["Authorization"] = f"Bearer {access_token}"
    config["mcpServers"][server_name] = srv_cfg
    MCP_CONFIG_PATH.write_text(json.dumps(config, indent=2))

    clear_pending_oauth(server_name)
    await reinitialize()

    return HTMLResponse(_oauth_page("success", server_name))


# ---------------------------------------------------------------------------
# Usage / cost tracking
# ---------------------------------------------------------------------------

@app.get("/api/usage")
def usage_stats(model: str | None = None):
    return get_stats(model_filter=model)


@app.get("/api/usage/logs")
def usage_logs(model: str | None = None, limit: int = 50):
    return get_logs(model_filter=model, limit=limit)


@app.get("/api/usage/tools")
def usage_tools(model: str | None = None):
    return get_tool_stats(model_filter=model)


@app.get("/api/usage/skills")
def usage_skills():
    return get_skill_stats()


@app.get("/api/usage/export")
def export_usage():
    csv_data = export_csv()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=usage_export.csv"},
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _oauth_page(result: str, detail: str = "") -> str:
    """Return a self-closing HTML page shown in the OAuth redirect tab."""
    if result == "success":
        title = "Connected!"
        body = f"<p>Successfully authenticated <strong>{detail}</strong>.</p><p>This tab will close automatically.</p>"
        script = "setTimeout(() => window.close(), 1500);"
        color = "#22c55e"
    else:
        title = "Authentication Failed"
        body = f"<p style='color:#ef4444'>{detail}</p><p>You may close this tab.</p>"
        script = ""
        color = "#ef4444"
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>{title}</title>
<style>
  body {{ font-family: system-ui, sans-serif; display: flex; align-items: center;
         justify-content: center; min-height: 100vh; margin: 0;
         background: #0f0f0f; color: #e5e5e5; }}
  .card {{ background: #1a1a1a; border: 1px solid #333; border-radius: 12px;
           padding: 40px 48px; text-align: center; max-width: 420px; }}
  h1 {{ color: {color}; margin-top: 0; }}
</style>
</head>
<body>
  <div class="card"><h1>{title}</h1>{body}</div>
  <script>{script}</script>
</body></html>"""


def _skill_filename(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{slug}.md"
