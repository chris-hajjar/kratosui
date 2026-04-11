"""Lightweight SQLite usage tracker for LLM token/cost logging."""
from __future__ import annotations

import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent / "usage_history.db"

# USD per token (input_price, output_price)
MODEL_PRICING: dict[str, tuple[float, float]] = {
    "openai:gpt-4o":                         (2.50  / 1_000_000, 10.00 / 1_000_000),
    "openai:gpt-4o-mini":                    (0.15  / 1_000_000,  0.60 / 1_000_000),
    "openai:gpt-4-turbo":                    (10.00 / 1_000_000, 30.00 / 1_000_000),
    "openai:gpt-3.5-turbo":                  (0.50  / 1_000_000,  1.50 / 1_000_000),
    "anthropic:claude-3-5-sonnet-latest":    (3.00  / 1_000_000, 15.00 / 1_000_000),
    "anthropic:claude-3-5-haiku-latest":     (1.00  / 1_000_000,  5.00 / 1_000_000),
    "anthropic:claude-opus-4":               (15.00 / 1_000_000, 75.00 / 1_000_000),
}


def _cost(model: str, input_tokens: int, output_tokens: int) -> float:
    inp, out = MODEL_PRICING.get(model, (0.0, 0.0))
    return input_tokens * inp + output_tokens * out


@contextmanager
def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS usage_logs (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp     REAL    NOT NULL,
                model         TEXT    NOT NULL,
                input_tokens  INTEGER NOT NULL DEFAULT 0,
                output_tokens INTEGER NOT NULL DEFAULT 0,
                total_tokens  INTEGER NOT NULL DEFAULT 0,
                cost_usd      REAL    NOT NULL DEFAULT 0.0,
                skill_name    TEXT,
                duration_ms   INTEGER
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tool_logs (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id  INTEGER NOT NULL REFERENCES usage_logs(id),
                timestamp   REAL    NOT NULL,
                tool_name   TEXT    NOT NULL,
                model       TEXT    NOT NULL,
                skill_name  TEXT
            )
        """)


def log_usage(
    *,
    model: str,
    input_tokens: int,
    output_tokens: int,
    skill_name: str | None = None,
    duration_ms: int | None = None,
) -> int:
    """Insert a usage row and return its id."""
    with _conn() as conn:
        cursor = conn.execute(
            """INSERT INTO usage_logs
               (timestamp, model, input_tokens, output_tokens, total_tokens, cost_usd, skill_name, duration_ms)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                time.time(), model,
                input_tokens, output_tokens,
                input_tokens + output_tokens,
                _cost(model, input_tokens, output_tokens),
                skill_name, duration_ms,
            ),
        )
        return cursor.lastrowid  # type: ignore[return-value]


def log_tool_calls(
    *,
    request_id: int,
    model: str,
    skill_name: str | None,
    tools: list[dict],
) -> None:
    if not tools:
        return
    ts = time.time()
    with _conn() as conn:
        conn.executemany(
            """INSERT INTO tool_logs (request_id, timestamp, tool_name, model, skill_name)
               VALUES (?, ?, ?, ?, ?)""",
            [(request_id, ts, t["name"], model, skill_name) for t in tools],
        )


def get_stats(model_filter: str | None = None) -> dict:
    where = "WHERE model = ?" if model_filter else ""
    p: tuple = (model_filter,) if model_filter else ()

    with _conn() as conn:
        totals = conn.execute(
            f"""SELECT
                  COUNT(*)                          AS requests,
                  COALESCE(SUM(input_tokens),  0)   AS input_tokens,
                  COALESCE(SUM(output_tokens), 0)   AS output_tokens,
                  COALESCE(SUM(total_tokens),  0)   AS total_tokens,
                  COALESCE(SUM(cost_usd),      0.0) AS total_cost,
                  COALESCE(AVG(cost_usd),      0.0) AS avg_cost
               FROM usage_logs {where}""",
            p,
        ).fetchone()

        daily = conn.execute(
            f"""SELECT
                  DATE(timestamp, 'unixepoch') AS day,
                  COUNT(*)                      AS requests,
                  SUM(total_tokens)             AS total_tokens,
                  SUM(cost_usd)                 AS cost
               FROM usage_logs {where}
               GROUP BY day
               ORDER BY day ASC
               LIMIT 30""",
            p,
        ).fetchall()

        # Always show all models for the filter dropdown — never filtered
        models = conn.execute(
            """SELECT
                  model,
                  COUNT(*)          AS requests,
                  SUM(total_tokens) AS total_tokens,
                  SUM(cost_usd)     AS cost
               FROM usage_logs
               GROUP BY model
               ORDER BY cost DESC""",
        ).fetchall()

        return {
            "totals": dict(totals),
            "daily":  [dict(r) for r in daily],
            "models": [dict(r) for r in models],
        }


def get_tool_stats() -> list[dict]:
    """Return per-tool call counts, unique request counts, and last-used time."""
    with _conn() as conn:
        rows = conn.execute(
            """SELECT
                  tool_name,
                  COUNT(*)                   AS calls,
                  COUNT(DISTINCT request_id) AS unique_requests,
                  MAX(timestamp)             AS last_used,
                  GROUP_CONCAT(DISTINCT skill_name) AS skills
               FROM tool_logs
               GROUP BY tool_name
               ORDER BY calls DESC
               LIMIT 30"""
        ).fetchall()
        return [dict(r) for r in rows]


def get_logs(model_filter: str | None = None, limit: int = 50) -> list[dict]:
    where = "WHERE model = ?" if model_filter else ""
    p: tuple = (model_filter, limit) if model_filter else (limit,)

    with _conn() as conn:
        rows = conn.execute(
            f"""SELECT id, timestamp, model, input_tokens, output_tokens,
                       total_tokens, cost_usd, skill_name, duration_ms
               FROM usage_logs {where}
               ORDER BY timestamp DESC
               LIMIT ?""",
            p,
        ).fetchall()
        return [dict(r) for r in rows]
