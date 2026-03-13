"use client";

interface TopbarProps {
  onMenuToggle: () => void;
  marketOpen: boolean;
}

export default function Topbar({ onMenuToggle, marketOpen }: TopbarProps) {
  return (
    <header className="topbar">
      {/* Hamburger — mobile only */}
      <button
        className="topbar-hamburger"
        onClick={onMenuToggle}
        aria-label="Toggle navigation"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M3 5h14M3 10h14M3 15h14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Left — page context (empty for now, views can inject via portal later) */}
      <div className="topbar-left" />

      {/* Right — status indicators */}
      <div className="topbar-right">
        <span className={`badge ${marketOpen ? "badge-green" : "badge-neutral"}`}>
          {marketOpen ? "Market Open" : "Market Closed"}
        </span>
        <button className="topbar-alerts-btn" aria-label="View alerts">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M9 2a5 5 0 00-5 5v3l-1 2h12l-1-2V7a5 5 0 00-5-5zM7.5 14a1.5 1.5 0 003 0"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
