# walleai-public

## Dashboard
- [Stock & Options Dashboard](stock-dashboard/index.html)

## Data flow
- Prep task: refresh `stock-dashboard/data/portfolio.json` from IBKR Flex / statement export
- Publish task: deploy static files to GitHub Pages

## Refresh command
```bash
export IBKR_FLEX_TOKEN=...
export IBKR_FLEX_QUERY_ID=...
python3 stock-dashboard/scripts/refresh_ibkr_flex.py
```

## Notes
- Includes a clickable holdings list with bottom-section analysis.
- Displays portfolio/source and retrieval timestamps.
- For education and research only. Not financial advice.
