# Kratos UI

A chat interface for an AI agent that answers finance questions using real-time data — stock quotes, technical analysis, market news, and portfolio tracking.

## Stack

- **Frontend** — React + Vite (TypeScript)
- **Backend** — FastAPI + Python, with MCP tool servers

## How it works

**Skills** are markdown files that define what the agent knows how to do. Each skill has trigger keywords, instructions, and an optional `persist` flag. When you send a message:

1. The backend matches it against all active skills by keyword
2. Multiple skills can activate at once — their instructions are combined
3. Persisted skills carry forward into subsequent turns automatically
4. The agent runs with full session history (including past tool calls), so context is preserved across the conversation

**MCP servers** provide the actual tools (e.g. Yahoo Finance). They start once at app startup, stay alive for the process lifetime, and can be reloaded without a restart via `/api/mcp/reinitialize`.

## Running locally

**Backend**

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Runs on `http://localhost:8000`.

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`. API calls are proxied to the backend automatically.

## Structure

```
backend/
  main.py          # FastAPI app
  agent.py         # Agent, MCP server lifecycle, session history
  skills_loader.py # Skill matching, persistence, file cache
  skills/          # Skill definitions (markdown)
  yahoo_server.py  # Yahoo Finance MCP tool server
frontend/
  src/
    components/    # Chat UI, trace panel, MCP panel
    hooks/         # useChat
    types.ts
```
