// API fetchers for external data sources

const FMP_BASE = 'https://financialmodelingprep.com/stable';
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const FRED_BASE = 'https://api.stlouisfed.org/fred';
const EDGAR_BASE = 'https://data.sec.gov';
const DERIBIT_BASE = 'https://www.deribit.com/api/v2/public';

// ── FMP (stable API) ──
export async function fetchFmpQuote(ticker: string) {
  const url = `${FMP_BASE}/quote?symbol=${ticker}&apikey=${process.env.FMP_API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.[0] ?? null;
}

export async function fetchFmpProfile(ticker: string) {
  const url = `${FMP_BASE}/profile?symbol=${ticker}&apikey=${process.env.FMP_API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.[0] ?? null;
}

export async function fetchFmpHistory(ticker: string, from: string, to: string) {
  const url = `${FMP_BASE}/historical-price-eod/full?symbol=${ticker}&from=${from}&to=${to}&apikey=${process.env.FMP_API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  // Stable API returns flat array (no .historical wrapper)
  return Array.isArray(data) ? data : (data?.historical ?? []);
}

export async function fetchFmpOptions(ticker: string) {
  const url = `${FMP_BASE}/options-chain?symbol=${ticker}&apikey=${process.env.FMP_API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  return data ?? [];
}

export async function fetchFmpSharesFloat(ticker: string) {
  // Use profile endpoint — shares_float may not be available on starter plan
  const url = `${FMP_BASE}/profile?symbol=${ticker}&apikey=${process.env.FMP_API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.[0] ?? null;
}

// ── Coinbase (BTC price — free, no auth) ──
const COINBASE_BASE = 'https://api.exchange.coinbase.com';

export async function fetchBtcPrice() {
  // Try Coinbase first, fall back to CoinGecko
  try {
    const res = await fetch(`${COINBASE_BASE}/products/BTC-USD/ticker`, { next: { revalidate: 60 } });
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.price ?? '0');
      if (price > 0) return { usd: price, usd_24h_change: 0 };
    }
  } catch { /* fall through */ }
  // Fallback: CoinGecko
  const url = `${COINGECKO_BASE}/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) return { usd: 0, usd_24h_change: 0 };
  const data = await res.json();
  return data?.bitcoin ?? { usd: 0, usd_24h_change: 0 };
}

/**
 * Fetch BTC daily candles from Coinbase Exchange API (free, no auth).
 * Returns array of { date: string, close: number } oldest-first.
 * Max 300 candles per request, so we paginate for longer ranges.
 */
export async function fetchCoinbaseBtcHistory(days = 365): Promise<Array<{ date: string; close: number }>> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const allCandles: Array<{ date: string; close: number }> = [];

  // Coinbase max 300 candles per request — paginate in 300-day chunks
  let chunkEnd = new Date(end);
  while (chunkEnd > start) {
    const chunkStart = new Date(Math.max(chunkEnd.getTime() - 300 * 86400000, start.getTime()));
    const url = `${COINBASE_BASE}/products/BTC-USD/candles?granularity=86400&start=${chunkStart.toISOString()}&end=${chunkEnd.toISOString()}`;
    try {
      const res = await fetch(url, { next: { revalidate: 3600 } });
      if (!res.ok) break;
      const data = await res.json();
      // Coinbase returns [unix_time, low, high, open, close, volume] newest-first
      if (Array.isArray(data)) {
        for (const candle of data) {
          const [ts, , , , close] = candle;
          if (close > 0) {
            allCandles.push({
              date: new Date(ts * 1000).toISOString().slice(0, 10),
              close,
            });
          }
        }
      }
    } catch { break; }
    chunkEnd = new Date(chunkStart.getTime() - 86400000);
  }

  // Deduplicate by date, sort oldest-first
  const byDate = new Map<string, number>();
  for (const c of allCandles) byDate.set(c.date, c.close);
  return Array.from(byDate.entries())
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Legacy wrapper — returns [timestamp_ms, price][] format for backward compat */
export async function fetchBtcHistory(days = 365): Promise<Array<[number, number]>> {
  const candles = await fetchCoinbaseBtcHistory(days);
  return candles.map(c => [new Date(c.date).getTime(), c.close]);
}

// ── FRED ──
export async function fetchSofrLatest(limit = 5) {
  const url = `${FRED_BASE}/series/observations?series_id=TERMSFR1M&sort_order=desc&limit=${limit}&api_key=${process.env.FRED_API_KEY}&file_type=json`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.observations ?? []).filter((o: { value: string }) => o.value !== '.');
}

// ── EDGAR ──
export async function fetchEdgarSubmissions(cik: string) {
  const url = `${EDGAR_BASE}/submissions/CIK${cik}.json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'STRCDashboard/1.0 admin@strc.finance' },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`EDGAR fetch failed: ${res.status}`);
  return res.json();
}

export function buildEdgarDocUrl(accessionNo: string, primaryDoc: string): string {
  const normalized = accessionNo.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/1050446/${normalized}/${primaryDoc}`;
}

export async function fetchEdgarDoc(accessionNo: string, primaryDoc: string): Promise<string> {
  const url = buildEdgarDocUrl(accessionNo, primaryDoc);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'STRCDashboard/1.0 admin@strc.finance' },
  });
  if (!res.ok) throw new Error(`EDGAR doc fetch failed: ${res.status}`);
  return res.text();
}

// ── Tradier (MSTR options — real-time, free with funded account) ──
// Use sandbox URL if TRADIER_SANDBOX=true, otherwise production
const TRADIER_BASE = process.env.TRADIER_SANDBOX === 'true'
  ? 'https://sandbox.tradier.com/v1/markets'
  : 'https://api.tradier.com/v1/markets';

/** Fetch available option expiration dates for a ticker */
export async function fetchTradierExpirations(ticker: string): Promise<string[]> {
  const token = process.env.TRADIER_API_KEY;
  if (!token) return [];
  const url = `${TRADIER_BASE}/options/expirations?symbol=${ticker}&includeAllRoots=true&strikes=false`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.expirations?.date ?? [];
}

/** Fetch full options chain for a ticker + expiration date */
export async function fetchTradierChain(ticker: string, expiration: string) {
  const token = process.env.TRADIER_API_KEY;
  if (!token) return [];
  const url = `${TRADIER_BASE}/options/chains?symbol=${ticker}&expiration=${expiration}&greeks=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const options = data?.options?.option;
  if (!options) return [];
  return Array.isArray(options) ? options : [options];
}

/** Fetch quote from Tradier */
export async function fetchTradierQuote(ticker: string) {
  const token = process.env.TRADIER_API_KEY;
  if (!token) return null;
  const url = `${TRADIER_BASE}/quotes?symbols=${ticker}&greeks=false`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const quote = data?.quotes?.quote;
  return quote ?? null;
}

// ── Deribit ──
export async function fetchDeribitBtcOptions() {
  const url = `${DERIBIT_BASE}/get_book_summary_by_currency?currency=BTC&kind=option`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.result ?? [];
}

// ── Helpers ──
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
