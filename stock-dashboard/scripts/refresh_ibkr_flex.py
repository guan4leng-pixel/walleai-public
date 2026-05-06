#!/usr/bin/env python3
"""Refresh stock-dashboard/data/portfolio.json from IBKR Flex.

Flow:
1) SendRequest
2) poll GetStatement until ready
3) parse the returned XML into the dashboard facts file

Credentials/IDs are read from env or CLI:
- IBKR_FLEX_TOKEN
- IBKR_FLEX_QUERY_ID

Optional env/CLI overrides:
- IBKR_FLEX_REQUEST_ID (if you already have the request id)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, asdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SG_TZ = timezone(timedelta(hours=8))
BASE = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService"
SEND_URL = f"{BASE}.SendRequest"
STATEMENT_URL = f"{BASE}.GetStatement"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "data" / "portfolio.json"
DEFAULT_RAW_OUTPUT = Path(__file__).resolve().parents[1] / "data" / "portfolio.flex.xml"
DEFAULT_JSON_PRETTY = 2


@dataclass
class Record:
    ticker: str
    displayTicker: str
    company: str
    market: str
    currency: str
    quantity: float
    price: float | None = None
    priceTimestamp: str | None = None
    priceSource: str = "IBKR Flex"
    portfolioSource: str = "IBKR Flex"
    retrievedAt: str | None = None
    ma50: float | None = None
    ma200: float | None = None
    ema9: float | None = None
    ema20: float | None = None
    vwap: float | None = None
    rsi: float | None = None
    support: float | None = None
    resistance: float | None = None
    events: list[dict[str, Any]] | None = None
    fundamentals: dict[str, Any] | None = None
    optionChain: dict[str, Any] | None = None
    marketValue: float | None = None
    marketValueCurrency: str | None = None
    pageUrlLabel: str = "open"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Refresh dashboard portfolio.json from IBKR Flex")
    p.add_argument("--token", default=os.getenv("IBKR_FLEX_TOKEN"), help="IBKR Flex token (env: IBKR_FLEX_TOKEN)")
    p.add_argument("--query-id", default=os.getenv("IBKR_FLEX_QUERY_ID"), help="IBKR Flex query id (env: IBKR_FLEX_QUERY_ID)")
    p.add_argument("--request-id", default=os.getenv("IBKR_FLEX_REQUEST_ID"), help="Existing request id to fetch directly (env: IBKR_FLEX_REQUEST_ID)")
    p.add_argument("--send-url", default=SEND_URL, help="Flex SendRequest URL")
    p.add_argument("--statement-url", default=STATEMENT_URL, help="Flex GetStatement URL")
    p.add_argument("--v", default="3", help="Flex API version")
    p.add_argument("--poll-delay", type=float, default=8.0, help="Seconds between polls")
    p.add_argument("--max-attempts", type=int, default=18, help="Maximum poll attempts")
    p.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout seconds")
    p.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output JSON path")
    p.add_argument("--raw-output", type=Path, default=DEFAULT_RAW_OUTPUT, help="Raw XML output path")
    p.add_argument("--pretty", type=int, default=DEFAULT_JSON_PRETTY, help="JSON indentation")
    p.add_argument("--no-enrich-prices", action="store_true", help="Skip public price enrichment")
    return p.parse_args()


def now_iso() -> str:
    return datetime.now(SG_TZ).isoformat(timespec="seconds")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def http_get(url: str, timeout: float) -> str:
    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def http_get_json(url: str, timeout: float) -> dict[str, Any] | None:
    try:
        raw = http_get(url, timeout)
        return json.loads(raw)
    except Exception:
        return None


def send_request(token: str, query_id: str, version: str, send_url: str, timeout: float) -> str:
    params = urlencode({"t": token, "q": query_id, "v": version})
    text = http_get(f"{send_url}?{params}", timeout)
    request_id = extract_request_id(text)
    if not request_id:
        raise RuntimeError(f"Could not parse request id from SendRequest response: {text[:400]}")
    return request_id


def extract_request_id(text: str) -> str | None:
    patterns = [
        r"(?i)(?:requestid|request-id|referencecode|requestcode)\D*(\d{4,})",
        r"(?i)q=(\d{4,})",
        r"(?i)<(?:requestid|referencecode|requestcode)>(\d+)</",
        r"(?i)request\s*id\s*[:=]\s*(\d{4,})",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            return m.group(1)
    return None


def looks_ready(text: str) -> bool:
    t = text.strip().lower()
    if not t:
        return False
    if "not ready" in t or "pending" in t or "processing" in t:
        return False
    if "statements" in t and "flexstatement" in t:
        return True
    if "<?xml" in t or "<flexstatement" in t or "<flexquerystatement" in t or "<statement" in t:
        return True
    # Some responses are plain XML fragments without an XML prolog.
    if "<" in t and ("portfolio" in t or "account" in t or "trade" in t):
        return True
    return False


def get_statement(request_id: str, token: str, version: str, statement_url: str, timeout: float) -> str:
    params = urlencode({"q": request_id, "t": token, "v": version})
    return http_get(f"{statement_url}?{params}", timeout)


def poll_statement(request_id: str, token: str, version: str, statement_url: str, timeout: float, delay: float, attempts: int) -> str:
    last = ""
    for i in range(1, attempts + 1):
        last = get_statement(request_id, token, version, statement_url, timeout)
        if looks_ready(last):
            return last
        time.sleep(delay)
    raise TimeoutError(f"Flex statement not ready after {attempts} attempts; last response: {last[:500]}")


def parse_float(text: str | None) -> float | None:
    if text is None:
        return None
    s = str(text).strip().replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def collect_fields(elem: ET.Element) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in elem.attrib.items():
        lk = local_name(k)
        if v is not None and str(v).strip() and lk not in out:
            out[lk] = str(v).strip()
    for node in elem.iter():
        if node is elem:
            continue
        name = local_name(node.tag)
        text = (node.text or "").strip()
        if text and name not in out:
            out[name] = text
    text = (elem.text or "").strip()
    if text and local_name(elem.tag) not in out:
        out[local_name(elem.tag)] = text
    return out


def pick(fields: dict[str, str], names: Iterable[str]) -> str | None:
    for n in names:
        v = fields.get(n.lower())
        if v:
            return v
    return None


def market_from_fields(fields: dict[str, str], currency: str | None) -> str:
    exch = (pick(fields, ["exchange", "market", "primaryexch", "securityexchange"]) or "").upper()
    cur = (currency or "").upper()
    if exch in {"HK", "HKG", "SEHK"} or cur == "HKD":
        return "HK"
    if exch in {"SG", "SGX"} or cur == "SGD":
        return "SG"
    return "US"


def normalize_ticker(symbol: str, market: str) -> tuple[str, str]:
    t = symbol.strip().upper()
    m = market.upper()
    if m == "HK":
        core = t.replace(".HK", "")
        if core.isdigit():
            core = core.zfill(4)
        return core, f"{core}.HK"
    if m == "SG":
        core = t.replace(".SI", "")
        return core, f"{core}.SI"
    return t.replace(".HK", "").replace(".SI", ""), t.replace(".HK", "").replace(".SI", "")


def parse_item(elem: ET.Element) -> dict[str, Any] | None:
    fields = collect_fields(elem)
    symbol = pick(fields, ["symbol", "ticker", "localsymbol", "underlyingsymbol", "description"])
    qty = parse_float(pick(fields, ["quantity", "position", "shares", "netposition", "openposition"]))
    if not symbol or qty is None:
        return None
    currency = pick(fields, ["currency", "tradingcurrency", "reportcurrency"]) or ""
    market = market_from_fields(fields, currency)
    display, ticker = normalize_ticker(symbol, market)
    company = pick(fields, ["description", "name", "securityname", "underlyingdescription"]) or display
    price = parse_float(pick(fields, ["marketprice", "markprice", "price", "closeprice", "lastprice", "mark"]))
    market_value = parse_float(pick(fields, ["marketvalue", "value", "positionvalue"]))
    unrealized = parse_float(pick(fields, ["unrealizedpl", "unrealizedpnl", "upl"]))
    realized = parse_float(pick(fields, ["realizedpl", "realizedpnl", "rpl"]))
    right = (pick(fields, ["right", "callput"]) or "").capitalize()
    expiry = pick(fields, ["expiry", "expiration", "maturitydate", "expdate"])
    strike = parse_float(pick(fields, ["strike", "strikeprice"]))
    option_like = bool(right) or bool(expiry) or strike is not None or (pick(fields, ["securitytype", "sec_type", "type"]) or "").upper() in {"OPT", "OPTION"}

    record: dict[str, Any] = {
        "ticker": ticker,
        "displayTicker": display,
        "company": company,
        "market": market,
        "currency": currency or ("HKD" if market == "HK" else "SGD" if market == "SG" else "USD"),
        "quantity": qty,
        "price": price,
        "priceTimestamp": now_iso(),
        "priceSource": "IBKR Flex",
        "portfolioSource": "IBKR Flex",
        "retrievedAt": now_iso(),
        "marketValue": market_value,
        "marketValueCurrency": currency or ("HKD" if market == "HK" else "SGD" if market == "SG" else "USD"),
        "pageUrlLabel": "open",
    }
    if option_like:
        record["optionChain"] = {
            "puts": [] if right != "Put" else [{"expiry": expiry, "strike": strike, "premium": None, "delta": None}],
            "calls": [] if right != "Call" else [{"expiry": expiry, "strike": strike, "premium": None, "delta": None}],
        }
    if unrealized is not None or realized is not None:
        record["fundamentals"] = {"quality": 10, "unrealizedPL": unrealized, "realizedPL": realized}
    if not option_like:
        record["fundamentals"] = record.get("fundamentals", {"quality": 10})
    return record


def parse_statement_xml(xml_text: str) -> dict[str, Any]:
    root = ET.fromstring(xml_text)
    generated = now_iso()
    records: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    for elem in root.iter():
        record = parse_item(elem)
        if not record:
            continue
        opt = record.get("optionChain")
        key = (
            record["ticker"],
            record["displayTicker"],
            record["market"],
            record["currency"],
            record["quantity"],
            json.dumps(opt, sort_keys=True) if opt else None,
        )
        if key in seen:
            continue
        seen.add(key)
        records.append(record)

    holdings = [r for r in records if not r.get("optionChain")]
    options = []
    for r in records:
        if r.get("optionChain"):
            # flatten into option list for the dashboard chip strip
            for right, side in (("Put", "puts"), ("Call", "calls")):
                for opt in r["optionChain"].get(side, []):
                    if not opt:
                        continue
                    options.append({
                        "underlyingTicker": r["ticker"],
                        "underlying": r["displayTicker"],
                        "market": r["market"],
                        "contract": f"{r['displayTicker']} {opt.get('expiry', '')} {opt.get('strike', '')} {right}",
                        "expiry": opt.get("expiry"),
                        "right": right,
                        "qty": -1,
                        "source": "IBKR Flex",
                    })
    summary = {
        "asOf": generated[:10],
        "generatedAt": generated,
        "source": "IBKR Flex",
        "holdings": holdings,
        "options": options,
    }
    return summary


def enrich_prices(data: dict[str, Any], timeout: float) -> dict[str, Any]:
    # Try to enrich with Yahoo public chart data for each holding when not already present.
    # Keeps the refresh independent from the dashboard.
    try:
        from urllib.parse import quote as url_quote
    except Exception:
        return data

    def yahoo_chart(symbol: str) -> dict[str, Any] | None:
        url = (
            "https://query1.finance.yahoo.com/v8/finance/chart/"
            + url_quote(symbol)
            + "?range=1y&interval=1d&includePrePost=false&events=div%2Csplits"
        )
        try:
            payload = json.loads(http_get(url, timeout))
            result = payload.get("chart", {}).get("result", [])
            if not result:
                return None
            r0 = result[0]
            meta = r0.get("meta", {})
            quote = ((r0.get("indicators") or {}).get("quote") or [{}])[0]
            closes = [v for v in (quote.get("close") or []) if v is not None]
            latest = meta.get("regularMarketPrice")
            if latest is None and closes:
                latest = closes[-1]
            ts = None
            if meta.get("regularMarketTime"):
                ts = datetime.fromtimestamp(int(meta["regularMarketTime"]), tz=timezone.utc).astimezone(SG_TZ).isoformat(timespec="seconds")
            elif r0.get("timestamp"):
                ts = datetime.fromtimestamp(int(r0["timestamp"][-1]), tz=timezone.utc).astimezone(SG_TZ).isoformat(timespec="seconds")
            return {
                "price": latest,
                "priceTimestamp": ts,
                "priceSource": "Yahoo Finance chart",
                "ma50": moving_average(closes, 50),
                "ma200": moving_average(closes, 200),
                "ema9": ema(closes, 9),
                "ema20": ema(closes, 20),
                "vwap": sum(closes[-10:]) / min(len(closes), 10) if closes else None,
                "rsi": compute_rsi(closes),
                "support": recent_low(closes),
                "resistance": recent_high(closes),
            }
        except Exception:
            return None

    for holding in data.get("holdings", []):
        sym = holding.get("ticker") or holding.get("displayTicker")
        market = holding.get("market", "US")
        ysym = normalize_ticker(sym, market)[1]
        enriched = yahoo_chart(ysym)
        if enriched:
            for k, v in enriched.items():
                if holding.get(k) in (None, "", []) and v is not None:
                    holding[k] = v
    data["generatedAt"] = now_iso()
    return data


def moving_average(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    slice_ = values[-period:]
    return sum(slice_) / len(slice_)


def compute_rsi(values: list[float], period: int = 14) -> float | None:
    if len(values) <= period:
        return None
    gains = losses = 0.0
    for i in range(1, period + 1):
        diff = values[i] - values[i - 1]
        if diff >= 0:
            gains += diff
        else:
            losses -= diff
    avg_gain = gains / period
    avg_loss = losses / period
    for i in range(period + 1, len(values)):
        diff = values[i] - values[i - 1]
        gain = max(diff, 0)
        loss = max(-diff, 0)
        avg_gain = ((avg_gain * (period - 1)) + gain) / period
        avg_loss = ((avg_loss * (period - 1)) + loss) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def recent_low(values: list[float], lookback: int = 20) -> float | None:
    if not values:
        return None
    return min(values[-lookback:])


def recent_high(values: list[float], lookback: int = 20) -> float | None:
    if not values:
        return None
    return max(values[-lookback:])


def write_json(path: Path, obj: dict[str, Any], pretty: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=pretty, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    if not args.token:
        print("Missing IBKR_FLEX_TOKEN (or --token)", file=sys.stderr)
        return 2
    if not args.query_id and not args.request_id:
        print("Missing IBKR_FLEX_QUERY_ID (or --query-id) or an existing request id", file=sys.stderr)
        return 2

    try:
        request_id = args.request_id or send_request(args.token, args.query_id, args.v, args.send_url, args.timeout)
        xml_text = poll_statement(request_id, args.token, args.v, args.statement_url, args.timeout, args.poll_delay, args.max_attempts)
        args.raw_output.parent.mkdir(parents=True, exist_ok=True)
        args.raw_output.write_text(xml_text, encoding="utf-8")
        data = parse_statement_xml(xml_text)
        if not args.no_enrich_prices:
            data = enrich_prices(data, args.timeout)
        write_json(args.output, data, args.pretty)
        print(json.dumps({"status": "ok", "requestId": request_id, "output": str(args.output), "rawOutput": str(args.raw_output)}, ensure_ascii=False))
        return 0
    except (HTTPError, URLError) as e:
        print(f"IBKR Flex HTTP error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"IBKR Flex refresh failed: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
