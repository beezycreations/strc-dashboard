"use client";

import { useState, useMemo } from "react";
import { useSnapshot, useOptions } from "@/src/lib/hooks/use-api";
import { KpiCard, RiskScoreGauge } from "@/src/components/ui";
import SignalPanel, { deriveSignal } from "@/src/components/ui/SignalPanel";
import Badge from "@/src/components/ui/Badge";
import { fmtPct, fmtBps } from "@/src/lib/utils/format";
import { computeHedgeOutputs, type HedgeStrategy, type HedgeAsset } from "@/src/lib/calculators/hedge-calculator";
import { calcComponentScores, calcComposite } from "@/src/lib/calculators/risk-score";
import type { OptionRow } from "@/src/lib/options/filter";

type Mode = "long" | "hedge";

export default function PositionModesView() {
  const [mode, setMode] = useState<Mode>("long");
  const { data: snap } = useSnapshot();

  if (!snap) return <div className="skeleton" style={{ height: 400 }} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 4 }}>
        {([["long", "Mode 1 · Long"], ["hedge", "Mode 2 · Options Hedge"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            style={{
              padding: "8px 18px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
              background: mode === id ? "var(--t1)" : "var(--bg)", color: mode === id ? "#fff" : "var(--t2)",
              fontFamily: "var(--font-ui)", fontSize: "var(--text-base)", fontWeight: 600, cursor: "pointer",
            }}
          >{label}</button>
        ))}
      </div>

      {mode === "long" ? <LongMode snap={snap} /> : <HedgeMode snap={snap} />}
    </div>
  );
}

function LongMode({ snap }: { snap: Record<string, number & string & boolean> }) {
  const s = snap;
  const [positionSize, setPositionSize] = useState(1_000_000);
  const signal = deriveSignal(s.strc_price, s.btc_coverage_ratio);

  const annualRate = s.strc_rate_pct / 100;
  const monthlyIncome = annualRate * positionSize / 12;
  const yearlyIncome = annualRate * positionSize;
  const monthsElapsed = new Date().getMonth(); // 0-indexed = months completed
  const ytdIncome = monthlyIncome * monthsElapsed;
  const sharesAtPar = Math.floor(positionSize / 100); // STRC par = $100
  const sharesAtMarket = s.strc_price > 0 ? Math.floor(positionSize / s.strc_price) : 0;
  const currentValue = sharesAtMarket * s.strc_price;
  const yieldOnCost = s.strc_price > 0 ? (annualRate * 100 / s.strc_price) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--card-gap)" }}>
      {/* Position Size Input */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
          <label style={{ fontSize: "var(--text-xs)", color: "var(--t3)", flex: "0 0 220px" }}>
            Position Size
            <input
              type="text"
              value={`$${positionSize.toLocaleString()}`}
              onChange={(e) => { const v = parseInt(e.target.value.replace(/[^0-9]/g, "")); if (!isNaN(v)) setPositionSize(Math.max(10000, v)); }}
              className="mono"
              style={{ display: "block", width: "100%", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "var(--r-xs)", fontSize: "var(--text-md)", fontWeight: 600, marginTop: 4, background: "var(--surface-2)" }}
            />
          </label>
          <div style={{ display: "flex", gap: 4, paddingBottom: 2 }}>
            {[100_000, 500_000, 1_000_000, 5_000_000, 10_000_000].map((preset) => (
              <button
                key={preset}
                onClick={() => setPositionSize(preset)}
                style={{
                  padding: "5px 10px", borderRadius: "var(--r-xs)", border: "1px solid var(--border)",
                  background: positionSize === preset ? "var(--t1)" : "var(--bg)",
                  color: positionSize === preset ? "#fff" : "var(--t2)",
                  fontSize: "var(--text-xs)", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {preset >= 1_000_000 ? `$${preset / 1_000_000}M` : `$${preset / 1_000}K`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2col">
        {/* Yield & Income */}
        <div className="grid-2col">
          <KpiCard label="Effective Yield" dotColor="var(--accent)" value={fmtPct(s.strc_effective_yield)} />
          <KpiCard label="Par Spread" dotColor="var(--accent)" value={fmtBps(s.strc_par_spread_bps)} deltaType={s.strc_par_spread_bps >= 0 ? "up" : "down"} />
          <KpiCard label="Monthly Income" dotColor="var(--green)" value={`$${monthlyIncome.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} footer={`$${positionSize.toLocaleString()} × ${fmtPct(s.strc_rate_pct)} ÷ 12`} />
          <KpiCard label="YTD Income" dotColor="var(--green)" value={`$${ytdIncome.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} footer={`${monthsElapsed} months through ${new Date().toLocaleString("en-US", { month: "short" })}`} />
        </div>
        <SignalPanel currentSignal={signal} strcPrice={s.strc_price} btcCoverage={s.btc_coverage_ratio} />
      </div>

      {/* Position Details */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 10 }}>Position Details</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <DetailTile label="Shares (at par $100)" value={sharesAtPar.toLocaleString()} />
          <DetailTile label={`Shares (at $${Number(s.strc_price).toFixed(2)})`} value={sharesAtMarket.toLocaleString()} />
          <DetailTile label="Current Market Value" value={`$${currentValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
          <DetailTile label="Yield on Cost" value={fmtPct(yieldOnCost)} />
          <DetailTile label="Annual Income" value={`$${yearlyIncome.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
          <DetailTile label="Daily Income" value={`$${(yearlyIncome / 365).toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
        </div>
      </div>
    </div>
  );
}

function HedgeMode({ snap }: { snap: Record<string, number & string & boolean> }) {
  const s = snap;
  const [positionSize, setPositionSize] = useState(1_000_000);
  const [asset, setAsset] = useState<HedgeAsset>("mstr");
  const [strategy, setStrategy] = useState<HedgeStrategy>("atm_put");
  const [hedgeRatio, setHedgeRatio] = useState(22);
  const [expiry, setExpiry] = useState<"30d" | "60d" | "90d">("30d");
  const [selectedRow, setSelectedRow] = useState<OptionRow | null>(null);

  const { data: optionsData, isLoading: optionsLoading } = useOptions(asset, expiry);
  const chain: OptionRow[] = optionsData?.chain ?? [];

  // Auto-select ATM row
  const atmRow = useMemo(() => chain.find((r) => r.is_atm) ?? chain[Math.floor(chain.length / 2)] ?? null, [chain]);
  const activeRow = selectedRow ?? atmRow;

  const outputs = useMemo(() => {
    if (!activeRow) return null;
    return computeHedgeOutputs({
      positionSize, asset, strategy, hedgeRatioPct: hedgeRatio,
      selectedPutMid: activeRow.mid, selectedPutDelta: activeRow.delta,
      selectedPutStrike: activeRow.strike, selectedDte: activeRow.dte,
      shortPutMid: 0, callMid: 0,
      mstrPrice: s.mstr_price || 390, btcSpot: s.btc_price || 105000,
      strcEffectiveYield: s.strc_effective_yield || 11.2, sofr1m: s.sofr_1m_pct || 4.3,
    });
  }, [positionSize, asset, strategy, hedgeRatio, activeRow, s]);

  // Risk score
  const riskScores = useMemo(() => {
    if (!outputs || !activeRow) return null;
    const inputs = {
      btc_coverage_ratio: s.btc_coverage_ratio || 4.3,
      net_yield_pct: outputs.netHedgedYield,
      sofr_pct: s.sofr_1m_pct || 4.3,
      strike_otm_pct: activeRow ? Math.abs((activeRow.strike - (asset === "mstr" ? (s.mstr_price || 390) : (s.btc_price || 105000))) / (asset === "mstr" ? (s.mstr_price || 390) : (s.btc_price || 105000)) * 100) : 0,
      iv_percentile: 60,
      days_to_announcement: s.days_to_announcement || 18,
    };
    const components = calcComponentScores(inputs);
    return { composite: calcComposite(components), components };
  }, [outputs, activeRow, asset, s]);

  return (
    <div>
      {/* Source & delay banner */}
      <div style={{ padding: "8px 12px", background: asset === "btc" ? "var(--green-l)" : "var(--amber-l)", borderRadius: "var(--r-xs)", fontSize: "var(--text-sm)", color: asset === "btc" ? "var(--green)" : "var(--amber)", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>
          {asset === "btc"
            ? "BTC options via Deribit — real-time pricing. 1 contract = 1 BTC."
            : "MSTR options via FMP — delayed ~15 min. Confirm with broker before execution."
          }
        </span>
        {optionsData && (
          <span style={{ fontSize: "var(--text-xs)", opacity: 0.8 }}>
            Spot: ${optionsData.spot_price?.toLocaleString() ?? "—"} · Source: {optionsData.source ?? "—"} · {optionsData.delayed_minutes === 0 ? "Live" : `${optionsData.delayed_minutes}m delay`}
          </span>
        )}
      </div>

      <div className="grid-2-3">
        {/* Calculator Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Inputs */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 10 }}>INPUTS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>
                Position Size
                <input
                  type="text"
                  value={`$${positionSize.toLocaleString()}`}
                  onChange={(e) => { const v = parseInt(e.target.value.replace(/[^0-9]/g, "")); if (!isNaN(v)) setPositionSize(Math.max(10000, v)); }}
                  className="mono"
                  style={{ display: "block", width: "100%", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "var(--r-xs)", fontSize: "var(--text-md)", fontWeight: 600, marginTop: 4, background: "var(--surface-2)" }}
                />
              </label>

              <div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginBottom: 4 }}>Asset</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["mstr", "btc"] as const).map((a) => (
                    <button key={a} onClick={() => { setAsset(a); setSelectedRow(null); setHedgeRatio(a === "mstr" ? 22 : 18); }}
                      style={{ flex: 1, padding: "6px", borderRadius: "var(--r-xs)", border: "1px solid var(--border)", background: asset === a ? "var(--t1)" : "var(--bg)", color: asset === a ? "#fff" : "var(--t2)", fontWeight: 600, fontSize: "var(--text-sm)", cursor: "pointer" }}>
                      {a.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: "var(--t3)", marginTop: 2 }}>Hedge ratio auto-set from 30d beta. Override below.</div>
              </div>

              <div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginBottom: 4 }}>Strategy</div>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as HedgeStrategy)}
                  style={{ width: "100%", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "var(--r-xs)", fontSize: "var(--text-sm)", background: "var(--surface-2)" }}
                >
                  <option value="atm_put">ATM Put</option>
                  <option value="put_spread">Put Spread</option>
                  <option value="collar">Collar</option>
                </select>
              </div>

              <label style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>
                Hedge Ratio (%)
                <input type="number" value={hedgeRatio} onChange={(e) => setHedgeRatio(Math.max(1, Math.min(100, parseInt(e.target.value) || 0)))}
                  className="mono" style={{ display: "block", width: "100%", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "var(--r-xs)", fontSize: "var(--text-md)", marginTop: 4, background: "var(--surface-2)" }}
                />
              </label>
            </div>
          </div>

          {/* Outputs */}
          {outputs && (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 10 }}>OUTPUTS</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <OutputTile label="Hedge Notional" value={`$${outputs.hedgeNotional.toLocaleString()}`} />
                <OutputTile label="Contracts" value={`${outputs.contracts}`} />
                <OutputTile label="Premium (upfront)" value={`$${outputs.premiumNet.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
                <OutputTile label="Annualized Cost" value={fmtPct(outputs.annCostPct)} color="var(--violet)" />
                <OutputTile label="Net Hedged Yield" value={fmtPct(outputs.netHedgedYield)} color="var(--accent)" highlighted />
                <OutputTile label="vs SOFR" value={fmtBps(outputs.spreadVsSofrBps)} color={outputs.spreadVsSofrBps > 250 ? "var(--green)" : outputs.spreadVsSofrBps > 150 ? "var(--amber)" : "var(--red)"} />
                <OutputTile label="Monthly Income" value={`$${outputs.monthlyIncomeNet.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
                <OutputTile label="Break-even Rate" value={fmtPct(outputs.breakevenStrcRate)} />
              </div>
            </div>
          )}

          {/* Risk Score */}
          {riskScores && (
            <RiskScoreGauge composite={riskScores.composite} components={riskScores.components} />
          )}
        </div>

        {/* Options Chain */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{asset === "mstr" ? "MSTR Puts" : "BTC Puts · Deribit"}</span>
              <Badge variant="neutral">{optionsData?.source ?? "—"}</Badge>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["30d", "60d", "90d"] as const).map((e) => (
                <button key={e} onClick={() => { setExpiry(e); setSelectedRow(null); }}
                  style={{ padding: "4px 10px", borderRadius: "var(--r-xs)", border: "1px solid var(--border)", background: expiry === e ? "var(--t1)" : "var(--bg)", color: expiry === e ? "#fff" : "var(--t2)", fontSize: "var(--text-xs)", fontWeight: 500, cursor: "pointer" }}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          {optionsLoading ? (
            <div>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 32, marginBottom: 4 }} />)}</div>
          ) : chain.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--t3)", fontSize: "var(--text-sm)" }}>No options data available. Configure API keys to load live chain.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)" }}>
                    {["Strike", "Bid", "Ask", "Mid", "IV", "Delta", "OI", "Vol"].map((h) => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "right", color: "var(--t3)", fontWeight: 500, fontSize: "var(--text-xs)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chain.map((row: OptionRow) => {
                    const isSelected = activeRow?.strike === row.strike;
                    const isAtm = row.is_atm;
                    const lowOi = row.oi < 100;
                    return (
                      <tr
                        key={row.strike}
                        onClick={() => !lowOi && setSelectedRow(row)}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: isSelected ? "var(--accent-l)" : isAtm ? "var(--violet-l)" : "transparent",
                          cursor: lowOi ? "not-allowed" : "pointer",
                          opacity: lowOi ? 0.45 : 1,
                        }}
                        title={lowOi ? "Low liquidity — OI < 100" : `Select $${row.strike} strike`}
                      >
                        <td className="mono" style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>
                          {isSelected && "● "}{isAtm && !isSelected && <Badge variant="violet">ATM</Badge>} ${row.strike}
                        </td>
                        <td className="mono" style={{ padding: "6px 8px", textAlign: "right" }}>${(row.bid ?? 0).toFixed(2)}</td>
                        <td className="mono" style={{ padding: "6px 8px", textAlign: "right" }}>${(row.ask ?? 0).toFixed(2)}</td>
                        <td className="mono" style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>${(row.mid ?? 0).toFixed(2)}</td>
                        <td className="mono" style={{ padding: "6px 8px", textAlign: "right", color: (row.iv ?? 0) < 80 ? "var(--green)" : (row.iv ?? 0) < 100 ? "var(--amber)" : "var(--red)" }}>{fmtPct(row.iv ?? 0, 1)}</td>
                        <td className="mono" style={{ padding: "6px 8px", textAlign: "right", color: "var(--violet)" }}>{(row.delta ?? 0).toFixed(2)}</td>
                        <td className="mono" style={{ padding: "6px 8px", textAlign: "right", color: (row.oi ?? 0) < 100 ? "var(--t3)" : "var(--t1)" }}>{(row.oi ?? 0).toLocaleString()}</td>
                        <td className="mono" style={{ padding: "6px 8px", textAlign: "right" }}>{(row.volume ?? 0).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {asset === "btc" && (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 8 }}>
              Deribit: 1 contract = 1 BTC. Prices quoted in BTC, converted to USD using live spot.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OutputTile({ label, value, color, highlighted }: { label: string; value: string; color?: string; highlighted?: boolean }) {
  return (
    <div style={{ padding: "6px 8px", borderRadius: "var(--r-xs)", background: highlighted ? "var(--accent-l)" : "var(--surface)" }}>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>{label}</div>
      <div className="mono" style={{ fontSize: "var(--text-md)", fontWeight: 600, color: color || "var(--t1)" }}>{value}</div>
    </div>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t1)" }}>{value}</div>
    </div>
  );
}
