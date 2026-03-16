"use client";

import { useState, useCallback } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export type View = "strc" | "positions";

interface DashboardShellProps {
  children: (activeView: View) => React.ReactNode;
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const [activeView, setActiveView] = useState<View>("strc");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleNavigate = useCallback((view: View) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  return (
    <div className="shell">
      <Sidebar
        activeView={activeView}
        onNavigate={handleNavigate}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="shell-main">
        <Topbar
          onMenuToggle={() => setSidebarOpen((o) => !o)}
          marketOpen={false} /* wired to API later */
        />
        <main className="shell-content">{children(activeView)}</main>
      </div>
    </div>
  );
}
