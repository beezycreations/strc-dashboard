"use client";

import type { View } from "./DashboardShell";

const STRC_SECTIONS = [
  { id: "strc-market", label: "Market Summary" },
  { id: "strc-fundamentals", label: "Fundamentals" },
  { id: "strc-risk", label: "Risk Analysis" },
  { id: "strc-rate", label: "Rate Engine" },
  { id: "strc-volatility", label: "Volatility" },
  { id: "strc-filings", label: "Filings" },
];

const NAV_SECTIONS = [
  {
    title: "MONITOR",
    items: [
      { id: "strc" as View, label: "STRC", subItems: STRC_SECTIONS },
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
  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

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
                <div key={item.id}>
                  <button
                    className={`sidebar-item ${activeView === item.id ? "sidebar-item--active" : ""}`}
                    onClick={() => {
                      onNavigate(item.id);
                      onClose();
                    }}
                    aria-current={activeView === item.id ? "page" : undefined}
                  >
                    {item.label}
                  </button>
                  {/* Sub-items for section scrolling */}
                  {activeView === item.id && "subItems" in item && item.subItems && (
                    <div className="sidebar-subitems">
                      {item.subItems.map((sub) => (
                        <button
                          key={sub.id}
                          className="sidebar-subitem"
                          onClick={() => {
                            scrollToSection(sub.id);
                            onClose();
                          }}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
