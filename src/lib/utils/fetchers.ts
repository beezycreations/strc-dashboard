// API fetchers for external data sources

const FMP_BASE = 'https://financialmodelingprep.com/api';
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const FRED_BASE = 'https://api.stlouisfed.org/fred';
const EDGAR_BASE = 'https://data.sec.gov';
const DERIBIT_BASE = 'https://www.deribit.com/api/v2/public';

// ── FMP ──
export async function fetchFmpQuote(ticker: string) {
  const url = `${FMP_BASE}/v3/quote/${ticker}?apikey=${process.env.FMP_API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.[0] ?? null;
}

export async function fetchFmpHistory(ticker: string, from: string, to: string) {
  const url = `${FMP_BASE}/v3/historical-price-full/${ticker}?from=${from}&to=${to}&apikey=${process.env.FMP_API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.historical ?? [];
}

export async function fetchFmpOptions(ticker: string) {
  const url = `${FMP_BASE}/v3/options/${ticker}?apikey=${process.env.FMP_API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  return data ?? [];
}

export async function fetchFmpSharesFloat(ticker: string) {
  const url = `${FMP_BASE}/v4/shares_float?symbol=${ticker}&apikey=${process.env.FMP_API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.[0] ?? null;
}

// ── CoinGecko ──
export async function fetchBtcPrice() {
  const url = `${COINGECKO_BASE}/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) return { usd: 0, usd_24h_change: 0 };
  const data = await res.json();
  return data?.bitcoin ?? { usd: 0, usd_24h_change: 0 };
}

export async function fetchBtcHistory(days = 365) {
  const url = `${COINGECKO_BASE}/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.prices ?? [];
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
