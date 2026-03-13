/**
 * STRC Intelligence Platform — Global Chart Configuration
 * Source: Phase 2, Sections 8.1–8.4
 *
 * Shared defaults for Recharts and Chart.js charts.
 */

/* ── STRC constants ── */
export const STRC_IPO_DATE = "2025-07-29";

/* ── Color tokens (duplicated from CSS for JS access) ── */
export const colors = {
  accent:   "#0052FF",
  accentL:  "#EBF0FF",
  btc:      "#F7931A",
  btcL:     "#FFF4E6",
  btcD:     "#C46E0C",
  green:    "#00A86B",
  greenL:   "#E6F7F1",
  red:      "#FF3B30",
  redL:     "#FFE9E8",
  amber:    "#FF9500",
  amberL:   "#FFF5E6",
  violet:   "#7C3AED",
  violetL:  "#EDE9FE",
  t1:       "#0D0C0A",
  t2:       "#5C5955",
  t3:       "#9B9890",
  surface:  "#FAFAF8",
  surface2: "#F3F1ED",
  grid:     "rgba(0,0,0,0.05)",
  border:   "rgba(0,0,0,0.07)",
} as const;

/* ── Recharts global defaults ── */
export const rechartsDefaults = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 10,
  tickFill: colors.t3,
  gridStroke: colors.grid,
  axisStroke: "transparent",
  tooltipStyle: {
    backgroundColor: colors.t1,
    color: "#FFFFFF",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 11,
    fontFamily: "'DM Mono', monospace",
    border: "none",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  },
  animationDuration: 0, // No re-animation on data updates
} as const;

/* ── Chart.js global defaults (for Volume+ATM tracker tri-axis chart) ── */
export const chartJsDefaults = {
  font: {
    family: "'DM Mono', monospace",
    size: 10,
  },
  color: colors.t3,
  borderColor: colors.grid,
  plugins: {
    tooltip: {
      backgroundColor: colors.t1,
      bodyColor: "#FFFFFF",
      titleColor: "#FFFFFF",
      cornerRadius: 8,
      padding: 10,
      bodyFont: { family: "'DM Mono', monospace", size: 11 },
      titleFont: { family: "'DM Mono', monospace", size: 11 },
    },
    legend: {
      display: false, // Use custom <ChartLegend> component instead
    },
  },
  animation: false as const,
  responsive: true,
  maintainAspectRatio: false,
} as const;

/* ── Number formatting helpers for chart labels ── */
export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtPct(n: number, decimals = 2): string {
  return `${n.toFixed(decimals)}%`;
}

export function fmtBps(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(0)}bps`;
}

export function fmtShares(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

export function fmtPrice(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
