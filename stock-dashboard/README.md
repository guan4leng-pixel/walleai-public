# Stock & Options Dashboard

A one-page mobile-friendly dashboard for fast stock review and option setup thinking.

## What it does
- Shows a clickable list of your owned shares and open options
- Clicking a row loads the 12-field analysis in the bottom section
- Displays source and retrieval time for both portfolio and price data
- Reads prepared facts from `data/portfolio.json` when available
- No input controls; list-only interaction

## Files
- `index.html`
- `styles.css`
- `app.js`

## Data flow
1. Prep task refreshes `data/portfolio.json` from IBKR Flex / statement export
2. Static page loads prepared facts first
3. Latest pricing: Yahoo Finance chart best effort
4. If live data fails, fall back to embedded portfolio/demo data or manual JSON

## Flex refresh
Set these env vars, then run:

```bash
export IBKR_FLEX_TOKEN=...
export IBKR_FLEX_QUERY_ID=...
python3 stock-dashboard/scripts/refresh_ibkr_flex.py
```

Optional:
- `IBKR_FLEX_REQUEST_ID` if you already have the statement request id
- `--no-enrich-prices` to skip public price enrichment

## List columns
- Ticker / Share
- Qty
- Latest Price
- Trend
- RSI
- Sell Put
- Covered Call
- Source / Retrieved
- URL

## Dashboard fields
1. Ticker / Share Name
2. Current Price
3. Trend Status
4. RSI Status
5. Cross Signal
6. Support Zone
7. Resistance Zone
8. Event Risk, Next 30 Days
9. Sell Put Rating
10. Covered Call Rating
11. Suggested Option Setup
12. Final Action

## Local preview
```bash
cd stock-dashboard
python3 -m http.server 8000
```
Open:
- `http://localhost:8000/stock-dashboard/index.html`

## GitHub Pages
Publish the repo from GitHub Pages and keep this path available:
- `/stock-dashboard/index.html`

## Notes
- For education and research only. Not financial advice.
- If live retrieval is blocked, paste JSON into the manual fallback box.
