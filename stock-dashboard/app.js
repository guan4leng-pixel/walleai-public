const APP_REFRESHED_AT = new Date();
const APP_REFRESHED_AT_ISO = APP_REFRESHED_AT.toISOString();
const PORTFOLIO_AS_OF = '2026-05-01';
const PORTFOLIO_SOURCE = `IBKR Activity Statement snapshot (${PORTFOLIO_AS_OF})`;

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat('en-SG', {
  year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
});

function displayTicker(ticker, market) {
  const t = String(ticker || '').trim().toUpperCase();
  const m = String(market || '').trim().toUpperCase();
  if (m === 'HK') {
    const core = t.replace(/\.HK$/, '').replace(/^0+/, '').padStart(4, '0');
    return `${core}.HK`;
  }
  if (m === 'SG') return `${t.replace(/\.SI$/, '')}.SI`;
  return t.replace(/\.(HK|SI)$/, '');
}

function normalizeTicker(raw, market = 'US') {
  let t = String(raw || '').trim().toUpperCase();
  const m = String(market || 'US').toUpperCase();
  if (!t) return '';
  if (m === 'HK') {
    t = t.replace('.HK', '');
    t = t.replace(/^0+/, '');
    return `${t.padStart(4, '0')}.HK`;
  }
  if (m === 'SG') {
    t = t.replace('.SI', '');
    return `${t}.SI`;
  }
  return t.replace(/\.(HK|SI)$/i, '');
}

function asFloat(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function fmtCurrency(value, currency = '') {
  const n = asFloat(value);
  if (n === null) return 'N/A';
  return currency ? `${fmt.format(n)} ${currency}` : fmt.format(n);
}

function fmtPct(value) {
  const n = asFloat(value);
  if (n === null) return 'N/A';
  return `${n >= 0 ? '+' : ''}${fmt.format(n)}%`;
}

function badge(kind, text) {
  return `<span class="badge ${kind}">${text}</span>`;
}

function avg(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function movingAverage(values, period) {
  if (!values || values.length < period) return null;
  return avg(values.slice(-period));
}

function ema(values, period) {
  if (!values || values.length < period) return null;
  const k = 2 / (period + 1);
  let out = avg(values.slice(0, period));
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
  const m = avg(values);
  const variance = avg(values.map(v => (v - m) ** 2));
  return Math.sqrt(variance);
}

function bollinger(values, period = 20, mult = 2) {
  const slice = values.slice(-period);
  if (slice.length < period) return null;
  const mid = avg(slice);
  const sd = standardDeviation(slice);
  return { mid, upper: mid + mult * sd, lower: mid - mult * sd };
}

function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b).setHours(0,0,0,0) - new Date(a).setHours(0,0,0,0)) / ms);
}

function nowStamp() {
  return dateFmt.format(APP_REFRESHED_AT);
}

function toIsoDay(offsetDays = 0) {
  const d = new Date(APP_REFRESHED_AT);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function supportZone(record) {
  const zones = [record.support, record.ma50, record.ma200, record.vwap].map(asFloat).filter(v => v !== null);
  if (!zones.length) return null;
  const sorted = zones.slice().sort((a, b) => a - b);
  const anchor = sorted[Math.floor(sorted.length / 2)];
  const low = Math.min(...sorted, anchor * 0.99);
  const high = Math.max(...sorted, anchor * 1.01);
  return { low, high, anchor };
}

function resistanceZone(record) {
  const zones = [record.resistance, record.ma50, record.vwap].map(asFloat).filter(v => v !== null);
  if (!zones.length) return null;
  const sorted = zones.slice().sort((a, b) => a - b);
  const anchor = sorted[Math.floor(sorted.length / 2)];
  const low = Math.min(...sorted, anchor * 0.99);
  const high = Math.max(...sorted, anchor * 1.01);
  return { low, high, anchor };
}

function computeTrend(record) {
  if (!isFinite(record.price) || !isFinite(record.ma50) || !isFinite(record.ma200)) return 'Neutral';
  if (record.price > record.ma50 && record.ma50 > record.ma200) return 'Bullish';
  if (record.price < record.ma50 && record.ma50 < record.ma200) return 'Bearish';
  if (record.price > record.ma200) return 'Neutral';
  return 'Bearish';
}

function computeRSIStatus(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Neutral';
  if (value < 30) return 'Oversold';
  if (value > 70) return 'Overbought';
  return 'Neutral';
}

function computeCross(record) {
  if (!isFinite(record.ma50) || !isFinite(record.ma200)) return 'None';
  if (record.ma50 > record.ma200) return 'Golden Cross';
  if (record.ma50 < record.ma200) return 'Dead Cross';
  return 'None';
}

function computeEventRisk(record, days = 30) {
  const events = (record.events || []).filter(ev => {
    const d = daysBetween(APP_REFRESHED_AT, ev.date);
    return d >= 0 && d <= days;
  });
  const hasEarnings = events.some(ev => /earn/i.test(`${ev.label || ''} ${ev.type || ''}`));
  if (hasEarnings) return { level: 'Red', events };
  if (events.length) return { level: 'Yellow', events };
  return { level: 'Green', events: [] };
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
  if (sup && Math.abs(price - sup.anchor) / sup.anchor < 0.08) s += 4;
  if (res && price < res.high && price > res.low) s += 3;
  return Math.min(15, s);
}

function scoreEventRisk(eventRisk) {
  if (eventRisk.level === 'Green') return 15;
  if (eventRisk.level === 'Yellow') return 9;
  return 3;
}

function estimatePremium(price, strike, kind) {
  const gap = Math.abs((strike - price) / price * 100);
  const base = Math.max(price * 0.012, strike * 0.01);
  const decay = Math.max(0.35, 1.8 - gap / 8);
  return +(base * decay * (kind === 'put' ? 1.05 : 0.95)).toFixed(2);
}

function scorePremium(record) {
  const put = buildSetup(record, 'put');
  const call = buildSetup(record, 'call');
  const premium = ((put.premium || 0) + (call.premium || 0)) / 2;
  if (!record.price) return 4;
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
  if (chain.length) chosen = chain.slice().sort((a, b) => Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike))[0];
  const expiry = chosen?.expiry || toIsoDay(kind === 'put' ? 35 : 28);
  const dte = Math.max(1, daysBetween(APP_REFRESHED_AT, expiry));
  const strike = chosen?.strike ?? targetStrike;
  const premium = chosen?.premium ?? estimatePremium(record.price, strike, kind);
  const delta = chosen?.delta ?? (kind === 'put' ? -0.25 : 0.22);
  const gap = record.price ? ((strike - record.price) / record.price * 100) : 0;
  const be = kind === 'put' ? +(strike - premium).toFixed(2) : null;
  const beGap = kind === 'put' && record.price ? ((record.price - be) / record.price * 100) : null;
  return { strategy: kind === 'put' ? 'Sell Put' : 'Covered Call', expiry, dte, strike, premium, delta, gap, be, beGap };
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

function sourceLabel(record) {
  const source = record.priceSource || record.source || PORTFOLIO_SOURCE;
  const retrieved = record.retrievedAt || APP_REFRESHED_AT_ISO;
  return `${source} • ${dateFmt.format(new Date(retrieved))}`;
}

function analysisLink(ticker, market) {
  const params = new URLSearchParams({ ticker, market });
  return `?${params.toString()}#analysis`;
}

function buildOptionChip(opt) {
  const label = `${opt.contract} • ${opt.expiry} • ${opt.right} x${Math.abs(opt.qty)}`;
  const details = `${opt.underlying} • ${opt.market} • ${opt.source}`;
  return `<a class="option-chip" href="${analysisLink(opt.underlyingTicker, opt.market)}" data-ticker="${opt.underlyingTicker}" data-market="${opt.market}"><strong>${label}</strong><span>${details}</span></a>`;
}

function buildHoldingRow(record) {
  const trend = computeTrend(record);
  const rsiStatus = computeRSIStatus(record.rsi);
  const eventRisk = computeEventRisk(record);
  const sellPut = sellPutRating(record, eventRisk);
  const coveredCall = coveredCallRating(record, eventRisk);
  const selected = record.displayTicker === currentSelection.displayTicker;
  return `
    <tr class="${selected ? 'is-selected' : ''}" data-ticker="${record.ticker}" data-market="${record.market}">
      <td>
        <div class="cell-stack">
          <a class="link-chip" href="${analysisLink(record.ticker, record.market)}" data-open="1">${record.displayTicker}</a>
          <div>${record.company}</div>
          <div class="cell-sub">${record.market} • ${record.currency}</div>
        </div>
      </td>
      <td>${record.quantity.toLocaleString()}</td>
      <td>
        <div class="cell-stack">
          <div>${fmtCurrency(record.price, record.currency)}</div>
          <div class="cell-sub">${record.priceTimestamp ? `Price as of ${dateFmt.format(new Date(record.priceTimestamp))}` : 'Delayed / cached'}</div>
        </div>
      </td>
      <td>${badge(trend === 'Bullish' ? 'green' : trend === 'Bearish' ? 'red' : 'yellow', trend)}</td>
      <td>${badge(rsiStatus === 'Overbought' ? 'red' : rsiStatus === 'Oversold' ? 'green' : 'yellow', rsiStatus)}</td>
      <td>${badge(sellPut === 'Good' ? 'green' : sellPut === 'Watch' ? 'yellow' : 'red', sellPut)}</td>
      <td>${badge(coveredCall === 'Good' ? 'green' : coveredCall === 'Watch' ? 'yellow' : 'red', coveredCall)}</td>
      <td>
        <div class="cell-stack">
          <div>${record.priceSource || PORTFOLIO_SOURCE}</div>
          <div class="cell-sub">${sourceLabel(record)}</div>
        </div>
      </td>
      <td>
        <a class="row-link" href="${analysisLink(record.ticker, record.market)}" data-open="1">Open</a>
        <span class="row-mini">${record.pageUrlLabel}</span>
      </td>
    </tr>
  `;
}

function buildField(title, body, full = false) {
  return `
    <article class="card field ${full ? 'field--full' : ''}">
      <h2>${title}</h2>
      <div class="field__value">${body}</div>
    </article>
  `;
}

function portfolioWeight(record) {
  const total = PORTFOLIO_RECORDS.reduce((sum, item) => sum + (item.marketValue || 0), 0);
  if (!total) return null;
  return (record.marketValue / total) * 100;
}

function renderList() {
  const body = document.getElementById('holdingsBody');
  body.innerHTML = PORTFOLIO_RECORDS.map(buildHoldingRow).join('');
  body.querySelectorAll('tr[data-ticker]').forEach(tr => {
    tr.addEventListener('click', (ev) => {
      const ticker = tr.dataset.ticker;
      const market = tr.dataset.market;
      const isLink = ev.target.closest('a');
      selectTicker(ticker, market, { pushState: !isLink, focusAnalysis: true });
    });
  });
}

function renderOptions() {
  const strip = document.getElementById('optionsStrip');
  strip.innerHTML = OWNED_OPTIONS.map(buildOptionChip).join('');
  strip.querySelectorAll('[data-ticker]').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      selectTicker(el.dataset.ticker, el.dataset.market, { pushState: true, focusAnalysis: true });
    });
  });
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
  const eventLines = (eventRisk.events || []).map(ev => `${ev.date} — ${ev.label}`).join('<br>') || 'No major events in next 30 days.';
  const scoreLabel = total >= 80 ? 'Strong Candidate' : total >= 65 ? 'Acceptable' : total >= 50 ? 'Watchlist' : 'Avoid';
  const openUrl = analysisLink(record.ticker, record.market);

  document.getElementById('selectedTitle').textContent = `${record.displayTicker} — ${record.company}`;
  document.getElementById('selectedMeta').innerHTML = `${record.market} • ${record.currency} • Source: ${record.priceSource || record.source || PORTFOLIO_SOURCE}<br>Retrieved: ${sourceLabel(record)}`;
  document.getElementById('selectedLink').href = openUrl;
  document.getElementById('selectedLink').textContent = 'Open URL';

  const cards = [
    buildField('Ticker / Share Name', `${record.displayTicker} — ${record.company}<br><span class="field__small">${record.market} • ${record.currency}<br>Portfolio source: ${record.portfolioSource || PORTFOLIO_SOURCE}</span>`),
    buildField('Current Price', `${fmtCurrency(record.price, record.currency)}<br><span class="field__small">${record.priceTimestamp ? `Delayed price / ${dateFmt.format(new Date(record.priceTimestamp))}` : 'No live timestamp'}<br>${sourceLabel(record)}</span>`),
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
        <span class="field__small">${scoreLabel}</span>
      </div>
      <div class="field__small" style="margin-top:10px">${action.reason}<br>Trend ${trendPts}/20 • Momentum ${momPts}/15 • Support/Resistance ${srPts}/15 • Event ${eventPts}/15 • Premium ${premiumPts}/20 • Fundamental ${fundamentalPts}/15</div>
    `, true)
  ];

  document.getElementById('result').innerHTML = cards.join('');
  document.getElementById('freshness').textContent = `Freshness: ${nowStamp()} • ${record.priceSource || record.source || PORTFOLIO_SOURCE}`;
  document.getElementById('pageRefresh').textContent = nowStamp();

  highlightSelectedRow(record.ticker, record.market);
}

function highlightSelectedRow(ticker, market) {
  const norm = normalizeTicker(ticker, market);
  document.querySelectorAll('#holdingsBody tr').forEach(tr => {
    const rowNorm = normalizeTicker(tr.dataset.ticker, tr.dataset.market);
    tr.classList.toggle('is-selected', rowNorm === norm);
  });
}

function parseManual() {
  try {
    return JSON.parse(document.getElementById('manualJson').value);
  } catch (err) {
    alert('Manual JSON is invalid.');
    return null;
  }
}

function buildPortfolioRecord(def) {
  return {
    ...def,
    displayTicker: def.displayTicker || displayTicker(def.ticker, def.market),
    priceSource: def.priceSource || PORTFOLIO_SOURCE,
    portfolioSource: def.portfolioSource || PORTFOLIO_SOURCE,
    retrievedAt: def.retrievedAt || APP_REFRESHED_AT_ISO,
    pageUrlLabel: 'click row or open link',
  };
}

let PORTFOLIO_RECORDS = [
  buildPortfolioRecord({
    ticker: '700', market: 'HK', company: 'Tencent', currency: 'HKD', quantity: 700,
    price: 472.2, priceTimestamp: '2026-05-05T16:08:12+08:00',
    ma50: 448.0, ma200: 410.0, ema9: 468.4, ema20: 462.2, vwap: 466.8, rsi: 58,
    support: 450.0, resistance: 488.0, source: PORTFOLIO_SOURCE,
    marketValue: 53228.30, marketValueCurrency: 'SGD',
    events: [{ date: '2026-05-18', label: 'Results briefing', type: 'results' }],
    fundamentals: { quality: 13 },
    optionChain: {
      puts: [{ expiry: '2026-05-28', strike: 450, premium: 9.8, delta: -0.25 }],
      calls: [{ expiry: '2026-06-18', strike: 490, premium: 8.9, delta: 0.22 }]
    }
  }),
  buildPortfolioRecord({
    ticker: '9988', market: 'HK', company: 'Alibaba HK', currency: 'HKD', quantity: 6500,
    price: 126.0, priceTimestamp: '2026-05-05T16:08:12+08:00',
    ma50: 121.0, ma200: 95.0, ema9: 124.0, ema20: 121.5, vwap: 123.0, rsi: 55,
    support: 118.0, resistance: 135.0, source: PORTFOLIO_SOURCE,
    marketValue: 133140.24, marketValueCurrency: 'SGD',
    events: [{ date: '2026-05-20', label: 'Results briefing', type: 'results' }],
    fundamentals: { quality: 11 },
    optionChain: {
      puts: [{ expiry: '2026-05-28', strike: 115, premium: 4.2, delta: -0.27 }],
      calls: [{ expiry: '2026-05-28', strike: 145, premium: 3.15, delta: 0.23 }, { expiry: '2026-06-29', strike: 145, premium: 3.75, delta: 0.21 }]
    }
  }),
  buildPortfolioRecord({
    ticker: 'AMD', market: 'US', company: 'Advanced Micro Devices', currency: 'USD', quantity: 75,
    price: 360.54, priceTimestamp: '2026-05-06T09:30:00+08:00',
    ma50: 338.0, ma200: 270.0, ema9: 357.5, ema20: 350.1, vwap: 355.0, rsi: 64,
    support: 330.0, resistance: 380.0, source: PORTFOLIO_SOURCE,
    marketValue: 34440.78, marketValueCurrency: 'SGD',
    fundamentals: { quality: 12 },
    optionChain: {
      puts: [{ expiry: '2026-05-29', strike: 300, premium: 6.25, delta: -0.24 }, { expiry: '2026-06-05', strike: 320, premium: 8.1, delta: -0.2 }],
      calls: []
    }
  }),
  buildPortfolioRecord({
    ticker: 'BABA', market: 'US', company: 'Alibaba ADR', currency: 'USD', quantity: 1200,
    price: 131.5, priceTimestamp: '2026-05-06T09:30:00+08:00',
    ma50: 129.0, ma200: 105.0, ema9: 130.8, ema20: 129.6, vwap: 130.4, rsi: 54,
    support: 126.0, resistance: 140.0, source: PORTFOLIO_SOURCE,
    marketValue: 200998.08, marketValueCurrency: 'SGD',
    events: [{ date: '2026-05-20', label: 'Results briefing', type: 'results' }, { date: '2026-05-28', label: 'China policy risk watch', type: 'macro' }],
    fundamentals: { quality: 11 },
    optionChain: { puts: [], calls: [{ expiry: '2026-05-15', strike: 145, premium: 2.95, delta: 0.23 }] }
  }),
  buildPortfolioRecord({
    ticker: 'GOOGL', market: 'US', company: 'Alphabet', currency: 'USD', quantity: 100,
    price: 385.69, priceTimestamp: '2026-05-06T09:30:00+08:00',
    ma50: 372.0, ma200: 310.0, ema9: 384.0, ema20: 379.2, vwap: 382.7, rsi: 67,
    support: 375.0, resistance: 398.0, source: PORTFOLIO_SOURCE,
    marketValue: 49119.48, marketValueCurrency: 'SGD',
    events: [{ date: '2026-05-23', label: 'Results briefing', type: 'results' }],
    fundamentals: { quality: 14 },
    optionChain: { puts: [], calls: [{ expiry: '2026-05-15', strike: 370, premium: 4.8, delta: 0.21 }] }
  }),
  buildPortfolioRecord({
    ticker: 'H78', market: 'US', company: 'Hongkong Land', currency: 'USD', quantity: 3000,
    price: 7.89, priceTimestamp: '2026-05-06T09:30:00+08:00',
    ma50: 7.6, ma200: 6.9, ema9: 7.85, ema20: 7.81, vwap: 7.82, rsi: 52,
    support: 7.5, resistance: 8.2, source: PORTFOLIO_SOURCE,
    marketValue: 30145.51, marketValueCurrency: 'SGD',
    fundamentals: { quality: 9 },
    optionChain: { puts: [], calls: [] }
  }),
  buildPortfolioRecord({
    ticker: 'JEPG', market: 'US', company: 'JPMorgan income ETF', currency: 'USD', quantity: 288,
    price: 26.135, priceTimestamp: '2026-05-06T09:30:00+08:00',
    ma50: 25.8, ma200: 24.9, ema9: 26.0, ema20: 25.9, vwap: 25.95, rsi: 50,
    support: 25.5, resistance: 26.8, source: PORTFOLIO_SOURCE,
    marketValue: 9585.84, marketValueCurrency: 'SGD',
    fundamentals: { quality: 10 },
    optionChain: { puts: [], calls: [] }
  }),
  buildPortfolioRecord({
    ticker: 'JEPI', market: 'US', company: 'JPMorgan Equity Premium Income ETF', currency: 'USD', quantity: 400,
    price: 24.855, priceTimestamp: '2026-05-06T09:30:00+08:00',
    ma50: 24.8, ma200: 24.6, ema9: 24.85, ema20: 24.8, vwap: 24.82, rsi: 49,
    support: 24.5, resistance: 25.2, source: PORTFOLIO_SOURCE,
    marketValue: 12664.53, marketValueCurrency: 'SGD',
    fundamentals: { quality: 10 },
    optionChain: { puts: [], calls: [] }
  }),
  buildPortfolioRecord({
    ticker: 'JEPQ', market: 'US', company: 'JPMorgan Nasdaq Equity Premium Income ETF', currency: 'USD', quantity: 400,
    price: 27.0, priceTimestamp: '2026-05-06T09:30:00+08:00',
    ma50: 26.5, ma200: 24.8, ema9: 26.9, ema20: 26.8, vwap: 26.85, rsi: 51,
    support: 26.0, resistance: 27.8, source: PORTFOLIO_SOURCE,
    marketValue: 13754.88, marketValueCurrency: 'SGD',
    fundamentals: { quality: 10 },
    optionChain: { puts: [], calls: [] }
  }),
  buildPortfolioRecord({
    ticker: 'SLV', market: 'US', company: 'iShares Silver Trust', currency: 'USD', quantity: 500,
    price: 68.29, priceTimestamp: '2026-05-06T09:30:00+08:00',
    ma50: 66.0, ma200: 61.5, ema9: 67.9, ema20: 67.2, vwap: 67.5, rsi: 58,
    support: 65.7, resistance: 70.0, source: PORTFOLIO_SOURCE,
    marketValue: 43488.27, marketValueCurrency: 'SGD',
    fundamentals: { quality: 9 },
    optionChain: { puts: [], calls: [] }
  }),
  buildPortfolioRecord({
    ticker: 'SOFI', market: 'US', company: 'SoFi Technologies', currency: 'USD', quantity: 1400,
    price: 16.43, priceTimestamp: '2026-05-06T09:30:00+08:00',
    ma50: 17.1, ma200: 9.8, ema9: 16.9, ema20: 16.7, vwap: 16.6, rsi: 72,
    support: 15.8, resistance: 17.4, source: PORTFOLIO_SOURCE,
    marketValue: 29292.15, marketValueCurrency: 'SGD',
    events: [{ date: '2026-05-15', label: 'Earnings', type: 'earnings' }],
    fundamentals: { quality: 8 },
    optionChain: { puts: [{ expiry: '2026-05-15', strike: 24, premium: 0.85, delta: -0.29 }], calls: [] }
  })
];

let OWNED_OPTIONS = [
  { underlyingTicker: '700', underlying: '700 Tencent', market: 'HK', contract: '700 28MAY26 450 Put', expiry: '2026-05-28', right: 'Put', qty: -2, source: PORTFOLIO_SOURCE },
  { underlyingTicker: '9988', underlying: '9988 Alibaba HK', market: 'HK', contract: '9988 28MAY26 115 Put', expiry: '2026-05-28', right: 'Put', qty: -3, source: PORTFOLIO_SOURCE },
  { underlyingTicker: '9988', underlying: '9988 Alibaba HK', market: 'HK', contract: '9988 28MAY26 145 Call', expiry: '2026-05-28', right: 'Call', qty: -1, source: PORTFOLIO_SOURCE },
  { underlyingTicker: 'AMD', underlying: 'AMD', market: 'US', contract: 'AMD 29MAY26 300 Put', expiry: '2026-05-29', right: 'Put', qty: -1, source: PORTFOLIO_SOURCE },
  { underlyingTicker: 'BABA', underlying: 'BABA', market: 'US', contract: 'BABA 15MAY26 145 Call', expiry: '2026-05-15', right: 'Call', qty: -2, source: PORTFOLIO_SOURCE },
  { underlyingTicker: 'GOOGL', underlying: 'GOOGL', market: 'US', contract: 'GOOGL 15MAY26 370 Call', expiry: '2026-05-15', right: 'Call', qty: -1, source: PORTFOLIO_SOURCE },
  { underlyingTicker: 'SOFI', underlying: 'SOFI', market: 'US', contract: 'SOFI 15MAY26 24 Put', expiry: '2026-05-15', right: 'Put', qty: -5, source: PORTFOLIO_SOURCE }
];

function mkDemo(base) {
  return { ...base, retrievedAt: APP_REFRESHED_AT_ISO, priceSource: 'sample data', portfolioSource: 'sample data', displayTicker: base.ticker, pageUrlLabel: 'demo' };
}

const DEMO_DATA = {
  AAPL: mkDemo({
    ticker: 'AAPL', displayTicker: 'AAPL', company: 'Apple Inc.', market: 'US', currency: 'USD', quantity: 10,
    price: 189.34, priceTimestamp: '2026-05-06T09:30:00+08:00',
    ma50: 182.1, ma200: 175.3, ema9: 188.7, ema20: 186.9, vwap: 188.0, rsi: 61,
    support: 183.0, resistance: 195.0,
    events: [{ date: '2026-05-12', label: 'Earnings', type: 'earnings' }],
    fundamentals: { quality: 14 },
    optionChain: { puts: [{ expiry: '2026-06-19', strike: 182.5, premium: 2.15, delta: -0.24 }], calls: [{ expiry: '2026-06-05', strike: 195, premium: 1.85, delta: 0.21 }] }
  }),
  BABA: mkDemo({
    ticker: 'BABA', displayTicker: 'BABA', company: 'Alibaba Group ADR', market: 'US', currency: 'USD', quantity: 1200,
    price: 134.6, priceTimestamp: '2026-05-06T09:30:00+08:00',
    ma50: 132.0, ma200: 105.0, ema9: 133.9, ema20: 131.8, vwap: 133.2, rsi: 54,
    support: 129.0, resistance: 142.0,
    events: [{ date: '2026-05-20', label: 'Results briefing', type: 'results' }, { date: '2026-05-28', label: 'China policy risk watch', type: 'macro' }],
    fundamentals: { quality: 11 },
    optionChain: { puts: [{ expiry: '2026-06-19', strike: 130, premium: 4.2, delta: -0.27 }], calls: [{ expiry: '2026-06-19', strike: 142, premium: 3.15, delta: 0.23 }] }
  }),
  '0700.HK': mkDemo({
    ticker: '700', displayTicker: '0700.HK', company: 'Tencent Holdings', market: 'HK', currency: 'HKD', quantity: 700,
    price: 472.2, priceTimestamp: '2026-05-05T16:08:12+08:00',
    ma50: 448.0, ma200: 410.0, ema9: 468.4, ema20: 462.2, vwap: 466.8, rsi: 58,
    support: 450.0, resistance: 488.0,
    events: [{ date: '2026-05-18', label: 'Results briefing', type: 'results' }],
    fundamentals: { quality: 13 },
    optionChain: { puts: [{ expiry: '2026-05-28', strike: 450, premium: 9.8, delta: -0.25 }], calls: [{ expiry: '2026-06-18', strike: 490, premium: 8.9, delta: 0.22 }] }
  }),
  SOFI: mkDemo({
    ticker: 'SOFI', displayTicker: 'SOFI', company: 'SoFi Technologies', market: 'US', currency: 'USD', quantity: 1400,
    price: 16.43, priceTimestamp: '2026-05-06T09:30:00+08:00',
    ma50: 17.1, ma200: 9.8, ema9: 16.9, ema20: 16.7, vwap: 16.6, rsi: 72,
    support: 15.8, resistance: 17.4,
    events: [{ date: '2026-05-15', label: 'Earnings', type: 'earnings' }],
    fundamentals: { quality: 8 },
    optionChain: { puts: [{ expiry: '2026-06-19', strike: 15, premium: 0.85, delta: -0.29 }], calls: [{ expiry: '2026-06-19', strike: 17.5, premium: 0.7, delta: 0.26 }] }
  })
};

function portfolioRecordMap() {
  const map = new Map();
  for (const record of PORTFOLIO_RECORDS) {
    map.set(normalizeTicker(record.ticker, record.market), record);
    map.set(String(record.ticker).toUpperCase(), record);
    if (record.displayTicker) map.set(record.displayTicker.toUpperCase(), record);
  }
  return map;
}

let PORTFOLIO_MAP = portfolioRecordMap();
let SAMPLE_DATA = { ...DEMO_DATA, ...Object.fromEntries(PORTFOLIO_RECORDS.map(r => [normalizeTicker(r.ticker, r.market), r])) };

const ui = {
  freshness: document.getElementById('freshness'),
  pageRefresh: document.getElementById('pageRefresh'),
  holdingsBody: document.getElementById('holdingsBody'),
  optionsStrip: document.getElementById('optionsStrip'),
  selectedTitle: document.getElementById('selectedTitle'),
  selectedMeta: document.getElementById('selectedMeta'),
  selectedLink: document.getElementById('selectedLink'),
  result: document.getElementById('result')
};

let currentSelection = PORTFOLIO_RECORDS[0] || DEMO_DATA.AAPL;

function lookupRecord(symbol, market = 'US') {
  const norm = normalizeTicker(symbol, market);
  return PORTFOLIO_MAP.get(norm) || PORTFOLIO_MAP.get(String(symbol || '').toUpperCase()) || DEMO_DATA[norm] || DEMO_DATA[String(symbol || '').toUpperCase()] || null;
}

function sourceLabel(record) {
  const source = record.priceSource || record.source || PORTFOLIO_SOURCE;
  const retrieved = record.retrievedAt || APP_REFRESHED_AT_ISO;
  return `${source} • ${dateFmt.format(new Date(retrieved))}`;
}

function buildOptionSetup(record, kind) {
  if (!isFinite(record.price)) {
    const expiry = toIsoDay(kind === 'put' ? 35 : 28);
    return {
      strategy: kind === 'put' ? 'Sell Put' : 'Covered Call',
      expiry,
      dte: Math.max(1, daysBetween(APP_REFRESHED_AT, expiry)),
      strike: 'N/A',
      premium: 'N/A',
      delta: kind === 'put' ? -0.25 : 0.22,
      gap: 0,
      be: null,
      beGap: null,
    };
  }
  const support = supportZone(record);
  const resistance = resistanceZone(record);
  const chain = record.optionChain?.[kind === 'put' ? 'puts' : 'calls'] || [];
  const targetStrike = kind === 'put'
    ? (support ? +(support.anchor * 0.985).toFixed(2) : +(record.price * 0.95).toFixed(2))
    : (resistance ? +(resistance.anchor * 1.015).toFixed(2) : +(record.price * 1.05).toFixed(2));
  const chosen = chain.length ? chain.slice().sort((a, b) => Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike))[0] : null;
  const expiry = chosen?.expiry || toIsoDay(kind === 'put' ? 35 : 28);
  const dte = Math.max(1, daysBetween(APP_REFRESHED_AT, expiry));
  const strike = chosen?.strike ?? targetStrike;
  const premium = chosen?.premium ?? estimatePremium(record.price, strike, kind);
  const delta = chosen?.delta ?? (kind === 'put' ? -0.25 : 0.22);
  const gap = record.price ? ((strike - record.price) / record.price * 100) : 0;
  const be = kind === 'put' ? +(strike - premium).toFixed(2) : null;
  const beGap = kind === 'put' && record.price ? ((record.price - be) / record.price * 100) : null;
  return { strategy: kind === 'put' ? 'Sell Put' : 'Covered Call', expiry, dte, strike, premium, delta, gap, be, beGap };
}

function computePortfolioSourceLine(record) {
  const source = record.portfolioSource || PORTFOLIO_SOURCE;
  return `${source} / ${dateFmt.format(new Date(record.retrievedAt || APP_REFRESHED_AT_ISO))}`;
}

function renderHoldingRows() {
  ui.holdingsBody.innerHTML = PORTFOLIO_RECORDS.map(record => {
    const trend = computeTrend(record);
    const rsiStatus = computeRSIStatus(record.rsi);
    const eventRisk = computeEventRisk(record);
    const sellPut = sellPutRating(record, eventRisk);
    const coveredCall = coveredCallRating(record, eventRisk);
    const selected = normalizeTicker(record.ticker, record.market) === normalizeTicker(currentSelection.ticker, currentSelection.market);
    return `
      <tr class="${selected ? 'is-selected' : ''}" data-ticker="${record.ticker}" data-market="${record.market}">
        <td>
          <div class="cell-stack">
            <a class="link-chip" href="${analysisLink(record.ticker, record.market)}">${record.displayTicker}</a>
            <div>${record.company}</div>
            <div class="cell-sub">${record.market} • ${record.currency}</div>
          </div>
        </td>
        <td>${Number(record.quantity).toLocaleString()}</td>
        <td>
          <div class="cell-stack">
            <div>${fmtCurrency(record.price, record.currency)}</div>
            <div class="cell-sub">${record.priceTimestamp ? `Price as of ${dateFmt.format(new Date(record.priceTimestamp))}` : 'Delayed / cached'}</div>
          </div>
        </td>
        <td>${badge(trend === 'Bullish' ? 'green' : trend === 'Bearish' ? 'red' : 'yellow', trend)}</td>
        <td>${badge(rsiStatus === 'Overbought' ? 'red' : rsiStatus === 'Oversold' ? 'green' : 'yellow', rsiStatus)}</td>
        <td>${badge(sellPut === 'Good' ? 'green' : sellPut === 'Watch' ? 'yellow' : 'red', sellPut)}</td>
        <td>${badge(coveredCall === 'Good' ? 'green' : coveredCall === 'Watch' ? 'yellow' : 'red', coveredCall)}</td>
        <td>
          <div class="cell-stack">
            <div>${record.priceSource || PORTFOLIO_SOURCE}</div>
            <div class="cell-sub">${computePortfolioSourceLine(record)}</div>
          </div>
        </td>
        <td>
          <a class="row-link" href="${analysisLink(record.ticker, record.market)}">Open</a>
          <span class="row-mini">selected panel</span>
        </td>
      </tr>
    `;
  }).join('');

  ui.holdingsBody.querySelectorAll('tr[data-ticker]').forEach(tr => {
    tr.addEventListener('click', ev => {
      const clickedLink = ev.target.closest('a');
      selectTicker(tr.dataset.ticker, tr.dataset.market, { pushState: !clickedLink, focusAnalysis: true });
    });
  });
}

function renderOptionChips() {
  ui.optionsStrip.innerHTML = OWNED_OPTIONS.map(opt => `
    <a class="option-chip" href="${analysisLink(opt.underlyingTicker, opt.market)}" data-ticker="${opt.underlyingTicker}" data-market="${opt.market}">
      <strong>${opt.contract}</strong>
      <span>${opt.underlying} • ${opt.expiry} • ${opt.right} x${Math.abs(opt.qty)} • ${opt.source}</span>
    </a>
  `).join('');

  ui.optionsStrip.querySelectorAll('[data-ticker]').forEach(el => {
    el.addEventListener('click', ev => {
      ev.preventDefault();
      selectTicker(el.dataset.ticker, el.dataset.market, { pushState: true, focusAnalysis: true });
    });
  });
}

function buildField(title, body, full = false) {
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
  const putSetup = buildOptionSetup(record, 'put');
  const callSetup = buildOptionSetup(record, 'call');
  const eventLines = (eventRisk.events || []).map(ev => `${ev.date} — ${ev.label}`).join('<br>') || 'No major events in next 30 days.';
  const scoreLabel = total >= 80 ? 'Strong Candidate' : total >= 65 ? 'Acceptable' : total >= 50 ? 'Watchlist' : 'Avoid';
  const openUrl = analysisLink(record.ticker, record.market);

  currentSelection = record;
  ui.selectedTitle.textContent = `${record.displayTicker} — ${record.company}`;
  ui.selectedMeta.innerHTML = `${record.market} • ${record.currency} • ${sourceLabel(record)}<br>Portfolio source: ${record.portfolioSource || PORTFOLIO_SOURCE}`;
  ui.selectedLink.href = openUrl;
  ui.selectedLink.textContent = 'Open URL';

  ui.result.innerHTML = [
    buildField('Ticker / Share Name', `${record.displayTicker} — ${record.company}<br><span class="field__small">${record.market} • ${record.currency}<br>Portfolio source: ${record.portfolioSource || PORTFOLIO_SOURCE}</span>`),
    buildField('Current Price', `${fmtCurrency(record.price, record.currency)}<br><span class="field__small">${record.priceTimestamp ? `Delayed price / ${dateFmt.format(new Date(record.priceTimestamp))}` : 'No live timestamp'}<br>${sourceLabel(record)}</span>`),
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
        <span class="field__small">${scoreLabel}</span>
      </div>
      <div class="field__small" style="margin-top:10px">${action.reason}<br>Trend ${trendPts}/20 • Momentum ${momPts}/15 • Support/Resistance ${srPts}/15 • Event ${eventPts}/15 • Premium ${premiumPts}/20 • Fundamental ${fundamentalPts}/15</div>
    `, true)
  ].join('');

  ui.freshness.textContent = `Freshness: ${nowStamp()} • ${record.priceSource || record.source || PORTFOLIO_SOURCE}`;
  ui.pageRefresh.textContent = nowStamp();
  highlightSelectedRow(record.ticker, record.market);
}

function highlightSelectedRow(ticker, market) {
  const norm = normalizeTicker(ticker, market);
  document.querySelectorAll('#holdingsBody tr').forEach(tr => {
    const rowNorm = normalizeTicker(tr.dataset.ticker, tr.dataset.market);
    tr.classList.toggle('is-selected', rowNorm === norm);
  });
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
  const price = meta.regularMarketPrice ?? closes.at(-1);
  const timestamp = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : (result.timestamp?.at(-1) ? new Date(result.timestamp.at(-1) * 1000).toISOString() : null);
  const ma50 = movingAverage(closes, 50);
  const ma200 = movingAverage(closes, 200);
  const ema9v = ema(closes, 9);
  const ema20v = ema(closes, 20);
  const vwap = avg((result?.indicators?.quote?.[0]?.close || []).slice(-10).filter(v => v != null));
  const rsiVal = rsi(closes, 14);
  const band = bollinger(closes, 20, 2);
  const hiLo = recentHighLow(closes, 20);
  return {
    ticker: symbol,
    displayTicker: displayTicker(symbol, market),
    company: meta.longName || meta.shortName || symbol,
    market,
    currency: meta.currency || (market === 'HK' ? 'HKD' : 'USD'),
    price,
    priceTimestamp: timestamp,
    source: 'Yahoo Finance chart',
    priceSource: 'Yahoo Finance chart',
    portfolioSource: recordPortfolioSource(symbol, market),
    retrievedAt: APP_REFRESHED_AT_ISO,
    ma50,
    ma200,
    ema9: ema9v,
    ema20: ema20v,
    vwap,
    rsi: rsiVal,
    support: Math.max(hiLo.low, band?.lower || hiLo.low),
    resistance: Math.min(hiLo.high, band?.upper || hiLo.high),
    events: [],
    fundamentals: { quality: 10 },
    optionChain: null,
    prevClose: meta.previousClose,
    quantity: 0,
    pageUrlLabel: 'live'
  };
}

function recordPortfolioSource(symbol, market) {
  const base = lookupRecord(symbol, market);
  return base?.portfolioSource || PORTFOLIO_SOURCE;
}

async function loadPreparedPortfolio() {
  try {
    const res = await fetch('./data/portfolio.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.holdings) && data.holdings.length) PORTFOLIO_RECORDS = data.holdings;
    if (Array.isArray(data.options) && data.options.length) OWNED_OPTIONS = data.options;
    PORTFOLIO_MAP = portfolioRecordMap();
    SAMPLE_DATA = { ...DEMO_DATA, ...Object.fromEntries(PORTFOLIO_RECORDS.map(r => [normalizeTicker(r.ticker, r.market), r])) };
  } catch (err) {
    // keep embedded fallback data
  }
}

function mergeData(base, patch) {
  return {
    ...base,
    ...patch,
    fundamentals: { ...(base?.fundamentals || {}), ...(patch?.fundamentals || {}) },
    optionChain: patch?.optionChain ?? base?.optionChain ?? null,
    displayTicker: patch?.displayTicker || base?.displayTicker || displayTicker(patch?.ticker || base?.ticker, patch?.market || base?.market),
    pageUrlLabel: base?.pageUrlLabel || patch?.pageUrlLabel || 'open'
  };
}

async function analyzeFromInputs(symbol, market, manualOverride = null) {
  const sampleKey = normalizeTicker(symbol, market);
  const portfolioRecord = lookupRecord(symbol, market);
  const sample = portfolioRecord || SAMPLE_DATA[sampleKey] || SAMPLE_DATA[String(symbol || '').toUpperCase()] || null;

  if (manualOverride) {
    const merged = mergeData(sample || {}, manualOverride);
    if (!merged.ticker) merged.ticker = symbol;
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
      ticker: symbol,
      displayTicker: displayTicker(symbol, market),
      company: symbol,
      market,
      currency: market === 'HK' ? 'HKD' : 'USD',
      price: null,
      priceTimestamp: null,
      source: 'live data unavailable; use manual JSON',
      priceSource: 'live data unavailable; use manual JSON',
      portfolioSource: PORTFOLIO_SOURCE,
      retrievedAt: APP_REFRESHED_AT_ISO,
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
      optionChain: null,
      quantity: 0,
      pageUrlLabel: 'fallback'
    };
    render(fallback);
  }
}

function selectTicker(ticker, market, opts = {}) {
  const normalized = normalizeTicker(ticker, market);
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set('ticker', ticker);
  currentUrl.searchParams.set('market', market);
  if (opts.pushState !== false) history.replaceState({}, '', currentUrl);
  analyzeFromInputs(ticker, market);
  if (opts.focusAnalysis) {
    document.getElementById('analysis').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return normalized;
}

function bindSampleButtons() {
  return;
}

function parseManual() {
  return null;
}

function resolveInitialSelection() {
  const params = new URLSearchParams(window.location.search);
  const ticker = params.get('ticker') || (PORTFOLIO_RECORDS[0]?.displayTicker || PORTFOLIO_RECORDS[0]?.ticker || 'SOFI');
  const market = params.get('market') || (ticker.endsWith('.HK') ? 'HK' : 'US');
  return { ticker, market };
}

async function init() {
  document.getElementById('freshness').textContent = `Freshness: ${nowStamp()} • ${PORTFOLIO_SOURCE}`;
  ui.pageRefresh.textContent = nowStamp();
  renderHoldingRows();
  renderOptionChips();
  const initial = resolveInitialSelection();
  selectTicker(initial.ticker, initial.market, { pushState: false, focusAnalysis: false });

  await loadPreparedPortfolio();
  renderHoldingRows();
  renderOptionChips();
  selectTicker(initial.ticker, initial.market, { pushState: false, focusAnalysis: false });
}

init();
