#!/usr/bin/env python3
"""
Chart renderer MCP server.

Validates render_chart tool calls and returns {"status": "ok"}.
The actual rendering happens in the frontend — the harness intercepts
ToolCallPart args from all_messages() and emits widget SSE events.
"""

import sys
import logging

from fastmcp import FastMCP

# MCP requires stdout to be JSON only
logging.basicConfig(stream=sys.stderr, level=logging.ERROR)

mcp = FastMCP("Chart Renderer")

VALID_TYPES = {"candlestick", "line", "area", "bar", "gauge"}


@mcp.tool()
def render_chart(
    widget_type: str,
    title: str,
    data: list[dict],
    x_key: str = "date",
    y_keys: list[str] | None = None,
    config: dict | None = None,
) -> dict:
    """Declare intent to render a chart widget in the UI.

    Call this tool when you have tabular/time-series data that benefits from
    visual presentation. The harness intercepts this call and emits a widget
    SSE event to the frontend.

    widget_type options:
    - candlestick: OHLCV price history (requires open, high, low, close fields)
    - line: time-series with one or more series (use y_keys for multiple)
    - area: same as line but with gradient fill
    - bar: categorical or volume data
    - gauge: single numeric value 0-100 (e.g. RSI)

    Always call render_chart BEFORE writing your text analysis so the chart
    appears above the text in the UI.
    """
    if widget_type not in VALID_TYPES:
        return {"status": "error", "message": f"Unknown widget_type '{widget_type}'. Valid: {sorted(VALID_TYPES)}"}
    if not data:
        return {"status": "error", "message": "data must be non-empty"}
    return {"status": "ok"}


if __name__ == "__main__":
    mcp.run()
