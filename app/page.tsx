"use client";

import { DashboardShell, type View } from "@/src/components/shell";
import {
  OverviewView,
  RiskAnalysisView,
  RateEngineView,
  VolatilityView,
  PositionModesView,
} from "@/src/components/views";

const VIEW_COMPONENTS: Record<View, React.FC> = {
  overview: OverviewView,
  risk: RiskAnalysisView,
  rate: RateEngineView,
  volatility: VolatilityView,
  positions: PositionModesView,
};

export default function Home() {
  return (
    <DashboardShell>
      {(activeView) => {
        const ViewComponent = VIEW_COMPONENTS[activeView];
        return <ViewComponent />;
      }}
    </DashboardShell>
  );
}
