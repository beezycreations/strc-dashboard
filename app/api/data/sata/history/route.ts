import { NextRequest, NextResponse } from "next/server";
import { gte } from "drizzle-orm";
import { SATA_RATE_PCT } from "@/src/lib/data/sata-capital-structure";

export const revalidate = 0;

// ── FMP fallback for when DB has no SATA price data ─────────────────

async function fetchFmpHistorical(ticker: string, days: number): Promise<Array<{ date: string; close: number }>> {
  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return [];
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${ticker}&from=${from}&to=${to}&apikey=${fmpKey}`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const hist = Array.isArray(data) ? data : (data?.historical ?? []);
    return hist
      .filter((h: { close: number }) => h.close > 0)
      .map((h: { date: string; close: number }) => ({ date: h.date, close: h.close }))
      .reverse(); // oldest first
  } catch {
    return [];
  }
}

async function fetchBtcHistorical(days: number): Promise<Array<{ date: string; close: number }>> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const allPrices: Array<{ ts: number; close: number }> = [];
  try {
    let chunkEnd = new Date(end);
    while (chunkEnd > start) {
      const chunkStart = new Date(Math.max(chunkEnd.getTime() - 300 * 86400000, start.getTime()));
      const url = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=${chunkStart.toISOString()}&end=${chunkEnd.toISOString()}`;
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (!res.ok) break;
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const [ts, , , , close] of data) {
          if (close > 0) allPrices.push({ ts, close });
        }
      }
      chunkEnd = new Date(chunkStart.getTime() - 86400000);
    }
  } catch { /* empty */ }
  allPrices.sort((a, b) => a.ts - b.ts);
  const byDate = new Map<number, number>();
  for (const p of allPrices) { if (!byDate.has(p.ts)) byDate.set(p.ts, p.close); }
  return Array.from(byDate.entries()).map(([ts, close]) => ({
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    close,
  }));
}

function buildSofrForward(sofr1m: number) {
  return [
    { term: "1M", rate: sofr1m },
    { term: "3M", rate: parseFloat((sofr1m - 0.15).toFixed(2)) },
    { term: "6M", rate: parseFloat((sofr1m - 0.35).toFixed(2)) },
    { term: "1Y", rate: parseFloat((sofr1m - 0.60).toFixed(2)) },
    { term: "2Y", rate: parseFloat((sofr1m - 0.85).toFixed(2)) },
  ];
}

async function buildLiveResponse(days: number) {
  // Fetch SATA + ASST + BTC prices from FMP/Coinbase
  const [sataHist, asstHist, btcHist] = await Promise.all([
    fetchFmpHistorical("SATA", days),
    fetchFmpHistorical("ASST", days),
    fetchBtcHistorical(days),
  ]);

  // Merge by date
  const allDates = new Set<string>();
  const sataByDate = new Map(sataHist.map(p => [p.date, p.close]));
  const asstByDate = new Map(asstHist.map(p => [p.date, p.close]));
  const btcByDate = new Map(btcHist.map(p => [p.date, p.close]));
  for (const d of sataHist) allDates.add(d.date);
  for (const d of asstHist) allDates.add(d.date);

  const prices = Array.from(allDates)
    .sort()
    .filter(d => sataByDate.has(d)) // only days where SATA traded
    .map(date => ({
      date,
      sata: sataByDate.get(date) ?? null,
      asst: asstByDate.get(date) ?? null,
      btc: btcByDate.get(date) ?? null,
      mstr: null,
    }));

  // Try to get SOFR from DB (shared table), fall back to static estimate
  let sofrForward: Array<{ term: string; rate: number }> = [];
  try {
    const { db } = await import("@/src/db/client");
    const { sofrHistory } = await import("@/src/db/schema");
    const { desc } = await import("drizzle-orm");
    const [latestSofr] = await db
      .select()
      .from(sofrHistory)
      .orderBy(desc(sofrHistory.date))
      .limit(1);
    if (latestSofr) {
      sofrForward = buildSofrForward(parseFloat(latestSofr.sofr1mPct));
    }
  } catch { /* empty */ }

  // If no SOFR from DB, use a reasonable estimate
  if (sofrForward.length === 0) {
    sofrForward = buildSofrForward(4.32); // approximate current SOFR
  }

  return {
    prices,
    rates: [] as Array<{ date: string; sata_rate_pct: number; sofr_1m_pct: number | null }>,
    amplification: [],
    ev_mnav: [],
    sofr_forward: sofrForward,
    dividends: [],
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") ?? "3m";

  const daysMap: Record<string, number> = { "1m": 30, "3m": 90, all: 365 };
  const days = daysMap[range] ?? 90;

  try {
    const { db } = await import("@/src/db/client");
    const { priceHistory, sataRateHistory, sofrHistory, sataDailyMetrics } = await import("@/src/db/schema");

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Fetch price series (SATA + ASST + BTC)
    const priceRows = await db
      .select()
      .from(priceHistory)
      .where(gte(priceHistory.ts, new Date(cutoffStr)))
      .orderBy(priceHistory.ts);

    // Filter for SATA-relevant tickers
    const sataRows = priceRows.filter(r => ["SATA", "ASST", "BTC", "MSTR"].includes(r.ticker.toUpperCase()));

    // If no SATA price data in DB, fall back to live FMP
    if (sataRows.filter(r => r.ticker.toUpperCase() === "SATA").length === 0) {
      return NextResponse.json(await buildLiveResponse(days));
    }

    // Fetch SATA rate history
    const rateRows = await db
      .select()
      .from(sataRateHistory)
      .where(gte(sataRateHistory.effectiveDate, cutoffStr))
      .orderBy(sataRateHistory.effectiveDate);

    // Fetch SOFR history (shared table with STRC)
    const sofrRows = await db
      .select()
      .from(sofrHistory)
      .where(gte(sofrHistory.date, cutoffStr))
      .orderBy(sofrHistory.date);

    // Fetch daily metrics
    const metricRows = await db
      .select()
      .from(sataDailyMetrics)
      .where(gte(sataDailyMetrics.date, cutoffStr))
      .orderBy(sataDailyMetrics.date);

    // Group prices by date
    const pricesByDate = new Map<string, Record<string, number>>();
    for (const row of sataRows) {
      const ticker = row.ticker.toUpperCase();
      const dateStr = new Date(row.ts).toISOString().slice(0, 10);
      if (!pricesByDate.has(dateStr)) pricesByDate.set(dateStr, {});
      const entry = pricesByDate.get(dateStr)!;
      entry[ticker.toLowerCase()] = parseFloat(row.price);
    }

    const prices = Array.from(pricesByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date,
        sata: vals.sata ?? null,
        asst: vals.asst ?? null,
        btc: vals.btc ?? null,
        mstr: vals.mstr ?? null,
      }));

    // Rate history with SOFR merge
    const sofrSorted = sofrRows
      .map((s) => ({ date: s.date, rate: parseFloat(s.sofr1mPct) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    function findSofrOnOrBefore(targetDate: string): number | null {
      let result: number | null = null;
      for (const s of sofrSorted) {
        if (s.date <= targetDate) result = s.rate;
        else break;
      }
      return result;
    }

    const rates = rateRows.map((r) => ({
      date: r.effectiveDate,
      sata_rate_pct: parseFloat(r.ratePct),
      sofr_1m_pct: findSofrOnOrBefore(r.effectiveDate),
    }));

    // Amplification ratio history
    const amplificationHistory = metricRows
      .filter((m) => m.amplificationRatio)
      .map((m) => ({
        date: m.date,
        amplification_ratio: parseFloat(m.amplificationRatio!),
      }));

    // EV/mNAV history
    const evMnavHistory = metricRows
      .filter((m) => m.evMnav)
      .map((m) => ({
        date: m.date,
        ev_mnav: parseFloat(m.evMnav!),
      }));

    // Build SOFR forward curve from shared SOFR table
    const latestSofr1m = sofrRows.length > 0 ? parseFloat(sofrRows[sofrRows.length - 1].sofr1mPct) : null;
    const sofrForward = latestSofr1m != null && latestSofr1m > 0
      ? buildSofrForward(latestSofr1m)
      : buildSofrForward(4.32); // fallback estimate

    // Build dividend schedule from rate history
    const { desc } = await import("drizzle-orm");
    const allRateRows = await db
      .select()
      .from(sataRateHistory)
      .orderBy(desc(sataRateHistory.effectiveDate));

    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const dividends = allRateRows.map((r) => {
      const [yyyy, mm] = r.effectiveDate.split("-");
      const year = parseInt(yyyy);
      const month = parseInt(mm);
      const ratePct = parseFloat(r.ratePct);
      const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      const lastDay = new Date(year, month, 0);
      const dow = lastDay.getDay();
      if (dow === 0) lastDay.setDate(lastDay.getDate() - 2);
      if (dow === 6) lastDay.setDate(lastDay.getDate() - 1);
      const payoutMm = String(lastDay.getMonth() + 1).padStart(2, "0");
      const payoutDd = String(lastDay.getDate()).padStart(2, "0");

      const periodSort = `${yyyy}-${mm.padStart(2, "0")}`;
      return {
        period: `${monthNames[month]} ${yyyy}`,
        periodSort,
        recordDate: `${mm.padStart(2, "0")}/15/${yyyy}`,
        payoutDate: `${payoutMm}/${payoutDd}/${lastDay.getFullYear()}`,
        ratePct,
        dividendPerShare: parseFloat(((ratePct / 12 / 100) * 100).toFixed(2)),
        isCurrent: periodSort === currentPeriod,
      };
    });

    return NextResponse.json({
      prices,
      rates,
      amplification: amplificationHistory,
      ev_mnav: evMnavHistory,
      sofr_forward: sofrForward,
      dividends,
    });
  } catch {
    // DB unavailable — use live FMP data
    try {
      return NextResponse.json(await buildLiveResponse(days));
    } catch {
      return NextResponse.json({ prices: [], rates: [], amplification: [], ev_mnav: [], sofr_forward: buildSofrForward(4.32), dividends: [] });
    }
  }
}
