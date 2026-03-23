"use client";

import { useState, useMemo } from "react";
import { usePredictMarkets } from "@/src/lib/hooks/use-api";
import type { PredictMarket } from "@/app/api/data/predict/route";

type Platform = "all" | "polymarket" | "kalshi";
type Category = "all" | "btc" | "mstr" | "strc" | "strive";

const CATEGORY_KEYWORDS: Record<Exclude<Category, "all">, string[]> = {
  btc: ["bitcoin", "btc", "crypto", "kxbtc"],
  mstr: ["mstr", "microstrategy", "strategy"],
  strc: ["strc"],
  strive: ["strive", "sata", "asst", "semler"],
};

function matchCategory(market: PredictMarket, cat: Category): boolean {
  if (cat === "all") return true;
  const keywords = CATEGORY_KEYWORDS[cat];
  const text = (market.title + " " + market.matched_term).toLowerCase();
  return keywords.some((kw) => text.includes(kw));
}

function fmtProb(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function probColor(p: number): string {
  if (p >= 0.75) return "var(--green)";
  if (p >= 0.5) return "var(--amber, #d97706)";
  if (p >= 0.25) return "var(--t2)";
  return "var(--red)";
}

export default function PredictView() {
  const { data, isLoading } = usePredictMarkets();
  const [platform, setPlatform] = useState<Platform>("all");
  const [category, setCategory] = useState<Category>("all");

  const markets: PredictMarket[] = useMemo(() => {
    if (!data?.markets) return [];
    return (data.markets as PredictMarket[]).filter((m) => {
      if (platform !== "all" && m.platform !== platform) return false;
      if (!matchCategory(m, category)) return false;
      return true;
    });
  }, [data, platform, category]);

  const counts = data?.counts as { polymarket: number; kalshi: number; total: number } | undefined;

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="skeleton" style={{ height: 48 }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 72 }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--t1)", margin: 0 }}>
          Prediction Markets
        </h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--t3)", margin: "4px 0 0" }}>
          Live markets from Polymarket and Kalshi related to MSTR, STRC, SATA, and BTC
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {/* Platform filter */}
        <div style={{ display: "flex", gap: 2 }}>
          {(["all", "polymarket", "kalshi"] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              style={{
                padding: "6px 14px",
                borderRadius: "var(--r-sm)",
                border: "1px solid var(--border)",
                background: platform === p ? "var(--t1)" : "var(--bg)",
                color: platform === p ? "#fff" : "var(--t2)",
                fontFamily: "var(--font-ui)",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {p === "all" ? "All Platforms" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div style={{ display: "flex", gap: 2 }}>
          {(["all", "btc", "mstr", "strc", "strive"] as Category[]).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              style={{
                padding: "6px 14px",
                borderRadius: "var(--r-sm)",
                border: "1px solid var(--border)",
                background: category === c ? "var(--t1)" : "var(--bg)",
                color: category === c ? "#fff" : "var(--t2)",
                fontFamily: "var(--font-ui)",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {c === "all" ? "All" : c === "strive" ? "SATA/ASST" : c.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Counts */}
        {counts && (
          <span style={{ fontSize: "var(--text-sm)", color: "var(--t3)", marginLeft: "auto" }}>
            {markets.length} market{markets.length !== 1 ? "s" : ""}
            {counts.total > 0 && (
              <span> ({counts.polymarket} Poly / {counts.kalshi} Kalshi)</span>
            )}
          </span>
        )}
      </div>

      {/* Markets list */}
      {markets.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--t3)" }}>
          {data?.markets?.length === 0
            ? "No active prediction markets found. APIs may be unavailable."
            : "No markets match the current filters."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {markets.map((m) => (
            <MarketRow key={m.id} market={m} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", textAlign: "center", paddingTop: 8 }}>
        Data refreshes every 60s. Prices from Polymarket Gamma API and Kalshi Trade API.
        {data?.last_updated && (
          <span> Last updated: {new Date(data.last_updated as string).toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  );
}

function MarketRow({ market }: { market: PredictMarket }) {
  const prob = market.probability;

  return (
    <a
      href={market.url}
      target="_blank"
      rel="noopener noreferrer"
      className="card"
      style={{
        padding: "12px 16px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        textDecoration: "none",
        color: "inherit",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
    >
      <div style={{ minWidth: 0 }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              color: market.platform === "polymarket" ? "#6366f1" : "#06b6d4",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              flexShrink: 0,
            }}
          >
            {market.platform === "polymarket" ? "POLY" : "KALSHI"}
          </span>
          <span
            style={{
              fontSize: "var(--text-base)",
              fontWeight: 600,
              color: "var(--t1)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {market.title}
          </span>
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", gap: 16, fontSize: "var(--text-sm)", color: "var(--t3)" }}>
          <span className="mono">Vol: {fmtVol(market.volume)}</span>
          {market.volume_24h !== null && (
            <span className="mono">24h: {fmtVol(market.volume_24h)}</span>
          )}
          <span>Expires: {fmtDate(market.end_date)}</span>
        </div>
      </div>

      {/* Probability */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", minWidth: 80 }}>
        <span
          className="mono"
          style={{
            fontSize: "var(--text-xl)",
            fontWeight: 700,
            color: probColor(prob),
            lineHeight: 1.2,
          }}
        >
          {fmtProb(prob)}
        </span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>Yes</span>

        {/* Mini probability bar */}
        <div
          style={{
            width: 80,
            height: 4,
            borderRadius: 2,
            background: "var(--border)",
            marginTop: 4,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${prob * 100}%`,
              height: "100%",
              borderRadius: 2,
              background: probColor(prob),
              transition: "width 0.3s",
            }}
          />
        </div>
      </div>
    </a>
  );
}
