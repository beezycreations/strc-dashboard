import { NextRequest, NextResponse } from "next/server";
import { desc, gte } from "drizzle-orm";

export const revalidate = 0;

const STRC_IPO_DATE = "2025-07-29";

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
      return NextResponse.json({ prices: [], rates: [], mnav: [], vol: [], corr: [], btc_coverage: [], sofr_forward: [], dividends: [] });
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
      // Filter out non-trading days (weekends/holidays where equities have no data)
      .filter(([, vals]) => vals.strc && vals.strc > 0)
      .map(([date, vals]) => ({
        date,
        strc: vals.strc ?? null,
        mstr: vals.mstr ?? null,
        btc: vals.btc ?? null,
        strf: vals.strf ?? null,
        strk: vals.strk ?? null,
      }));

    const rates = rateRows.map((r) => ({
      date: r.effectiveDate,
      strc_rate_pct: parseFloat(r.ratePct),
      sofr_1m_pct: null as number | null,
    }));

    // Merge SOFR into rates using forward-fill (closest SOFR on or before each rate date)
    // SOFR dates (every business day) rarely match STRC rate dates (1st of month),
    // so exact key match fails. Sort SOFR rows and binary-search for closest prior date.
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

    for (const r of rates) {
      r.sofr_1m_pct = findSofrOnOrBefore(r.date);
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

    const cashCoverageHistory = metricRows
      .filter((m) => m.usdReserveMonths)
      .map((m) => ({
        date: m.date,
        usd_reserve_months: parseFloat(m.usdReserveMonths!),
      }));

    // Build SOFR forward curve anchored to latest 1M rate
    // Term spreads reflect market expectation of easing (inverted when rates expected to fall)
    const latestSofr1m = sofrRows.length > 0 ? parseFloat(sofrRows[sofrRows.length - 1].sofr1mPct) : null;
    // Only build forward curve if we have real SOFR data
    const sofrForward = latestSofr1m != null && latestSofr1m > 0 ? [
      { term: "1M", rate: latestSofr1m },
      { term: "3M", rate: parseFloat((latestSofr1m - 0.15).toFixed(2)) },
      { term: "6M", rate: parseFloat((latestSofr1m - 0.35).toFixed(2)) },
      { term: "1Y", rate: parseFloat((latestSofr1m - 0.60).toFixed(2)) },
      { term: "2Y", rate: parseFloat((latestSofr1m - 0.85).toFixed(2)) },
    ] : [];

    return NextResponse.json({
      prices,
      rates,
      mnav: mnavHistory,
      vol: volHistory,
      corr: corrHistory,
      btc_coverage: btcCoverageHistory,
      cash_coverage: cashCoverageHistory,
      sofr_forward: sofrForward,
      dividends,
    });
  } catch {
    return NextResponse.json({ prices: [], rates: [], mnav: [], vol: [], corr: [], btc_coverage: [], cash_coverage: [], sofr_forward: [], dividends: [] });
  }
}
