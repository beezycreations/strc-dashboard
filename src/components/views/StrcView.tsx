"use client";

import { useSnapshot, useHistory, useVolatility } from "@/src/lib/hooks/use-api";
import MarketSummarySection from "./sections/MarketSummarySection";
import FundamentalsSection from "./sections/FundamentalsSection";
import RiskAnalysisSection from "./sections/RiskAnalysisSection";
import RateEngineSection from "./sections/RateEngineSection";
import VolatilitySection from "./sections/VolatilitySection";
import FilingsSection from "./sections/FilingsSection";

export default function StrcView() {
  const { data: snap, isLoading } = useSnapshot();
  const { data: history } = useHistory("all");
  const { data: vol } = useVolatility();

  if (isLoading || !snap) {
    return (
      <div style={{ display: "flex", gap: "var(--card-gap)", flexWrap: "wrap" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ flex: "1 1 150px", height: 88 }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      <MarketSummarySection snap={snap} history={history} />
      <FundamentalsSection snap={snap} />
      <RiskAnalysisSection snap={snap} history={history} />
      <RateEngineSection snap={snap} history={history} />
      <VolatilitySection vol={vol} />
      <FilingsSection />
    </div>
  );
}
