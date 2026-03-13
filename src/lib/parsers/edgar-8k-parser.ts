/**
 * EDGAR 8-K Parser
 * Source: Phase 3 Section 4
 */

import { buildEdgarDocUrl, stripHtml } from "@/src/lib/utils/fetchers";

export interface ParsedEightK {
  accessionNo: string;
  filingDate: string;
  btcHoldings?: { count: number; avgCost?: number; totalCost?: number };
  atmProceeds?: Array<{
    ticker: "STRC" | "STRF" | "STRK" | "STRD" | "MSTR";
    proceeds: number;
    shares: number;
    avgPrice: number;
  }>;
  strcRate?: { ratePct: number; effectiveDate: string };
  usdReserve?: { amount: number };
  sharesOutstanding?: { mstr: number };
  notes: string;
}

export async function parse8K(
  accessionNo: string,
  filingDate: string,
  primaryDoc: string
): Promise<ParsedEightK> {
  const url = buildEdgarDocUrl(accessionNo, primaryDoc);
  const res = await fetch(url, {
    headers: { "User-Agent": "STRCDashboard/1.0 admin@strc.finance" },
  });
  if (!res.ok) throw new Error(`EDGAR fetch failed: ${res.status}`);
  const html = await res.text();
  const text = stripHtml(html);

  const result: ParsedEightK = { accessionNo, filingDate, notes: "" };

  result.btcHoldings = extractBtcHoldings(text);
  result.atmProceeds = extractAtmProceeds(text);
  result.strcRate = extractStrcRate(text, filingDate);
  result.usdReserve = extractUsdReserve(text);
  result.sharesOutstanding = extractSharesOutstanding(text);

  result.notes = buildNotesSummary(result);
  return result;
}

function extractBtcHoldings(
  text: string
): ParsedEightK["btcHoldings"] {
  const patterns = [
    /approximately\s+([\d,]+)\s+bitcoin/i,
    /([\d,]+)\s+bitcoin/i,
    /aggregate\s+bitcoin\s+holdings\s+of\s+([\d,]+)/i,
    /holds?\s+([\d,]+)\s+(?:bitcoin|btc)/i,
  ];

  let count: number | null = null;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      const parsed = parseInt(match[1].replace(/,/g, ""));
      if (parsed >= 500_000 && parsed <= 2_000_000) {
        count = parsed;
        break;
      }
    }
  }

  if (!count) return undefined;

  const costMatch =
    /average\s+cost\s+(?:basis|per\s+bitcoin)\s+of\s+approximately\s+\$([\d,]+)/i.exec(
      text
    );
  const avgCost = costMatch
    ? parseInt(costMatch[1].replace(/,/g, ""))
    : undefined;

  return { count, avgCost, totalCost: avgCost ? count * avgCost : undefined };
}

function extractAtmProceeds(
  text: string
): ParsedEightK["atmProceeds"] {
  const results: NonNullable<ParsedEightK["atmProceeds"]> = [];
  const tickers = ["STRC", "STRF", "STRK", "STRD", "MSTR"] as const;

  for (const ticker of tickers) {
    const proceedsPatterns = [
      new RegExp(
        `${ticker}[^.]{0,200}(?:\\$([\\d.]+)\\s*(?:million|billion)|([\\d,]+)\\s*(?:million|billion)\\s*dollars)[^.]{0,100}(?:atm|at-the-market)`,
        "i"
      ),
      new RegExp(
        `(?:atm|at-the-market)[^.]{0,200}${ticker}[^.]{0,200}\\$([\\d.]+)\\s*(?:million|billion)`,
        "i"
      ),
      new RegExp(
        `aggregate\\s+proceeds[^.]{0,100}${ticker}[^.]{0,100}\\$([\\d.]+)\\s*(?:million|billion)`,
        "i"
      ),
    ];

    const sharesPatterns = [
      new RegExp(`([\\d,]+)\\s+shares\\s+of[^.]{0,50}${ticker}`, "i"),
      new RegExp(`${ticker}[^.]{0,50}([\\d,]+)\\s+shares`, "i"),
    ];

    let proceeds: number | null = null;
    let shares: number | null = null;

    for (const pattern of proceedsPatterns) {
      const match = pattern.exec(text);
      if (match) {
        const raw = parseFloat((match[1] || match[2]).replace(/,/g, ""));
        const isBillion = match[0].toLowerCase().includes("billion");
        proceeds = isBillion ? raw * 1_000_000_000 : raw * 1_000_000;
        break;
      }
    }

    for (const pattern of sharesPatterns) {
      const match = pattern.exec(text);
      if (match) {
        shares = parseInt(match[1].replace(/,/g, ""));
        break;
      }
    }

    if (proceeds && shares) {
      results.push({ ticker, proceeds, shares, avgPrice: proceeds / shares });
    }
  }

  return results.length > 0 ? results : undefined;
}

function extractStrcRate(
  text: string,
  filingDate: string
): ParsedEightK["strcRate"] {
  const patterns = [
    /STRC[^.]{0,150}(\d+\.\d+)%\s*per\s*annum/i,
    /(\d+\.\d+)%\s*per\s*annum[^.]{0,150}STRC/i,
    /monthly\s+(?:regular\s+)?dividend\s+rate[^.]{0,100}(\d+\.\d+)%/i,
    /dividend\s+rate[^.]{0,50}(?:has\s+been\s+)?(?:set|determined)[^.]{0,50}(\d+\.\d+)%/i,
    /(\d+\.\d+)%[^.]{0,50}(?:annual(?:ized)?|per\s+annum)[^.]{0,100}(?:stretch|STRC)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const ratePct = parseFloat(match[1]);
      if (ratePct >= 4.0 && ratePct <= 25.0) {
        const filingDt = new Date(filingDate);
        const effectiveMonth = new Date(
          filingDt.getFullYear(),
          filingDt.getMonth() + 1,
          1
        );
        const effectiveDate = effectiveMonth.toISOString().slice(0, 10);
        return { ratePct, effectiveDate };
      }
    }
  }
  return undefined;
}

function extractUsdReserve(text: string): ParsedEightK["usdReserve"] {
  const patterns = [
    /USD\s+Reserve[^.]{0,100}\$?([\d.]+)\s*(?:billion|million)/i,
    /cash\s+and\s+cash\s+equivalents[^.]{0,100}\$?([\d.]+)\s*(?:billion|million)/i,
    /\$?([\d.]+)\s*(?:billion|million)[^.]{0,100}(?:USD\s+Reserve|unrestricted\s+cash)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const raw = parseFloat(match[1]);
      const isBillion = match[0].toLowerCase().includes("billion");
      const amount = isBillion ? raw * 1_000_000_000 : raw * 1_000_000;
      if (amount >= 1e8 && amount <= 2e10) return { amount };
    }
  }
  return undefined;
}

function extractSharesOutstanding(
  text: string
): ParsedEightK["sharesOutstanding"] {
  const patterns = [
    /(\d{1,3}(?:,\d{3})*)\s+shares\s+of\s+(?:Class\s+A\s+)?common\s+stock\s+(?:were\s+)?(?:issued\s+and\s+)?outstanding/i,
    /(?:Class\s+A\s+)?common\s+stock[^.]{0,100}(\d{1,3}(?:,\d{3})*)\s+shares\s+outstanding/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const shares = parseInt(match[1].replace(/,/g, ""));
      if (shares >= 100_000_000 && shares <= 500_000_000) {
        return { mstr: shares };
      }
    }
  }
  return undefined;
}

function buildNotesSummary(result: ParsedEightK): string {
  const parts: string[] = [];
  if (result.btcHoldings)
    parts.push(`BTC: ${result.btcHoldings.count.toLocaleString()}`);
  if (result.atmProceeds)
    parts.push(
      `ATM: ${result.atmProceeds.map((a) => `${a.ticker} $${(a.proceeds / 1e6).toFixed(0)}M`).join(", ")}`
    );
  if (result.strcRate)
    parts.push(`Rate: ${result.strcRate.ratePct}% eff. ${result.strcRate.effectiveDate}`);
  if (result.usdReserve)
    parts.push(`Reserve: $${(result.usdReserve.amount / 1e9).toFixed(2)}B`);
  if (result.sharesOutstanding)
    parts.push(`MSTR shares: ${result.sharesOutstanding.mstr.toLocaleString()}`);
  return parts.join(" | ") || "No structured data extracted";
}
