---
name: Stock Quote
category: Finance
icon: 💹
status: active
triggers:
  - price of
  - stock price
  - how is
  - what is
  - quote for
---
Call get_stock_price with the ticker the user mentions. Present price, open, high, low,
and volume in a clean table. Note the exchange and currency. If the symbol isn't found,
use search_stocks to suggest alternatives.
