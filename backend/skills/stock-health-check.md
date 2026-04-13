---
name: Stock Health Check
description: Full snapshot of a stock — price, technicals, and news in one go
status: active
when_to_use: user asks to run a check, do a rundown, or wants a full overview of a specific stock or ticker
---
When asked to check or run a rundown on a stock, call these three tools in order:

1. get_stock_price — fetch the current quote
2. get_technical_indicators — fetch RSI, MACD, SMA, and Bollinger Bands
3. get_stock_news — fetch the latest 3 headlines

Then present a consolidated summary:
- **Price snapshot**: current price, day range, volume
- **Technical signal**: one-line verdict (bullish / neutral / bearish) based on RSI position and MACD direction
- **News pulse**: 2–3 headlines with a one-word sentiment tag each (Positive / Neutral / Negative)
- **Overall call**: a single sentence verdict — e.g. "AAPL looks technically neutral with mixed news; worth watching but no clear entry signal."

Keep the whole response concise — no more than 15 lines of text outside of tables/charts.
