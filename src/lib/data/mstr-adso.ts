/**
 * MSTR Average Diluted Shares Outstanding (ADSO) timeline.
 * Used to compute historical mNAV = (MSTR price × ADSO) / (BTC holdings × BTC price).
 *
 * Post 10:1 split (Aug 7, 2024). Pre-split values adjusted to post-split equivalent.
 * Pre-2025 values are quarterly estimates from SEC filings (10-K, 10-Q).
 * 2025+ values are from Strategy's confirmed purchase reports.
 *
 * Units: thousands of shares.
 */

export const MSTR_ADSO_TIMELINE: Array<{ date: string; adso: number }> = [
  // --- Quarterly estimates (pre-split × 10) ---
  { date: "2020-08-10", adso: 99_400 },
  { date: "2020-12-31", adso: 100_500 },
  { date: "2021-03-31", adso: 102_000 },
  { date: "2021-06-30", adso: 111_000 },
  { date: "2021-09-30", adso: 111_400 },
  { date: "2021-12-31", adso: 115_000 },
  { date: "2022-03-31", adso: 116_000 },
  { date: "2022-06-30", adso: 116_400 },
  { date: "2022-09-30", adso: 116_600 },
  { date: "2022-12-31", adso: 117_200 },
  { date: "2023-03-31", adso: 120_000 },
  { date: "2023-06-30", adso: 142_000 },
  { date: "2023-09-30", adso: 145_000 },
  { date: "2023-12-31", adso: 160_000 },
  { date: "2024-03-31", adso: 175_000 },
  { date: "2024-06-30", adso: 197_000 },
  { date: "2024-09-30", adso: 226_000 },
  { date: "2024-11-30", adso: 260_000 },
  { date: "2024-12-31", adso: 280_000 },
  // --- From Strategy purchase reports (exact) ---
  { date: "2025-01-06", adso: 281_735 },
  { date: "2025-01-13", adso: 282_418 },
  { date: "2025-01-21", adso: 285_425 },
  { date: "2025-01-27", adso: 288_254 },
  { date: "2025-02-10", adso: 289_439 },
  { date: "2025-02-24", adso: 294_063 },
  { date: "2025-03-17", adso: 294_038 },
  { date: "2025-03-24", adso: 296_002 },
  { date: "2025-03-31", adso: 299_674 },
  { date: "2025-04-14", adso: 300_590 },
  { date: "2025-04-21", adso: 302_353 },
  { date: "2025-04-28", adso: 306_417 },
  { date: "2025-05-05", adso: 306_828 },
  { date: "2025-05-12", adso: 310_078 },
  { date: "2025-05-19", adso: 311_846 },
  { date: "2025-05-26", adso: 312_737 },
  { date: "2025-06-02", adso: 312_778 },
  { date: "2025-06-09", adso: 312_840 },
  { date: "2025-06-16", adso: 312_883 },
  { date: "2025-06-23", adso: 312_903 },
  { date: "2025-06-30", adso: 314_216 },
  { date: "2025-07-14", adso: 314_242 },
  { date: "2025-07-21", adso: 316_705 },
  { date: "2025-07-29", adso: 316_703 },
  { date: "2025-08-11", adso: 316_710 },
  { date: "2025-08-18", adso: 316_727 },
  { date: "2025-08-25", adso: 317_624 },
  { date: "2025-09-02", adso: 318_877 },
  { date: "2025-09-08", adso: 319_486 },
  { date: "2025-09-15", adso: 319_500 },
  { date: "2025-09-22", adso: 319_727 },
  { date: "2025-09-29", adso: 320_094 },
  { date: "2025-10-13", adso: 320_067 },
  { date: "2025-10-20", adso: 320_071 },
  { date: "2025-10-27", adso: 320_089 },
  { date: "2025-11-03", adso: 320_277 },
  { date: "2025-11-10", adso: 320_282 },
  { date: "2025-11-17", adso: 320_283 },
  { date: "2025-12-01", adso: 328_510 },
  { date: "2025-12-08", adso: 333_631 },
  { date: "2025-12-15", adso: 338_444 },
  { date: "2025-12-29", adso: 343_641 },
  { date: "2025-12-31", adso: 344_897 },
  { date: "2026-01-05", adso: 345_632 },
  { date: "2026-01-12", adso: 352_204 },
  { date: "2026-01-20", adso: 362_606 },
  { date: "2026-01-26", adso: 364_173 },
  { date: "2026-02-02", adso: 364_845 },
  { date: "2026-02-09", adso: 365_461 },
  { date: "2026-02-17", adso: 366_114 },
  { date: "2026-02-23", adso: 366_419 },
  { date: "2026-03-02", adso: 368_154 },
  { date: "2026-03-09", adso: 374_506 },
];

/**
 * Get interpolated ADSO (in thousands) for any date.
 * Uses linear interpolation between known data points.
 */
export function getAdso(dateStr: string): number {
  const timeline = MSTR_ADSO_TIMELINE;
  if (dateStr <= timeline[0].date) return timeline[0].adso;
  if (dateStr >= timeline[timeline.length - 1].date) return timeline[timeline.length - 1].adso;

  for (let i = 1; i < timeline.length; i++) {
    if (dateStr <= timeline[i].date) {
      const prev = timeline[i - 1];
      const curr = timeline[i];
      if (dateStr === curr.date) return curr.adso;
      // Linear interpolation
      const prevTs = new Date(prev.date).getTime();
      const currTs = new Date(curr.date).getTime();
      const dateTs = new Date(dateStr).getTime();
      const pct = (dateTs - prevTs) / (currTs - prevTs);
      return Math.round(prev.adso + pct * (curr.adso - prev.adso));
    }
  }
  return timeline[timeline.length - 1].adso;
}
