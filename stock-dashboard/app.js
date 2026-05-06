const SAMPLE_DATA = {
  AAPL: {
    ticker: 'AAPL',
    company: 'Apple Inc.',
    market: 'US',
    currency: 'USD',
    price: 189.34,
    priceTimestamp: '2026-05-06T09:30:00+08:00',
    source: 'sample data',
    ma50: 182.1,
    ma200: 175.3,
    ema9: 188.7,
    ema20: 186.9,
    vwap: 188.0,
    rsi: 61,
    support: 183.0,
    resistance: 195.0,
    events: [
      { date: '2026-05-12', label: 'Earnings', type: 'earnings' }
    ],
    fundamentals: { quality: 14 },
    optionChain: {
      puts: [{ expiry: '2026-06-19', strike: 182.5, premium: 2.15, delta: -0.24 }],
      calls: [{ expiry: '2026-06-05', strike: 195, premium: 1.85, delta: 0.21 }]
    }
  },
  BABA: {
    ticker: 'BABA',
    company: 'Alibaba Group ADR',
    market: 'US',
    currency: 'USD',
    price: 134.6,
    priceTimestamp: '2026-05-06T09:30:00+08:00',
    source: 'sample data',
    ma50: 132.0,
    ma200: 105.0,
    ema9: 133.9,
    ema20: 131.8,
    vwap: 133.2,
    rsi: 54,
    support: 129.0,
    resistance: 142.0,
    events: [
      { date: '2026-05-20', label: 'Results briefing', type: 'results' },
      { date: '2026-05-28', label: 'China policy risk watch', type: 'macro' }
    ],
    fundamentals: { quality: 11 },
    optionChain: {
      puts: [{ expiry: '2026-06-19', strike: 130, premium: 4.2, delta: -0.27 }],
      calls: [{ expiry: '2026-06-19', strike: 142, premium: 3.15, delta: 0.23 }]
    }
  },
  '0700.HK': {
    ticker: '0700.HK',
    company: 'Tencent Holdings',
    market: 'HK',
    currency: 'HKD',
    price: 472.2,
    priceTimestamp: '2026-05-05T16:08:12+08:00',
    source: 'sample data',
    ma50: 448.0,
    ma200: 410.0,
    ema9: 468.4,
    ema20: 462.2,
    vwap: 466.8,
    rsi: 58,
    support: 450.0,
    resistance: 488.0,
    events: [
      { date: '2026-05-18', label: 'Results briefing', type: 'results' }
    ],
    fundamentals: { quality: 13 },
    optionChain: {
      puts: [{ expiry: '2026-06-18', strike: 450, premium: 9.8, delta: -0.25 }],
      calls: [{ expiry: '2026-06-18', strike: 490, premium: 8.9, delta: 0.22 }]
    }
  },
  SOFI: {
    ticker: 'SOFI',
    company: 'SoFi Technologies',
    market: 'US',
    currency: 'USD',
    price: 16.43,
    priceTimestamp: '2026-05-06T09:30:00+08:00',
    source: 'sample data',
    ma50: 17.1,
    ma200: 9.8,
    ema9: 16.9,
    ema20: 16.7,
    vwap: 16.6,
    rsi: 72,
    support: 15.8,
    resistance: 17.4,
    events: [
      { date: '2026-05-15', label: 'Earnings', type: 'earnings' }
    ],
    fundamentals: { quality: 8 },
    optionChain: {
      puts: [{ expiry: '2026-06-19', strike: 15, premium: 0.85, delta: -0.29 }],
      calls: [{ expiry: '2026-06-19', strike: 17.5, premium: 0.7, delta: 0.26 }]
    }
  }
};

const ui = {
  ticker: document.getElementById('tickerInput'),
  market: document.getElementById('marketSelect'),
  analyze: document.getElementById('analyzeBtn'),
  result: document.getElementById('result'),
  freshness: document.getElementById('freshness'),
  manualJson: document.getElementById('manualJson'),
  applyJson: document.getElementById('applyJsonBtn'),
  sampleButtons: Array.from(document.querySelectorAll('.sample-btn'))
};

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat('en-SG', {
  year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
});

function normalizeTicker(raw, market = 'US') {
  let t = String(raw || '').trim().toUpperCase();
  const m = String(market || 'US').toUpperCase();
  if (!t) return '';
  if (m === 'HK') {
    t = t.replace('.HK', '');
    t = t.replace(/^0+/, '');
    t = t.padStart(4, '0');
    return `${t}.HK`;
  }
  if (m === 'SG') {
    t = t.replace('.SI', '');
    return `${t}.SI`;
  }
  return t.replace(/\.(HK|SI)$/i, '');
}

function sameTicker(a, b) {
  return normalizeTicker(a, 'HK') === normalizeTicker(b, 'HK') || String(a).toUpperCase() === String(b).toUpperCase();
}

function badge(kind, text) {
  return `<span class="badge ${kind}">${text}</span>`;
}

function fmtCurrency(value, currency = '') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  const n = `${fmt.format(Number(value))}`;
  return currency ? `${n} ${currency}` : n;
}

function fmtPct(value) {
  return `${value >= 0 ? '+' : ''}${fmt.format(value)}%`;
}

function percentDiff(a, b) {
  if (!isFinite(a) || !isFinite(b) || b === 0) return 0;
  return ((a - b) / b) * 100;
}

function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b).setHours(0,0,0,0) - new Date(a).setHours(0,0,0,0)) / ms);
}

function nowStamp() {
  return dateFmt.format(new Date());
}

function average(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function movingAverage(values, period) {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  return average(slice);
}

function ema(values, period) {
  if (!values || values.length < period) return null;
  const k = 2 / (period + 1);
  let out = average(values.slice(0, period));
  for (let i = period; i < values.length; i++) out = values[i] * k + out * (1 - k);
  return out;
}

function rsi(values, period = 14) {
  if (!values || values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function recentHighLow(values, lookback = 20) {
  const slice = values.slice(-lookback);
  return { high: Math.max(...slice), low: Math.min(...slice) };
}

function standardDeviation(values) {
  if (!values.length) return null;
  const mean = average(values);
  const variance = average(values.map(v => (v - mean) ** 2));
  return Math.sqrt(variance);
}

function bollinger(values, period = 20, mult = 2) {
  const slice = values.slice(-period);
  if (slice.length < period) return null;
  const mid = average(slice);
  const sd = standardDeviation(slice);
  return { mid, upper: mid + mult * sd, lower: mid - mult * sd };
}

function computeTrend(record) {
  if (!record.price || !record.ma50 || !record.ma200) return 'Neutral';
  if (record.price > record.ma50 && record.ma50 > record.ma200) return 'Bullish';
  if (record.price < record.ma50 && record.ma50 < record.ma200) return 'Bearish';
  if (record.price > record.ma200) return 'Neutral';
  return 'Bearish';
}

function computeRSIStatus(value) {
  if (value === null || value === undefined) return 'Neutral';
  if (value < 30) return 'Oversold';
  if (value > 70) return 'Overbought';
  return 'Neutral';
}

function computeCross(record) {
  if (!record.ma50 || !record.ma200) return 'None';
  if (record.ma50 > record.ma200) return 'Golden Cross';
  if (record.ma50 < record.ma200) return 'Dead Cross';
  return 'None';
}

function computeEventRisk(record, days = 30) {
  const events = (record.events || []).filter(ev => {
    const d = daysBetween(new Date(), ev.date);
    return d >= 0 && d <= days;
  });
  const hasEarnings = events.some(ev => /earn/i.test(ev.label || ev.type || ''));
  if (hasEarnings) return { level: 'Red', events };
  if (events.length) return { level: 'Yellow', events };
  return { level: 'Green', events: [] };
}

function supportZone(record) {
  const zones = [record.support, record.ma50, record.ma200, record.vwap].filter(v => isFinite(v));
  if (!zones.length) return null;
  const low = Math.min(...zones);
  const high = Math.max(...zones.filter(v => v <= record.price || true));
  const anchor = zones.sort((a, b) => a - b)[Math.floor(zones.length / 2)] || low;
  return { low: Math.min(low, anchor * 0.985), high: Math.max(low, anchor * 1.015), anchor };
}

function resistanceZone(record) {
  const zones = [record.resistance, record.ma50, record.vwap].filter(v => isFinite(v));
  if (!zones.length) return null;
  const high = Math.max(...zones);
  const low = Math.min(...zones);
  const anchor = zones.sort((a, b) => a - b)[Math.floor(zones.length / 2)] || high;
  return { low: Math.min(high * 0.985, anchor * 0.985), high: Math.max(high, anchor * 1.015), anchor };
}

function scoreTrend(record) {
  let s = 0;
  if (record.price > record.ma200) s += 8;
  if (record.price > record.ma50) s += 5;
  if (record.ema9 && record.ema20 && record.ema9 > record.ema20) s += 3;
  if (record.price > record.vwap) s += 2;
  if (record.ma50 && record.ma200 && record.ma50 > record.ma200) s += 2;
  return Math.min(20, s);
}

function scoreMomentum(record) {
  let s = 0;
  const r = record.rsi;
  if (r >= 45 && r <= 65) s += 7;
  else if (r > 65 && r <= 75) s += 5;
  else if (r >= 30 && r < 45) s += 4;
  if (record.ema9 && record.ema20 && record.ema9 > record.ema20) s += 4;
  if (record.price > (record.ema9 || record.price)) s += 2;
  if ((record.price / (record.prevClose || record.price)) > 1.01) s += 2;
  return Math.min(15, s);
}

function scoreSupportResistance(record) {
  let s = 0;
  const sup = supportZone(record);
  const res = resistanceZone(record);
  const price = record.price;
  if (sup && price > sup.low && price < sup.high) s += 8;
  if (sup && percentDiff(price, sup.anchor) > -8 && percentDiff(price, sup.anchor) < 8) s += 4;
  if (res && percentDiff(res.anchor, price) > 0 && percentDiff(res.anchor, price) < 10) s += 3;
  return Math.min(15, s);
}

function scoreEventRisk(eventRisk) {
  if (eventRisk.level === 'Green') return 15;
  if (eventRisk.level === 'Yellow') return 9;
  return 3;
}

function estimatePremium(price, strike, kind) {
  const gap = Math.abs(percentDiff(price, strike));
  const base = Math.max(price * 0.012, strike * 0.01);
  const decay = Math.max(0.35, 1.8 - gap / 8);
  return +(base * decay * (kind === 'put' ? 1.05 : 0.95)).toFixed(2);
}

function scorePremium(record) {
  const put = buildSetup(record, 'put');
  const call = buildSetup(record, 'call');
  const premium = ((put.premium || 0) + (call.premium || 0)) / 2;
  const rel = premium / record.price * 100;
  if (rel >= 1.25) return 20;
  if (rel >= 0.9) return 16;
  if (rel >= 0.6) return 12;
  if (rel >= 0.35) return 8;
  return 4;
}

function scoreFundamental(record) {
  return Math.max(0, Math.min(15, Number(record.fundamentals?.quality ?? 10)));
}

function buildSetup(record, kind) {
  const support = supportZone(record);
  const resistance = resistanceZone(record);
  const chain = record.optionChain?.[kind === 'put' ? 'puts' : 'calls'] || [];
  const targetStrike = kind === 'put'
    ? (support ? +(support.anchor * 0.985).toFixed(2) : +(record.price * 0.95).toFixed(2))
    : (resistance ? +(resistance.anchor * 1.015).toFixed(2) : +(record.price * 1.05).toFixed(2));
  let chosen = null;
  if (chain.length) {
    chosen = chain.slice().sort((a, b) => Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike))[0];
  }
  const expiry = chosen?.expiry || addDays(new Date(), kind === 'put' ? 35 : 28);
  const dte = Math.max(1, daysBetween(new Date(), expiry));
  const strike = chosen?.strike ?? targetStrike;
  const premium = chosen?.premium ?? estimatePremium(record.price, strike, kind);
  const delta = chosen?.delta ?? (kind === 'put' ? -0.25 : 0.22);
  const gap = percentDiff(strike, record.price);
  const be = kind === 'put' ? +(strike - premium).toFixed(2) : null;
  const beGap = kind === 'put' ? percentDiff(record.price, be) : null;
  return { strategy: kind === 'put' ? 'Sell Put' : 'Covered Call', expiry: formatDate(expiry), dte, strike, premium, delta, gap, be, beGap };
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(v) {
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toISOString().slice(0, 10);
}

function actionRating(record, total, eventRisk, sellPutRating, ccRating) {
  const trend = computeTrend(record);
  const rsiStatus = computeRSIStatus(record.rsi);
  const cross = computeCross(record);
  let action = 'Watchlist';
  let reason = 'Mixed signals; wait for better structure or cleaner entry.';

  if (eventRisk.level === 'Red') {
    action = 'Avoid';
    reason = 'Major event risk is inside the next 30 days, so option risk is elevated.';
  } else if (cross === 'Dead Cross' && record.price < record.ma200) {
    action = 'Avoid';
    reason = 'Dead cross plus price below the 200-day average is a weak setup.';
  } else if (sellPutRating === 'Good' && trend !== 'Bearish') {
    action = 'Sell Put';
    reason = 'Trend and support look acceptable, so a put near support is reasonable.';
  } else if (ccRating === 'Good' && rsiStatus === 'Overbought') {
    action = 'Sell Covered Call';
    reason = 'RSI is elevated and price is near resistance, so a covered call is attractive.';
  } else if (total >= 80) {
    action = 'Buy / Add';
    reason = 'Strong score with supportive trend and manageable event risk.';
  } else if (total >= 65) {
    action = 'Hold';
    reason = 'Setup is acceptable, but there is not enough edge to press harder.';
  } else if (total >= 50) {
    action = 'Watchlist';
    reason = 'Signals are mixed; monitor for support, trend improvement, or better premium.';
  } else {
    action = 'Avoid';
    reason = 'Risk/reward is not compelling enough right now.';
  }

  if (record.rsi < 30 && record.price < record.ma200) {
    action = 'Avoid';
    reason = 'Oversold is not enough when price is still under the 200-day average.';
  }
  return { action, reason };
}

function sellPutRating(record, eventRisk) {
  const trend = computeTrend(record);
  const cross = computeCross(record);
  const support = supportZone(record);
  const rsiStatus = computeRSIStatus(record.rsi);
  if (eventRisk.level === 'Red') return 'Avoid';
  if (trend === 'Bearish' || cross === 'Dead Cross') return 'Avoid';
  if (record.price < record.ma200) return 'Avoid';
  if (record.price > record.ma50 && support && record.price > support.low && rsiStatus !== 'Oversold') return 'Good';
  if (rsiStatus === 'Oversold' && record.price > support?.low) return 'Watch';
  return 'Watch';
}

function coveredCallRating(record, eventRisk) {
  const rsiStatus = computeRSIStatus(record.rsi);
  const res = resistanceZone(record);
  if (eventRisk.level === 'Red') return 'Watch';
  if (rsiStatus === 'Overbought' || (res && record.price >= res.low)) return 'Good';
  if (computeTrend(record) === 'Bullish') return 'Watch';
  return 'Avoid';
}

function buildField(title, body, kind = 'neutral', full = false) {
  return `
    <article class="card field ${full ? 'field--full' : ''}">
      <h2>${title}</h2>
      <div class="field__value">${body}</div>
    </article>
  `;
}

function render(record) {
  const trend = computeTrend(record);
  const rsiStatus = computeRSIStatus(record.rsi);
  const cross = computeCross(record);
  const eventRisk = computeEventRisk(record);
  const sellPut = sellPutRating(record, eventRisk);
  const coveredCall = coveredCallRating(record, eventRisk);
  const trendPts = scoreTrend(record);
  const momPts = scoreMomentum(record);
  const srPts = scoreSupportResistance(record);
  const eventPts = scoreEventRisk(eventRisk);
  const premiumPts = scorePremium(record);
  const fundamentalPts = scoreFundamental(record);
  const total = trendPts + momPts + srPts + eventPts + premiumPts + fundamentalPts;
  const action = actionRating(record, total, eventRisk, sellPut, coveredCall);
  const support = supportZone(record);
  const resistance = resistanceZone(record);
  const putSetup = buildSetup(record, 'put');
  const callSetup = buildSetup(record, 'call');
  const priceAge = record.priceTimestamp ? `Delayed price / ${dateFmt.format(new Date(record.priceTimestamp))}` : 'No timestamp';
  const sourceText = record.source ? `Source: ${record.source}` : 'Source: unavailable';
  const eventLines = (eventRisk.events || []).map(ev => `${ev.date} — ${ev.label}`).join('<br>') || 'No major events in next 30 days.';

  const cards = [
    buildField('Ticker / Share Name', `${record.ticker} — ${record.company}<br><span class="field__small">${record.market} • ${record.currency}</span>`),
    buildField('Current Price', `${fmtCurrency(record.price, record.currency)}<br><span class="field__small">${priceAge}<br>${sourceText}</span>`),
    buildField('Trend Status', `${badge(trend === 'Bullish' ? 'green' : trend === 'Bearish' ? 'red' : 'yellow', trend)}<div class="field__small">Price vs 50D/200D, EMA 9/20, and VWAP.</div>`),
    buildField('RSI Status', `${badge(rsiStatus === 'Overbought' ? 'red' : rsiStatus === 'Oversold' ? 'green' : 'yellow', rsiStatus)}<div class="field__small">RSI ${record.rsi ?? 'N/A'}.</div>`),
    buildField('Cross Signal', `${badge(cross === 'Golden Cross' ? 'green' : cross === 'Dead Cross' ? 'red' : 'neutral', cross)}<div class="field__small">50-day versus 200-day structure.</div>`),
    buildField('Support Zone', `${support ? `${fmtCurrency(support.low, record.currency)} – ${fmtCurrency(support.high, record.currency)}` : 'N/A'}<div class="field__small">Sell-put anchor: ${support ? fmtCurrency(support.anchor, record.currency) : 'N/A'}</div>`),
    buildField('Resistance Zone', `${resistance ? `${fmtCurrency(resistance.low, record.currency)} – ${fmtCurrency(resistance.high, record.currency)}` : 'N/A'}<div class="field__small">Covered-call guide: ${resistance ? fmtCurrency(resistance.anchor, record.currency) : 'N/A'}</div>`),
    buildField('Event Risk, Next 30 Days', `${badge(eventRisk.level === 'Green' ? 'green' : eventRisk.level === 'Yellow' ? 'yellow' : 'red', eventRisk.level)}<div class="field__small">${eventLines}</div>`),
    buildField('Sell Put Rating', `${badge(sellPut === 'Good' ? 'green' : sellPut === 'Watch' ? 'yellow' : 'red', sellPut)}<div class="field__small">Prefer strikes below support and avoid red event windows.</div>`),
    buildField('Covered Call Rating', `${badge(coveredCall === 'Good' ? 'green' : coveredCall === 'Watch' ? 'yellow' : 'red', coveredCall)}<div class="field__small">Prefer strikes above resistance and near overbought conditions.</div>`),
    buildField('Suggested Option Setup', `
      <div class="stack">
        <div class="setup-item"><strong>${putSetup.strategy}</strong><span>${putSetup.expiry} • ${putSetup.dte} DTE • Strike ${fmtCurrency(putSetup.strike, record.currency)} • Est. premium ${fmtCurrency(putSetup.premium, record.currency)} • Δ ${fmt.format(putSetup.delta)} • Gap ${fmtPct(putSetup.gap)} • BE ${fmtCurrency(putSetup.be, record.currency)} • BE gap ${fmtPct(putSetup.beGap)}</span></div>
        <div class="setup-item"><strong>${callSetup.strategy}</strong><span>${callSetup.expiry} • ${callSetup.dte} DTE • Strike ${fmtCurrency(callSetup.strike, record.currency)} • Est. premium ${fmtCurrency(callSetup.premium, record.currency)} • Δ ${fmt.format(callSetup.delta)} • Gap ${fmtPct(callSetup.gap)}${record.optionChain ? '' : ' • option price unavailable'}</span></div>
      </div>
    `),
    buildField('Final Action', `
      <div class="score-row">
        ${badge(action.action === 'Avoid' ? 'red' : action.action === 'Watchlist' ? 'yellow' : action.action === 'Sell Put' || action.action === 'Sell Covered Call' ? 'blue' : 'green', action.action)}
        <span class="score">${total}/100</span>
        <span class="field__small">${total >= 80 ? 'Strong Candidate' : total >= 65 ? 'Acceptable' : total >= 50 ? 'Watchlist' : 'Avoid'}</span>
      </div>
      <div class="field__small" style="margin-top:10px">${action.reason}<br>Trend ${trendPts}/20 • Momentum ${momPts}/15 • Support/Resistance ${srPts}/15 • Event ${eventPts}/15 • Premium ${premiumPts}/20 • Fundamental ${fundamentalPts}/15</div>
    `, 'blue', true)
  ];

  ui.result.innerHTML = cards.join('');
  ui.freshness.textContent = `Freshness: ${nowStamp()} • ${record.source || 'manual/sample'}`;
}

function parseManual() {
  try {
    return JSON.parse(ui.manualJson.value);
  } catch (err) {
    alert('Manual JSON is invalid.');
    return null;
  }
}

async function tryLiveFetch(symbol, market) {
  const ySymbol = normalizeTicker(symbol, market);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?range=1y&interval=1d&includePrePost=false&events=div%2Csplits`;
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error('Yahoo fetch failed');
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('No chart data');
  const meta = result.meta || {};
  const closes = result?.indicators?.quote?.[0]?.close?.filter(v => v != null) || [];
  const highs = result?.indicators?.quote?.[0]?.high?.filter(v => v != null) || [];
  const lows = result?.indicators?.quote?.[0]?.low?.filter(v => v != null) || [];
  const ts = result.timestamp || [];
  const prices = closes;
  const price = meta.regularMarketPrice ?? prices.at(-1);
  const timestamp = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : (ts.at(-1) ? new Date(ts.at(-1) * 1000).toISOString() : null);
  const ma50 = movingAverage(prices, 50);
  const ma200 = movingAverage(prices, 200);
  const ema9 = ema(prices, 9);
  const ema20 = ema(prices, 20);
  const vwap = average((result?.indicators?.quote?.[0]?.close || []).slice(-10).filter(v => v != null));
  const rsiVal = rsi(prices, 14);
  const band = bollinger(prices, 20, 2);
  const hiLo = recentHighLow(prices, 20);
  return {
    ticker: ySymbol,
    company: meta.longName || meta.shortName || ySymbol,
    market: market,
    currency: meta.currency || '',
    price,
    priceTimestamp: timestamp,
    source: 'Yahoo Finance chart',
    ma50,
    ma200,
    ema9,
    ema20,
    vwap,
    rsi: rsiVal,
    support: Math.max(hiLo.low, band?.lower || hiLo.low),
    resistance: Math.min(hiLo.high, band?.upper || hiLo.high),
    events: [],
    fundamentals: { quality: 10 },
    optionChain: null,
    prevClose: meta.previousClose
  };
}

function mergeData(base, patch) {
  return { ...base, ...patch, fundamentals: { ...(base.fundamentals || {}), ...(patch.fundamentals || {}) }, optionChain: patch.optionChain ?? base.optionChain ?? null };
}

async function analyzeFromInputs(symbol, market, manualOverride = null) {
  const normalized = normalizeTicker(symbol, market);
  const sampleKey = Object.keys(SAMPLE_DATA).find(k => sameTicker(k, normalized) || sameTicker(k, symbol));
  const sample = sampleKey ? SAMPLE_DATA[sampleKey] : null;

  if (manualOverride) {
    const merged = mergeData(sample || {}, manualOverride);
    if (!merged.ticker) merged.ticker = normalized || symbol;
    if (!merged.market) merged.market = market;
    render(merged);
    return;
  }

  try {
    const live = await tryLiveFetch(symbol, market);
    const merged = mergeData(sample || {}, live);
    if (!merged.company) merged.company = merged.ticker;
    render(merged);
  } catch (err) {
    if (sample) {
      render(sample);
      return;
    }
    const fallback = {
      ticker: normalized || symbol,
      company: normalized || symbol,
      market,
      currency: market === 'HK' ? 'HKD' : 'USD',
      price: null,
      priceTimestamp: null,
      source: 'live data unavailable; use manual JSON',
      ma50: null,
      ma200: null,
      ema9: null,
      ema20: null,
      vwap: null,
      rsi: null,
      support: null,
      resistance: null,
      events: [],
      fundamentals: { quality: 10 },
      optionChain: null
    };
    render(fallback);
  }
}

function bindSampleButtons() {
  ui.sampleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.sample;
      ui.ticker.value = t;
      ui.market.value = t.endsWith('.HK') ? 'HK' : 'US';
      analyzeFromInputs(t, ui.market.value);
      const url = new URL(window.location.href);
      url.searchParams.set('ticker', t);
      url.searchParams.set('market', ui.market.value);
      history.replaceState({}, '', url);
    });
  });
}

ui.analyze.addEventListener('click', () => {
  const ticker = ui.ticker.value.trim();
  const market = ui.market.value;
  if (!ticker) return;
  analyzeFromInputs(ticker, market);
  const url = new URL(window.location.href);
  url.searchParams.set('ticker', ticker);
  url.searchParams.set('market', market);
  history.replaceState({}, '', url);
});

ui.applyJson.addEventListener('click', () => {
  const obj = parseManual();
  if (!obj) return;
  analyzeFromInputs(obj.ticker || ui.ticker.value, obj.market || ui.market.value, obj);
});

ui.ticker.addEventListener('keydown', e => {
  if (e.key === 'Enter') ui.analyze.click();
});

bindSampleButtons();

const params = new URLSearchParams(window.location.search);
const ticker = params.get('ticker') || 'AAPL';
const market = params.get('market') || (ticker.endsWith('.HK') ? 'HK' : 'US');
ui.ticker.value = ticker;
ui.market.value = market;
analyzeFromInputs(ticker, market);
