"use client";

import { useState } from "react";
import { useVolumeAtm } from "@/src/lib/hooks/use-api";
import Badge from "@/src/components/ui/Badge";

export default function VolumeATMTracker() {
  const { data, isLoading } = useVolumeAtm();
  const [range, setRange] = useState<"1m" | "3m" | "all">("3m");

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
  const filteredVolume = (data.volume_history ?? []).filter(
    (v: { date: string }) => v.date >= cutoffStr
  );

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>Volume + ATM Issuance Tracker</div>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 16 }}>
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
        {/* Simple volume bar chart using CSS */}
        <div style={{ height: 240, position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "flex-end", height: "100%", gap: 1 }}>
            {filteredVolume.map((v: { date: string; strc_volume: number; strc_price: number; mstr_volume: number }) => {
              const maxVol = Math.max(...filteredVolume.map((x: { strc_volume: number }) => x.strc_volume));
              const hPct = maxVol > 0 ? (v.strc_volume / maxVol) * 100 : 0;
              return (
                <div
                  key={v.date}
                  style={{
                    flex: 1,
                    minWidth: 1,
                    height: `${hPct}%`,
                    background: "var(--accent)",
                    opacity: 0.8,
                    borderRadius: "2px 2px 0 0",
                    position: "relative",
                  }}
                  title={`${v.date}: ${v.strc_volume.toLocaleString()} shares`}
                />
              );
            })}
          </div>
          <div style={{ position: "absolute", bottom: 0, left: 0, fontSize: "var(--text-xs)", color: "var(--t3)" }}>
            Volume (shares)
          </div>
        </div>

        {/* ATM Event Log */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t2)" }}>ATM Events</span>
            <Badge variant="neutral">{(data.atm_events ?? []).length}</Badge>
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {(data.atm_events ?? []).slice().reverse().map((evt: { date: string; proceeds_usd: number; shares_issued: number; avg_price: number; is_estimated: boolean }, i: number) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid var(--border)", fontSize: "var(--text-xs)" }}>
                <span style={{ color: "var(--t3)", minWidth: 60 }}>{evt.date}</span>
                <span className="mono" style={{ color: "var(--btc-d)", fontWeight: 600 }}>${(evt.proceeds_usd / 1e6).toFixed(0)}M</span>
                <span className="mono" style={{ color: "var(--t2)" }}>{(evt.shares_issued / 1e6).toFixed(1)}M sh</span>
                {evt.is_estimated && <Badge variant="amber">Est.</Badge>}
              </div>
            ))}
            {(data.atm_events ?? []).length === 0 && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", padding: "8px 0" }}>No ATM events recorded</div>
            )}
          </div>
        </div>
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
