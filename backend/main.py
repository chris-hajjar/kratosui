from __future__ import annotations

import json
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import frontmatter
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agent import startup_servers, shutdown_servers, reinitialize, reset_agent, stream_chat, refresh_server_info, get_server_health, get_server_tools
from skills_loader import delete_skill, load_skills, save_skill
from usage_tracker import get_logs, get_stats, get_tool_stats, init_db

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
    model: str = "openai:gpt-4o"
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
    return get_server_tools(name)


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
def usage_tools():
    return get_tool_stats()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _skill_filename(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{slug}.md"
