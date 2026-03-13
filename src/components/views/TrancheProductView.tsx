"use client";

import { useTranche, useSnapshot } from "@/src/lib/hooks/use-api";
import Badge from "@/src/components/ui/Badge";
import { StatRow, CoverageMatrix, TrancheSensitivityTable } from "@/src/components/ui";
import { fmtPct } from "@/src/lib/utils/format";
import { TRANCHE_CONFIGS } from "@/src/lib/calculators/tranche-metrics";


export default function TrancheProductView() {
  const { data: tranche, isLoading } = useTranche();
  const { data: snap } = useSnapshot();

  if (isLoading || !tranche) {
    return <div className="skeleton" style={{ height: 400 }} />;
  }

  const t = tranche;
  const configs = t.configs ?? [];
  const strcRate = t.strc_rate_pct ?? snap?.strc_rate_pct ?? 11.25;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Pool NAV */}
      <div className="card">
        <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Pool NAV & Per-Unit Valuation</div>
        <StatRow cells={[
          { label: "Pool NAV", value: `$${((t.pool_nav ?? 10_000_000) / 1e6).toFixed(2)}M`, color: "var(--accent)" },
          { label: "Senior NAV/Unit", value: `$${(configs[0]?.senior_nav_per_unit ?? 100).toFixed(2)}` },
          { label: "Junior NAV/Unit (A)", value: `$${(configs[0]?.junior_nav_per_unit ?? 100).toFixed(2)}` },
          { label: "STRC Rate", value: fmtPct(strcRate), color: "var(--violet)" },
        ]} />
      </div>

      {/* 3 Config Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--card-gap)" }}>
        {configs.map((cfg: { name: string; senior_pct: number; junior_pct: number; junior_yield_pct: number; scr: number; est: number; rfb: number; floor_pct: number; scr_status: string; est_status: string; rfb_status: string }) => {
          const borderColor = cfg.name === "A" ? "var(--green)" : cfg.name === "B" ? "var(--accent)" : "var(--amber)";
          return (
            <div key={cfg.name} className="card" style={{ borderTop: `3px solid ${borderColor}`, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>Config {cfg.name}</span>
                <Badge variant={cfg.name === "A" ? "green" : cfg.name === "B" ? "blue" : "amber"}>
                  {cfg.senior_pct * 100}/{cfg.junior_pct * 100}
                </Badge>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>Senior Allocation</div>
                  <div className="mono" style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{fmtPct(cfg.senior_pct * 100, 0)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>Junior Yield</div>
                  <div className="mono" style={{ fontSize: "var(--text-md)", fontWeight: 600, color: cfg.junior_yield_pct < 0 ? "var(--red)" : "var(--green)" }}>
                    {fmtPct(cfg.junior_yield_pct)}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <MiniStat label="SCR" value={`${cfg.scr.toFixed(2)}×`} status={cfg.scr_status} />
                <MiniStat label="Floor" value={fmtPct(cfg.floor_pct)} status="pass" />
                <MiniStat label="RFB" value={fmtPct(cfg.rfb)} status={cfg.rfb_status} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Excess Spread Chart + Coverage Matrix / Sensitivity Table */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--card-gap)" }}>
        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Excess Spread History</div>
          <div style={{ height: 220 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t3)", fontSize: "var(--text-sm)" }}>
              Excess spread history builds over time
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--card-gap)" }}>
          <div className="card">
            <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Coverage Test Matrix</div>
            <CoverageMatrix
              strcRate={strcRate}
              seniorTargetRate={7.5}
              configs={TRANCHE_CONFIGS}
            />
          </div>

          <div className="card">
            <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Junior Yield Sensitivity</div>
            <TrancheSensitivityTable
              configs={TRANCHE_CONFIGS}
              seniorTargetRate={7.5}
              rateScenarios={[7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0, 10.5, 11.0, 11.25, 11.5, 12.0, 13.0, 14.0]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, status }: { label: string; value: string; status: string }) {
  const color = status === "pass" ? "var(--green)" : status === "watch" ? "var(--amber)" : "var(--red)";
  return (
    <span className="mono" style={{ padding: "2px 8px", borderRadius: "var(--r-xs)", background: `color-mix(in srgb, ${color} 10%, transparent)`, color, fontSize: "var(--text-xs)", fontWeight: 600 }}>
      {label}: {value}
    </span>
  );
}
