"use client";

import type { View } from "./DashboardShell";

const NAV_SECTIONS = [
  {
    title: "MONITOR",
    items: [
      { id: "overview" as View, label: "Overview" },
      { id: "risk" as View, label: "Risk Analysis" },
      { id: "rate" as View, label: "Rate Engine" },
      { id: "volatility" as View, label: "Volatility" },
    ],
  },
  {
    title: "STRATEGIES",
    items: [
      { id: "positions" as View, label: "Position Modes" },
    ],
  },
];

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ activeView, onNavigate, open, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
        {/* Logo / brand */}
        <div className="sidebar-brand">
          <span className="sidebar-logo">STRC</span>
          <span className="sidebar-logo-sub">Intelligence</span>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="sidebar-section">
              <div className="sidebar-section-title">{section.title}</div>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  className={`sidebar-item ${activeView === item.id ? "sidebar-item--active" : ""}`}
                  onClick={() => {
                    onNavigate(item.id);
                    onClose();
                  }}
                  aria-current={activeView === item.id ? "page" : undefined}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer — live data indicator */}
        <div className="sidebar-footer">
          <span className="live-pulse" />
          <span className="sidebar-footer-label">Live Data</span>
        </div>
      </aside>
    </>
  );
}
