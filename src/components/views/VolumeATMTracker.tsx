"use client";

import { useState } from "react";
import { useVolumeAtm } from "@/src/lib/hooks/use-api";
import Badge from "@/src/components/ui/Badge";

interface VolumeDay {
  date: string;
  strc_volume: number;
  strc_price: number;
  mstr_volume: number;
}

export default function VolumeATMTracker() {
  const { data, isLoading } = useVolumeAtm();
  const [range, setRange] = useState<"1m" | "3m" | "all">("3m");
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);

  if (isLoading || !data) {
    return <div className="card"><div className="skeleton" style={{ height: 320 }} /></div>;
  }

  const kpi = data.kpi ?? {};

  // Filter volume history by range
  const now = new Date();
  const cutoff =
    range === "1m"
      ? new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      : range === "3m"
        ? new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
        : new Date("2025-07-29");
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filteredVolume: VolumeDay[] = (data.volume_history ?? []).filter(
    (v: VolumeDay) => v.date >= cutoffStr
  );

  const maxVol = filteredVolume.length > 0
    ? Math.max(...filteredVolume.map((x) => x.strc_volume))
    : 1;

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>Volume and ATM Issuance Tracker</div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["1m", "3m", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: "4px 10px",
                borderRadius: "var(--r-xs)",
                border: "1px solid var(--border)",
                background: range === r ? "var(--t1)" : "var(--bg)",
                color: range === r ? "#fff" : "var(--t2)",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {r === "all" ? "All" : r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 16 }}>
        <KpiMini label="Today Volume" value={fmtK(kpi.strc_volume_today ?? 0)} />
        <KpiMini label="20d Avg" value={fmtK(kpi.strc_volume_avg_20d ?? 0)} />
        <KpiMini
          label="Vol / Avg"
          value={`${(kpi.strc_volume_ratio ?? 1).toFixed(2)}×`}
          badge={(kpi.strc_volume_ratio ?? 1) >= 3 ? "red" : (kpi.strc_volume_ratio ?? 1) >= 2 ? "amber" : undefined}
        />
        <KpiMini label="ATM Deployed" value={`$${((kpi.strc_atm_deployed_usd ?? 0) / 1e9).toFixed(2)}B`} />
        <KpiMini
          label="Remaining"
          value={`$${((kpi.strc_atm_remaining_usd ?? 0) / 1e9).toFixed(2)}B`}
          badge={(kpi.strc_atm_remaining_usd ?? 0) < 200_000_000 ? "red" : (kpi.strc_atm_remaining_usd ?? 0) < 500_000_000 ? "amber" : undefined}
        />
        <KpiMini label="90d Pace" value={`$${((kpi.strc_atm_pace_90d_monthly_usd ?? 0) / 1e6).toFixed(0)}M/mo`} />
      </div>

      {/* Chart + Event Log */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--card-gap)" }}>
        {/* Interactive volume bar chart */}
        <div style={{ position: "relative" }}>
          <div style={{ height: 240, display: "flex", alignItems: "flex-end", gap: 1 }}
            onMouseLeave={() => setHoveredBar(null)}
          >
            {filteredVolume.map((v, i) => {
              const hPct = maxVol > 0 ? (v.strc_volume / maxVol) * 100 : 0;
              const isHovered = hoveredBar === i;
              return (
                <div
                  key={v.date}
                  onMouseEnter={() => setHoveredBar(i)}
                  style={{
                    flex: 1,
                    minWidth: 2,
                    height: `${hPct}%`,
                    background: isHovered ? "var(--violet)" : "var(--accent)",
                    opacity: hoveredBar !== null ? (isHovered ? 1 : 0.5) : 0.8,
                    borderRadius: "2px 2px 0 0",
                    cursor: "crosshair",
                    transition: "opacity 0.1s ease",
                  }}
                />
              );
            })}
          </div>

          {/* Hover tooltip */}
          {hoveredBar !== null && filteredVolume[hoveredBar] && (() => {
            const v = filteredVolume[hoveredBar];
            const leftPct = ((hoveredBar + 0.5) / filteredVolume.length) * 100;
            const clampedLeft = Math.max(15, Math.min(85, leftPct));
            const d = new Date(v.date + "T00:00:00");
            const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            return (
              <div style={{
                position: "absolute",
                bottom: 248,
                left: `${clampedLeft}%`,
                transform: "translateX(-50%)",
                background: "var(--t1)",
                color: "#fff",
                padding: "8px 12px",
                borderRadius: "var(--r-sm)",
                fontSize: "var(--text-xs)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                zIndex: 10,
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>{dateLabel}</div>
                <div className="mono" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span>STRC Vol: {v.strc_volume.toLocaleString()} shares</span>
                  <span>STRC Price: ${v.strc_price.toFixed(2)}</span>
                  <span>MSTR Vol: {v.mstr_volume.toLocaleString()}</span>
                </div>
              </div>
            );
          })()}

          {/* X-axis date labels */}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4 }}>
            {filteredVolume.length > 0 && (() => {
              const step = Math.max(1, Math.floor(filteredVolume.length / 6));
              const indices = [0];
              for (let i = step; i < filteredVolume.length - 1; i += step) indices.push(i);
              indices.push(filteredVolume.length - 1);
              // Deduplicate last if close
              const unique = [...new Set(indices)];
              return unique.map((idx) => {
                const d = new Date(filteredVolume[idx].date + "T00:00:00");
                return (
                  <span key={idx} style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>
                    {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                );
              });
            })()}
          </div>
        </div>

        {/* ATM Event Log */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t2)" }}>ATM Events</span>
            <Badge variant="neutral">{(data.atm_events ?? []).length}</Badge>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {(data.atm_events ?? []).slice().reverse().map((evt: { date: string; proceeds_usd: number; shares_issued: number; avg_price: number; is_estimated: boolean }, i: number) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: "var(--text-xs)", alignItems: "center" }}>
                <span style={{ color: "var(--t3)", minWidth: 68 }}>{evt.date}</span>
                <span className="mono" style={{ color: "var(--btc-d)", fontWeight: 600, minWidth: 42 }}>${(evt.proceeds_usd / 1e6).toFixed(0)}M</span>
                <span className="mono" style={{ color: "var(--t2)", minWidth: 50 }}>{(evt.shares_issued / 1e6).toFixed(1)}M sh</span>
                <span className="mono" style={{ color: "var(--t3)", minWidth: 48 }}>@${evt.avg_price.toFixed(2)}</span>
                {evt.is_estimated ? (
                  <Badge variant="amber">Est.</Badge>
                ) : (
                  <Badge variant="green">8-K</Badge>
                )}
              </div>
            ))}
            {(data.atm_events ?? []).length === 0 && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", padding: "8px 0" }}>No ATM events recorded</div>
            )}
          </div>
        </div>
      </div>

      {/* Methodology section */}
      <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <button
          onClick={() => setShowMethodology(!showMethodology)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: 0,
            fontSize: "var(--text-xs)",
            color: "var(--t3)",
            fontWeight: 500,
          }}
        >
          <span style={{ transform: showMethodology ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease", display: "inline-block" }}>
            ▶
          </span>
          ATM Estimation Methodology
        </button>
        {showMethodology && (
          <div style={{ marginTop: 10, fontSize: "var(--text-xs)", color: "var(--t3)", lineHeight: 1.6, maxWidth: 720 }}>
            <p style={{ marginBottom: 8 }}>
              <strong style={{ color: "var(--t2)" }}>Confirmed events</strong> (labeled <Badge variant="green">8-K</Badge>) are sourced directly from SEC EDGAR 8-K filings
              or official press releases, which report exact proceeds, shares issued, and weighted average price.
            </p>
            <p style={{ marginBottom: 8 }}>
              <strong style={{ color: "var(--t2)" }}>Estimated events</strong> (labeled <Badge variant="amber">Est.</Badge>) are inferred on days when STRC trading volume
              significantly exceeds its 20-day moving average without a corresponding market catalyst. The estimation uses a calibrated
              participation rate — the historical ratio of ATM shares issued to total daily volume — derived from confirmed 8-K filings.
            </p>
            <p style={{ marginBottom: 8 }}>
              <strong style={{ color: "var(--t2)" }}>Participation rate</strong>: Currently calibrated
              at {((kpi.participation_rate_current ?? 0.032) * 100).toFixed(1)}% (range: {((kpi.participation_rate_range?.[0] ?? 0.018) * 100).toFixed(1)}%–{((kpi.participation_rate_range?.[1] ?? 0.045) * 100).toFixed(1)}%).
              This means for every 1M shares traded, approximately {((kpi.participation_rate_current ?? 0.032) * 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })} shares
              are estimated as ATM issuance.
            </p>
            <p style={{ margin: 0 }}>
              <strong style={{ color: "var(--t2)" }}>Estimated proceeds</strong> are calculated as: (daily volume × participation rate × VWAP).
              Estimates are retroactively replaced with confirmed figures when the corresponding 8-K is filed, typically within 2–5 business days.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiMini({ label, value, badge }: { label: string; value: string; badge?: "amber" | "red" }) {
  return (
    <div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span className="mono" style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>{value}</span>
        {badge && <Badge variant={badge}>{badge === "red" ? "!" : "~"}</Badge>}
      </div>
    </div>
  );
}

function fmtK(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}
