/**
 * Options chain filtering logic
 * Source: Phase 2 Sections 6.7.1–6.7.2
 */

export interface OptionRow {
  strike: number;
  bid: number;
  ask: number;
  mid: number;
  mid_btc?: number;
  iv: number;
  delta: number;
  theta?: number;
  oi: number;
  volume?: number;
  instrument_name?: string;
  dte: number;
  is_atm: boolean;
}

/** Filter FMP MSTR options to puts within expiry window, ATM ± 5 strikes */
export function filterMstrChain(
  contracts: Array<{
    date?: string;
    expiration?: string;
    puts_calls?: string;
    type?: string;
    strike: number | string;
    bid: number | string;
    ask: number | string;
    last_price?: number | string;
    implied_volatility?: number | string;
    impliedVolatility?: number;
    delta: number | string;
    theta?: number | string;
    open_interest?: number | string;
    openInterest?: number;
    volume: number | string;
  }>,
  mstrPrice: number,
  expiryWindow: "30d" | "60d" | "90d"
): OptionRow[] {
  const now = new Date();
  const windowDays = { "30d": 30, "60d": 60, "90d": 90 }[expiryWindow];

  // Filter puts
  const puts = contracts.filter(
    (c) => (c.puts_calls ?? c.type ?? "").toLowerCase().includes("put")
  );

  // Find nearest expiry within window
  const expiries = [...new Set(puts.map((c) => c.date ?? c.expiration ?? ""))].filter(Boolean);
  const targetExpiry = expiries
    .map((exp) => ({
      exp,
      dte: Math.floor(
        (new Date(exp).getTime() - now.getTime()) / (1000 * 86400)
      ),
    }))
    .filter((x) => x.dte > 0 && x.dte <= windowDays + 7)
    .sort((a, b) => a.dte - b.dte)[0];

  if (!targetExpiry) return [];

  // Filter to target expiry and strike range
  const filtered = puts
    .filter((c) => (c.date ?? c.expiration) === targetExpiry.exp)
    .filter((c) => {
      const s = typeof c.strike === "string" ? parseFloat(c.strike) : c.strike;
      return s >= mstrPrice * 0.8 && s <= mstrPrice * 1.2;
    })
    .sort((a, b) => {
      const sa = typeof a.strike === "string" ? parseFloat(a.strike) : a.strike;
      const sb = typeof b.strike === "string" ? parseFloat(b.strike) : b.strike;
      return sa - sb;
    });

  // Find ATM strike
  let atmStrike = 0;
  let minDiff = Infinity;
  for (const c of filtered) {
    const s = typeof c.strike === "string" ? parseFloat(c.strike) : c.strike;
    const diff = Math.abs(s - mstrPrice);
    if (diff < minDiff) {
      minDiff = diff;
      atmStrike = s;
    }
  }

  // Take ATM ± 5
  const atmIdx = filtered.findIndex((c) => {
    const s = typeof c.strike === "string" ? parseFloat(c.strike) : c.strike;
    return s === atmStrike;
  });
  const start = Math.max(0, atmIdx - 5);
  const end = Math.min(filtered.length, atmIdx + 6);
  const slice = filtered.slice(start, end);

  return slice.map((c) => {
    const strike = typeof c.strike === "string" ? parseFloat(c.strike) : c.strike;
    const bid = typeof c.bid === "string" ? parseFloat(c.bid) : c.bid;
    const ask = typeof c.ask === "string" ? parseFloat(c.ask) : c.ask;
    const iv_raw = c.impliedVolatility ?? c.implied_volatility;
    const iv = typeof iv_raw === "string" ? parseFloat(iv_raw) * 100 : (iv_raw ?? 0) < 1 ? (iv_raw ?? 0) * 100 : (iv_raw ?? 0);
    const delta = typeof c.delta === "string" ? parseFloat(c.delta) : c.delta;
    const theta = c.theta ? (typeof c.theta === "string" ? parseFloat(c.theta) : c.theta) : undefined;
    const oi = typeof (c.open_interest ?? c.openInterest) === "string"
      ? parseInt(c.open_interest as string)
      : (c.openInterest ?? parseInt(c.open_interest as string) ?? 0);
    const vol = typeof c.volume === "string" ? parseInt(c.volume) : c.volume;

    return {
      strike,
      bid,
      ask,
      mid: (bid + ask) / 2,
      iv,
      delta,
      theta,
      oi: oi || 0,
      volume: vol || 0,
      dte: targetExpiry.dte,
      is_atm: strike === atmStrike,
    };
  });
}

/** Parse Deribit instrument name: BTC-28MAR26-70000-P */
export function parseDeribitName(name: string) {
  const parts = name.split("-");
  return {
    expiry: parts[1],
    strike: parseInt(parts[2]),
    type: parts[3] === "P" ? ("put" as const) : ("call" as const),
  };
}

/** Filter Deribit BTC puts */
export function filterDeribitChain(
  instruments: Array<{
    instrument_name: string;
    bid_price: number;
    ask_price: number;
    mid_price: number;
    mark_iv: number;
    open_interest: number;
    volume: number;
    delta: number;
    underlying_price: number;
  }>,
  btcSpot: number,
  expiryWindow: "30d" | "60d" | "90d"
): OptionRow[] {
  const now = new Date();
  const maxDte = { "30d": 35, "60d": 65, "90d": 100 }[expiryWindow];
  const minDte = { "30d": 5, "60d": 36, "90d": 66 }[expiryWindow];

  // Parse and filter puts
  const puts = instruments
    .map((i) => ({ ...i, parsed: parseDeribitName(i.instrument_name) }))
    .filter((i) => i.parsed.type === "put");

  // Get unique expiries within window
  const months: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };

  function parseExpiry(s: string): Date {
    const day = s.slice(0, 2);
    const mon = months[s.slice(2, 5)] ?? "01";
    const yr = "20" + s.slice(5, 7);
    return new Date(`${yr}-${mon}-${day}`);
  }

  const expiries = [...new Set(puts.map((p) => p.parsed.expiry))];
  const target = expiries
    .map((e) => ({
      e,
      dte: Math.floor((parseExpiry(e).getTime() - now.getTime()) / 86400000),
    }))
    .filter((x) => x.dte >= minDte && x.dte <= maxDte)
    .sort((a, b) => a.dte - b.dte)[0];

  if (!target) return [];

  const filtered = puts
    .filter((p) => p.parsed.expiry === target.e)
    .filter((p) => p.parsed.strike >= btcSpot * 0.75 && p.parsed.strike <= btcSpot * 1.15)
    .sort((a, b) => a.parsed.strike - b.parsed.strike);

  // Find ATM
  let atmStrike = 0;
  let minDiff = Infinity;
  for (const p of filtered) {
    const diff = Math.abs(p.parsed.strike - btcSpot);
    if (diff < minDiff) {
      minDiff = diff;
      atmStrike = p.parsed.strike;
    }
  }

  return filtered.map((p) => ({
    strike: p.parsed.strike,
    bid: p.bid_price * btcSpot,
    ask: p.ask_price * btcSpot,
    mid: p.mid_price * btcSpot,
    mid_btc: p.mid_price,
    iv: p.mark_iv,
    delta: p.delta,
    oi: p.open_interest,
    volume: p.volume,
    instrument_name: p.instrument_name,
    dte: target.dte,
    is_atm: p.parsed.strike === atmStrike,
  }));
}
