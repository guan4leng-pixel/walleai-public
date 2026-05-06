# Stock & Options Dashboard

A one-page mobile-friendly dashboard for fast stock review and option setup thinking.

## What it does
- Accepts a ticker or share name
- Shows 12 concise analysis fields only
- Supports demo mode for:
  - AAPL
  - BABA
  - 0700.HK
  - SOFI
- Includes manual JSON fallback
- Designed for GitHub Pages

## Files
- `index.html`
- `styles.css`
- `app.js`

## Data flow
1. Try Yahoo Finance chart data first for price and history.
2. Derive trend, RSI, support, resistance, and score logic.
3. Fall back to demo data or manual JSON when live data fails.
4. Option-chain details are estimated when chain data is not available.

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
Open `index.html` in a browser, or serve the folder:

```bash
cd stock-dashboard
python3 -m http.server 8000
```

Then open:
- `http://localhost:8000/`

## GitHub Pages
Publish the repo using GitHub Pages and ensure this path is available:
- `/stock-dashboard/index.html`

If you want a root landing page, link to the dashboard from the repo README.

## Notes
- For education and research only. Not financial advice.
- If live retrieval is blocked, paste JSON into the manual fallback box.
