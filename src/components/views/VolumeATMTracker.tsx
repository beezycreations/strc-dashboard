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

  const d = data;

  // Filter volume history by range
  const now = new Date();
  const cutoff =
    range === "1m"
      ? new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      : range === "3m"
        ? new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
        : new Date("2025-07-29");
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filteredVolume = (d.volume_history ?? []).filter(
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
        <KpiMini label="Today Volume" value={fmtK(d.volume_today)} />
        <KpiMini label="20d Avg" value={fmtK(d.volume_avg_20d)} />
        <KpiMini
          label="Vol / Avg"
          value={`${d.volume_ratio.toFixed(2)}×`}
          badge={d.volume_ratio >= 3 ? "red" : d.volume_ratio >= 2 ? "amber" : undefined}
        />
        <KpiMini label="ATM Deployed" value={`$${(d.atm_deployed / 1e9).toFixed(2)}B`} />
        <KpiMini
          label="Remaining"
          value={`$${(d.atm_remaining / 1e9).toFixed(2)}B`}
          badge={d.atm_remaining < 200_000_000 ? "red" : d.atm_remaining < 500_000_000 ? "amber" : undefined}
        />
        <KpiMini label="90d Pace" value={`$${(d.atm_pace_90d_monthly / 1e6).toFixed(0)}M/mo`} />
      </div>

      {/* Chart + Event Log */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--card-gap)" }}>
        {/* Simple volume bar chart using CSS */}
        <div style={{ height: 240, position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "flex-end", height: "100%", gap: 1 }}>
            {filteredVolume.map((v: { date: string; volume: number; avg_20d: number; vol_ratio: number; has_atm_event: boolean; atm_proceeds_m?: number }) => {
              const maxVol = Math.max(...filteredVolume.map((x: { volume: number }) => x.volume));
              const hPct = maxVol > 0 ? (v.volume / maxVol) * 100 : 0;
              const isHighVol = v.vol_ratio >= 2 && !v.has_atm_event;
              const isAnomalous = v.vol_ratio >= 3 && !v.has_atm_event;
              return (
                <div
                  key={v.date}
                  style={{
                    flex: 1,
                    minWidth: 1,
                    height: `${hPct}%`,
                    background: v.has_atm_event ? "var(--btc)" : "var(--accent)",
                    opacity: 0.8,
                    borderRadius: "2px 2px 0 0",
                    border: isAnomalous ? "1px solid var(--red)" : isHighVol ? "1px solid var(--amber)" : "none",
                    position: "relative",
                  }}
                  title={`${v.date}: ${v.volume.toLocaleString()} shares${v.has_atm_event ? ` | ATM: $${v.atm_proceeds_m}M` : ""}`}
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
            <Badge variant="neutral">{(d.atm_events ?? []).length}</Badge>
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {(d.atm_events ?? []).slice().reverse().map((evt: { date: string; proceeds_usd: number; shares_issued: number; issue_price: number; is_confirmed: boolean }, i: number) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid var(--border)", fontSize: "var(--text-xs)" }}>
                <span style={{ color: "var(--t3)", minWidth: 60 }}>{evt.date}</span>
                <span className="mono" style={{ color: "var(--btc-d)", fontWeight: 600 }}>${(evt.proceeds_usd / 1e6).toFixed(0)}M</span>
                <span className="mono" style={{ color: "var(--t2)" }}>{(evt.shares_issued / 1e6).toFixed(1)}M sh</span>
                {!evt.is_confirmed && <Badge variant="amber">Est.</Badge>}
              </div>
            ))}
            {(d.atm_events ?? []).length === 0 && (
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
