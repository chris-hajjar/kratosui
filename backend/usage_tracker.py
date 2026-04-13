"""Lightweight SQLite usage tracker for LLM token/cost logging."""
from __future__ import annotations

import csv
import io
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime
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


def _percentile(values: list[float], p: float) -> float:
    """Return the p-th percentile of a sorted list (0 ≤ p ≤ 100)."""
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = (p / 100) * (len(sorted_vals) - 1)
    lo = int(idx)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = idx - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


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
        totals_row = conn.execute(
            f"""SELECT
                  COUNT(*)                          AS requests,
                  COALESCE(SUM(input_tokens),  0)   AS input_tokens,
                  COALESCE(SUM(output_tokens), 0)   AS output_tokens,
                  COALESCE(SUM(total_tokens),  0)   AS total_tokens,
                  COALESCE(SUM(cost_usd),      0.0) AS total_cost,
                  COALESCE(AVG(cost_usd),      0.0) AS avg_cost,
                  AVG(duration_ms)                   AS avg_latency_ms,
                  AVG(input_tokens)                  AS avg_input_tokens,
                  AVG(output_tokens)                 AS avg_output_tokens,
                  MIN(timestamp)                     AS first_ts,
                  MAX(timestamp)                     AS last_ts
               FROM usage_logs {where}""",
            p,
        ).fetchone()

        totals = dict(totals_row)

        # p95 latency — fetch all durations and compute in Python
        durations = [
            row[0] for row in conn.execute(
                f"SELECT duration_ms FROM usage_logs {where} WHERE duration_ms IS NOT NULL",
                p,
            ).fetchall()
        ]
        totals["p95_latency_ms"] = _percentile(durations, 95) if durations else None
        if totals["avg_latency_ms"] is None and not durations:
            totals["avg_latency_ms"] = None

        # projected monthly cost
        first_ts = totals.pop("first_ts")
        last_ts  = totals.pop("last_ts")
        if first_ts and last_ts and totals["requests"] > 0:
            days_elapsed = max((last_ts - first_ts) / 86400, 1)
            totals["projected_monthly"] = (totals["total_cost"] / days_elapsed) * 30
        else:
            totals["projected_monthly"] = None

        daily = conn.execute(
            f"""SELECT
                  DATE(timestamp, 'unixepoch', 'localtime') AS day,
                  COUNT(*)                                    AS requests,
                  SUM(total_tokens)                           AS total_tokens,
                  SUM(cost_usd)                               AS cost
               FROM usage_logs {where}
               GROUP BY day
               ORDER BY day ASC
               LIMIT 30""",
            p,
        ).fetchall()

        # Always show all models for the filter dropdown — never filtered
        models_rows = conn.execute(
            """SELECT
                  model,
                  COUNT(*)          AS requests,
                  SUM(total_tokens) AS total_tokens,
                  SUM(cost_usd)     AS cost,
                  AVG(duration_ms)  AS avg_latency_ms
               FROM usage_logs
               GROUP BY model
               ORDER BY cost DESC""",
        ).fetchall()

        models = []
        for row in models_rows:
            m = dict(row)
            # fetch per-model durations for p50/p95
            model_durations = [
                r[0] for r in conn.execute(
                    "SELECT duration_ms FROM usage_logs WHERE model = ? AND duration_ms IS NOT NULL",
                    (m["model"],),
                ).fetchall()
            ]
            if model_durations:
                m["latency"] = {
                    "avg": m["avg_latency_ms"],
                    "p50": _percentile(model_durations, 50),
                    "p95": _percentile(model_durations, 95),
                }
            else:
                m["latency"] = None
            models.append(m)

        return {
            "totals": totals,
            "daily":  [dict(r) for r in daily],
            "models": models,
        }


def get_skill_stats() -> list[dict]:
    """Return per-skill cost/usage breakdown."""
    with _conn() as conn:
        rows = conn.execute(
            """SELECT
                  skill_name,
                  COUNT(*)          AS requests,
                  SUM(total_tokens) AS total_tokens,
                  SUM(cost_usd)     AS cost,
                  AVG(cost_usd)     AS avg_cost,
                  AVG(duration_ms)  AS avg_latency_ms
               FROM usage_logs
               WHERE skill_name IS NOT NULL
               GROUP BY skill_name
               ORDER BY cost DESC"""
        ).fetchall()
        return [dict(r) for r in rows]


def get_tool_stats(model_filter: str | None = None) -> list[dict]:
    """Return per-tool call counts, unique request counts, and last-used time."""
    where = "WHERE tl.model = ?" if model_filter else ""
    p: tuple = (model_filter,) if model_filter else ()

    with _conn() as conn:
        rows = conn.execute(
            f"""SELECT
                  tl.tool_name,
                  COUNT(*)                                                          AS calls,
                  COUNT(DISTINCT tl.request_id)                                    AS unique_requests,
                  MAX(tl.timestamp)                                                 AS last_used,
                  GROUP_CONCAT(DISTINCT tl.skill_name)                             AS skills,
                  SUM(CASE WHEN tl.timestamp > strftime('%s', 'now', '-7 days')
                           THEN 1 ELSE 0 END)                                      AS calls_7d
               FROM tool_logs tl
               {where}
               GROUP BY tl.tool_name
               ORDER BY calls DESC
               LIMIT 30""",
            p,
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


def export_csv() -> str:
    """Return all usage_logs rows as a CSV string."""
    with _conn() as conn:
        rows = conn.execute(
            """SELECT id, timestamp, model, input_tokens, output_tokens,
                      total_tokens, cost_usd, skill_name, duration_ms
               FROM usage_logs
               ORDER BY timestamp ASC"""
        ).fetchall()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "datetime", "model", "input_tokens", "output_tokens",
                     "total_tokens", "cost_usd", "skill_name", "duration_ms"])
    for row in rows:
        r = dict(row)
        writer.writerow([
            r["id"],
            datetime.fromtimestamp(r["timestamp"]).isoformat(),
            r["model"],
            r["input_tokens"],
            r["output_tokens"],
            r["total_tokens"],
            r["cost_usd"],
            r["skill_name"] or "",
            r["duration_ms"] if r["duration_ms"] is not None else "",
        ])
    return buf.getvalue()
