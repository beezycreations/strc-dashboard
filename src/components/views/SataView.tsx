"use client";

import { useSataSnapshot, useSataHistory, useSataVolatility } from "@/src/lib/hooks/use-api";
import SataMarketSummarySection from "./sections/sata/SataMarketSummarySection";
import SataFundamentalsSection from "./sections/sata/SataFundamentalsSection";
import SataRiskAnalysisSection from "./sections/sata/SataRiskAnalysisSection";
import SataRateEngineSection from "./sections/sata/SataRateEngineSection";
import SataVolatilitySection from "./sections/sata/SataVolatilitySection";
import SataFilingsSection from "./sections/sata/SataFilingsSection";

export default function SataView() {
  const { data: snap, isLoading } = useSataSnapshot();
  const { data: history } = useSataHistory("all");
  const { data: vol } = useSataVolatility();

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
      <SataMarketSummarySection snap={snap} history={history} />
      <SataFundamentalsSection snap={snap} />
      <SataRiskAnalysisSection snap={snap} />
      <SataRateEngineSection snap={snap} history={history} />
      <SataVolatilitySection vol={vol} />
      <SataFilingsSection />
    </div>
  );
}
