// Number formatting utilities for the dashboard

export function fmtUsd(n: number, compact = false): string {
  if (compact) {
    if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  }
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(n: number, decimals = 2): string {
  return `${n.toFixed(decimals)}%`;
}

export function fmtBps(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${Math.round(n)}bps`;
}

export function fmtInt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function fmtShares(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

export function fmtMultiple(n: number): string {
  return `${n.toFixed(2)}×`;
}

export function fmtMonths(n: number): string {
  if (n > 36) return '> 36 months';
  return `${n.toFixed(1)} months`;
}
