"use client";

import { DashboardShell, type View } from "@/src/components/shell";
import { StrcView, PositionModesView } from "@/src/components/views";

const VIEW_COMPONENTS: Record<View, React.FC> = {
  strc: StrcView,
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
