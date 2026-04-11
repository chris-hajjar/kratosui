# Kratos UI

A chat interface for an AI agent that can answer finance questions using real-time data — stock quotes, technical analysis, market news, and portfolio tracking.

## Stack

- **Frontend** — React + Vite (TypeScript)
- **Backend** — FastAPI + Python, with MCP tool servers

## Running locally

**Backend**

```bash
cd backend
pip install -r requirements.txt   # or install fastapi, uvicorn, sse-starlette, etc.
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
  agent.py         # AI agent + MCP server management
  skills/          # Skill definitions (markdown)
  yahoo_server.py  # Yahoo Finance MCP tool server
frontend/
  src/
    components/    # Chat UI, trace panel, MCP panel
    hooks/         # useChat
    types.ts
```
