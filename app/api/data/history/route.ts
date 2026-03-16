import { NextRequest, NextResponse } from "next/server";
import { desc, gte } from "drizzle-orm";
import {
  CONVERT_DEBT_USD,
  CURRENT_PREF_NOTIONAL,
  CASH_BALANCE,
  MSTR_SHARES_AT_FILING,
} from "@/src/lib/data/capital-structure";

export const revalidate = 0;

const STRC_IPO_DATE = "2025-07-29";

function generateMockTimeSeries(days: number) {
  const now = new Date();
  // Ensure mock data never starts before STRC IPO date
  const ipoDate = new Date(STRC_IPO_DATE + "T00:00:00");
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const startDate = cutoffDate > ipoDate ? cutoffDate : ipoDate;

  const prices: { date: string; strc: number; mstr: number; btc: number; strf: number; strk: number }[] = [];
  const rates: { date: string; strc_rate_pct: number; sofr_1m_pct: number }[] = [];
  const mnavHistory: { date: string; mnav: number; mnav_low: number; mnav_high: number }[] = [];
  const volHistory: { date: string; vol_30d_strc: number; vol_30d_mstr: number; vol_30d_btc: number }[] = [];
  const corrHistory: { date: string; corr_strc_mstr: number; corr_strc_btc: number }[] = [];
  const btcCoverageHistory: { date: string; btc_coverage_ratio: number }[] = [];

  const totalDays = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  let strcPrice = 99.5;
  let mstrPrice = 380;
  let btcPrice = 67000;
  let strfPrice = 88.0;
  let strkPrice = 95.0;
  let sofrRate = 4.35;
  let mnav = 1.18;

  // Dividend schedule rate lookup for mock data (rate by "YYYY-MM" period)
  function prevMockMonth(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return `${py}-${String(pm).padStart(2, "0")}`;
  }
  const mockDivRateByMonth = new Map<string, number>([
    ["2025-08", 9.00],
    ["2025-09", 10.00],
    ["2025-10", 10.25],
    ["2025-11", 10.50],
    ["2025-12", 10.75],
    ["2026-01", 11.00],
    ["2026-02", 11.25],
    ["2026-03", 11.50],
  ]);

  for (let i = totalDays; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    if (dateStr < STRC_IPO_DATE) continue;

    // Random walk
    strcPrice = Math.max(95, Math.min(108, strcPrice + (Math.random() - 0.48) * 0.3));
    mstrPrice = Math.max(280, Math.min(520, mstrPrice + (Math.random() - 0.47) * 8));
    btcPrice = Math.max(55000, Math.min(85000, btcPrice + (Math.random() - 0.47) * 1200));
    strfPrice = Math.max(82, Math.min(96, strfPrice + (Math.random() - 0.49) * 0.25));
    strkPrice = Math.max(88, Math.min(105, strkPrice + (Math.random() - 0.48) * 0.35));
    // mNAV derived from Strategy formula: EV / BTC Reserve
    // EV = MSTR MCap + converts + preferred − cash (from shared capital-structure module)
    const mockMstrMcap = mstrPrice * MSTR_SHARES_AT_FILING;
    const mockEV = mockMstrMcap + CONVERT_DEBT_USD + CURRENT_PREF_NOTIONAL - CASH_BALANCE;
    const mockBtcReserve = btcPrice * 761068;
    mnav = mockBtcReserve > 0 ? mockEV / mockBtcReserve : 1.0;

    // STRC rate from dividend schedule (rate takes effect on record date = 15th)
    const month = dateStr.slice(0, 7);
    const day = parseInt(dateStr.slice(8, 10));
    const effectiveMonth = day < 15 ? prevMockMonth(month) : month;
    const strcRate = mockDivRateByMonth.get(effectiveMonth) ?? mockDivRateByMonth.get(prevMockMonth(effectiveMonth)) ?? 9.0;

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

    // BTC coverage ratio: derived from formula (same as snapshot)
    // btcNav / (strcAtmDeployed + annualObligations * 3)
    const mockBtcHoldings = 761068;
    const mockBtcNav = btcPrice * mockBtcHoldings;
    const mockStrcAtmDeployed = 3_842_800_000;
    const mockAnnualObligations = 689_000_000;
    const mockCoverageDenom = mockStrcAtmDeployed + mockAnnualObligations * 3;
    const covRatio = mockCoverageDenom > 0 ? mockBtcNav / mockCoverageDenom : 0;
    btcCoverageHistory.push({
      date: dateStr,
      btc_coverage_ratio: +covRatio.toFixed(4),
    });
  }

  // SOFR forward curve — anchored to mock 1M rate with term spread
  const mockSofr1m = 4.3;
  const sofrForward = [
    { term: "1M", rate: mockSofr1m },
    { term: "3M", rate: parseFloat((mockSofr1m - 0.15).toFixed(2)) },
    { term: "6M", rate: parseFloat((mockSofr1m - 0.35).toFixed(2)) },
    { term: "1Y", rate: parseFloat((mockSofr1m - 0.60).toFixed(2)) },
    { term: "2Y", rate: parseFloat((mockSofr1m - 0.85).toFixed(2)) },
  ];

  // Mock dividend schedule
  const mockDividends = [
    { period: "Mar 2026", periodSort: "2026-03", recordDate: "03/15/2026", payoutDate: "03/31/2026", ratePct: 11.50, dividendPerShare: 0.96, isCurrent: true, isProRated: false, announcedDate: "2026-02-14" },
    { period: "Feb 2026", periodSort: "2026-02", recordDate: "02/15/2026", payoutDate: "02/27/2026", ratePct: 11.25, dividendPerShare: 0.94, isCurrent: false, isProRated: false, announcedDate: "2026-01-15" },
    { period: "Jan 2026", periodSort: "2026-01", recordDate: "01/15/2026", payoutDate: "01/30/2026", ratePct: 11.00, dividendPerShare: 0.92, isCurrent: false, isProRated: false, announcedDate: "2025-12-13" },
    { period: "Dec 2025", periodSort: "2025-12", recordDate: "12/15/2025", payoutDate: "12/31/2025", ratePct: 10.75, dividendPerShare: 0.90, isCurrent: false, isProRated: false, announcedDate: "2025-11-15" },
    { period: "Nov 2025", periodSort: "2025-11", recordDate: "11/15/2025", payoutDate: "11/28/2025", ratePct: 10.50, dividendPerShare: 0.88, isCurrent: false, isProRated: false, announcedDate: "2025-10-15" },
    { period: "Oct 2025", periodSort: "2025-10", recordDate: "10/15/2025", payoutDate: "10/31/2025", ratePct: 10.25, dividendPerShare: 0.85, isCurrent: false, isProRated: false, announcedDate: "2025-09-13" },
    { period: "Sep 2025", periodSort: "2025-09", recordDate: "09/15/2025", payoutDate: "09/30/2025", ratePct: 10.00, dividendPerShare: 0.83, isCurrent: false, isProRated: false, announcedDate: "2025-08-14" },
    { period: "Aug 2025", periodSort: "2025-08", recordDate: "08/15/2025", payoutDate: "08/29/2025", ratePct: 9.00, dividendPerShare: 0.80, isCurrent: false, isProRated: true, announcedDate: "2025-07-29" },
  ];

  return { prices, rates, mnav: mnavHistory, vol: volHistory, corr: corrHistory, btc_coverage: btcCoverageHistory, sofr_forward: sofrForward, dividends: mockDividends };
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
    // Never return STRC data before IPO
    const ipoDate = new Date(STRC_IPO_DATE + "T00:00:00");
    const effectiveCutoff = cutoff > ipoDate ? cutoff : ipoDate;
    const cutoffStr = effectiveCutoff.toISOString().slice(0, 10);

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

    // Build dividend schedule from rate history
    const allRateRows = await db
      .select()
      .from(strcRateHistory)
      .orderBy(desc(strcRateHistory.effectiveDate));

    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const dividends = allRateRows.map((r) => {
      const [yyyy, mm] = r.effectiveDate.split("-");
      const year = parseInt(yyyy);
      const month = parseInt(mm);
      const ratePct = parseFloat(r.ratePct);
      const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      // Last business day of month
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
        isProRated: r.effectiveDate === "2025-08-01",
        announcedDate: r.announcedDate,
      };
    });

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

    const btcCoverageHistory = metricRows
      .filter((m) => m.btcCoverageRatio)
      .map((m) => ({
        date: m.date,
        btc_coverage_ratio: parseFloat(m.btcCoverageRatio!),
      }));

    // Build SOFR forward curve anchored to latest 1M rate
    // Term spreads reflect market expectation of easing (inverted when rates expected to fall)
    const latestSofr1m = sofrRows.length > 0 ? parseFloat(sofrRows[sofrRows.length - 1].sofr1mPct) : 4.3;
    const sofrForward = [
      { term: "1M", rate: latestSofr1m },
      { term: "3M", rate: parseFloat((latestSofr1m - 0.15).toFixed(2)) },
      { term: "6M", rate: parseFloat((latestSofr1m - 0.35).toFixed(2)) },
      { term: "1Y", rate: parseFloat((latestSofr1m - 0.60).toFixed(2)) },
      { term: "2Y", rate: parseFloat((latestSofr1m - 0.85).toFixed(2)) },
    ];

    return NextResponse.json({
      prices,
      rates,
      mnav: mnavHistory,
      vol: volHistory,
      corr: corrHistory,
      btc_coverage: btcCoverageHistory,
      sofr_forward: sofrForward,
      dividends,
    });
  } catch {
    return NextResponse.json(generateMockTimeSeries(days));
  }
}
