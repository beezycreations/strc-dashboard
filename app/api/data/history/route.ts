import { NextRequest, NextResponse } from "next/server";
import { desc, gte } from "drizzle-orm";

export const revalidate = 0;

function generateMockTimeSeries(days: number) {
  const now = new Date();
  const prices: { date: string; strc: number; mstr: number; btc: number; strf: number; strk: number }[] = [];
  const rates: { date: string; strc_rate_pct: number; sofr_1m_pct: number }[] = [];
  const mnavHistory: { date: string; mnav: number; mnav_low: number; mnav_high: number }[] = [];
  const volHistory: { date: string; vol_30d_strc: number; vol_30d_mstr: number; vol_30d_btc: number }[] = [];
  const corrHistory: { date: string; corr_strc_mstr: number; corr_strc_btc: number }[] = [];

  let strcPrice = 99.5;
  let mstrPrice = 380;
  let btcPrice = 67000;
  let strfPrice = 88.0;
  let strkPrice = 95.0;
  let strcRate = 10.5;
  let sofrRate = 4.35;
  let mnav = 1.18;

  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    // Random walk
    strcPrice = Math.max(95, Math.min(108, strcPrice + (Math.random() - 0.48) * 0.3));
    mstrPrice = Math.max(280, Math.min(520, mstrPrice + (Math.random() - 0.47) * 8));
    btcPrice = Math.max(55000, Math.min(85000, btcPrice + (Math.random() - 0.47) * 1200));
    strfPrice = Math.max(82, Math.min(96, strfPrice + (Math.random() - 0.49) * 0.25));
    strkPrice = Math.max(88, Math.min(105, strkPrice + (Math.random() - 0.48) * 0.35));
    mnav = Math.max(0.9, Math.min(1.5, mnav + (Math.random() - 0.48) * 0.02));

    // Rate steps up monthly
    if (i % 30 === 0 && i < days - 10) {
      strcRate = Math.min(12.0, strcRate + 0.25);
    }

    prices.push({
      date: dateStr,
      strc: +strcPrice.toFixed(2),
      mstr: +mstrPrice.toFixed(2),
      btc: +btcPrice.toFixed(0),
      strf: +strfPrice.toFixed(2),
      strk: +strkPrice.toFixed(2),
    });

    rates.push({
      date: dateStr,
      strc_rate_pct: +strcRate.toFixed(2),
      sofr_1m_pct: +(sofrRate + (Math.random() - 0.5) * 0.02).toFixed(4),
    });

    mnavHistory.push({
      date: dateStr,
      mnav: +mnav.toFixed(4),
      mnav_low: +(mnav - 0.04).toFixed(4),
      mnav_high: +(mnav + 0.04).toFixed(4),
    });

    volHistory.push({
      date: dateStr,
      vol_30d_strc: +(8 + Math.random() * 6).toFixed(2),
      vol_30d_mstr: +(55 + Math.random() * 25).toFixed(2),
      vol_30d_btc: +(40 + Math.random() * 20).toFixed(2),
    });

    corrHistory.push({
      date: dateStr,
      corr_strc_mstr: +(0.15 + Math.random() * 0.35).toFixed(4),
      corr_strc_btc: +(0.08 + Math.random() * 0.3).toFixed(4),
    });
  }

  const sofrForward = [
    { term: "1M", rate: 4.3 },
    { term: "3M", rate: 4.15 },
    { term: "6M", rate: 3.95 },
    { term: "1Y", rate: 3.7 },
    { term: "2Y", rate: 3.45 },
  ];

  return { prices, rates, mnav: mnavHistory, vol: volHistory, corr: corrHistory, sofr_forward: sofrForward };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") ?? "3m";

  const daysMap: Record<string, number> = { "1m": 30, "3m": 90, all: 365 };
  const days = daysMap[range] ?? 90;

  try {
    const { db } = await import("@/src/db/client");
    const { priceHistory, strcRateHistory, sofrHistory, dailyMetrics } = await import("@/src/db/schema");

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Fetch price series
    const priceRows = await db
      .select()
      .from(priceHistory)
      .where(gte(priceHistory.ts, new Date(cutoffStr)))
      .orderBy(priceHistory.ts);

    // Fetch rate history
    const rateRows = await db
      .select()
      .from(strcRateHistory)
      .where(gte(strcRateHistory.effectiveDate, cutoffStr))
      .orderBy(strcRateHistory.effectiveDate);

    // Fetch SOFR history
    const sofrRows = await db
      .select()
      .from(sofrHistory)
      .where(gte(sofrHistory.date, cutoffStr))
      .orderBy(sofrHistory.date);

    // Fetch daily metrics for vol/corr/mnav
    const metricRows = await db
      .select()
      .from(dailyMetrics)
      .where(gte(dailyMetrics.date, cutoffStr))
      .orderBy(dailyMetrics.date);

    if (priceRows.length === 0 && rateRows.length === 0) {
      return NextResponse.json(generateMockTimeSeries(days));
    }

    // Group prices by date
    const pricesByDate = new Map<string, Record<string, number>>();
    for (const row of priceRows) {
      const dateStr = new Date(row.ts).toISOString().slice(0, 10);
      if (!pricesByDate.has(dateStr)) pricesByDate.set(dateStr, {});
      const entry = pricesByDate.get(dateStr)!;
      entry[row.ticker.toLowerCase()] = parseFloat(row.price);
    }

    const prices = Array.from(pricesByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date,
        strc: vals.strc ?? 0,
        mstr: vals.mstr ?? 0,
        btc: vals.btc ?? 0,
        strf: vals.strf ?? 0,
        strk: vals.strk ?? 0,
      }));

    const rates = rateRows.map((r) => ({
      date: r.effectiveDate,
      strc_rate_pct: parseFloat(r.ratePct),
      sofr_1m_pct: 0,
    }));

    // Merge SOFR into rates
    const sofrMap = new Map(sofrRows.map((s) => [s.date, parseFloat(s.sofr1mPct)]));
    for (const r of rates) {
      r.sofr_1m_pct = sofrMap.get(r.date) ?? r.sofr_1m_pct;
    }

    const mnavHistory = metricRows
      .filter((m) => m.mnav)
      .map((m) => ({
        date: m.date,
        mnav: parseFloat(m.mnav!),
        mnav_low: parseFloat(m.mnavLow ?? m.mnav!),
        mnav_high: parseFloat(m.mnavHigh ?? m.mnav!),
      }));

    const volHistory = metricRows
      .filter((m) => m.vol30dStrc)
      .map((m) => ({
        date: m.date,
        vol_30d_strc: parseFloat(m.vol30dStrc!),
        vol_30d_mstr: parseFloat(m.vol30dMstr ?? "0"),
        vol_30d_btc: parseFloat(m.vol30dBtc ?? "0"),
      }));

    const corrHistory = metricRows
      .filter((m) => m.corrStrcMstr30d)
      .map((m) => ({
        date: m.date,
        corr_strc_mstr: parseFloat(m.corrStrcMstr30d!),
        corr_strc_btc: parseFloat(m.corrStrcBtc30d ?? "0"),
      }));

    const sofrForward = [
      { term: "1M", rate: sofrRows.length > 0 ? parseFloat(sofrRows[sofrRows.length - 1].sofr1mPct) : 4.3 },
      { term: "3M", rate: 4.15 },
      { term: "6M", rate: 3.95 },
      { term: "1Y", rate: 3.7 },
      { term: "2Y", rate: 3.45 },
    ];

    return NextResponse.json({
      prices,
      rates,
      mnav: mnavHistory,
      vol: volHistory,
      corr: corrHistory,
      sofr_forward: sofrForward,
    });
  } catch {
    return NextResponse.json(generateMockTimeSeries(days));
  }
}
