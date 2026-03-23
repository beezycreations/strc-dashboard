"use client";

import Badge from "@/src/components/ui/Badge";
import { useSataFilings } from "@/src/lib/hooks/use-api";

/* eslint-disable @typescript-eslint/no-explicit-any */

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtProceeds(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  return `$${(usd / 1e6).toFixed(1)}M`;
}

function fmtBtcPrice(price: number): string {
  return `$${(price / 1000).toFixed(0)}K`;
}

function typeBadgeVariant(type: string): "amber" | "green" | "blue" {
  if (type === "initial") return "amber";
  if (type === "offering") return "green";
  return "blue"; // 8-K
}

export default function SataFilingsSection() {
  const { data, isLoading } = useSataFilings();

  if (isLoading || !data) {
    return (
      <section id="sata-filings" className="section-anchor">
        <div className="section-header">SEC Filings</div>
        <div className="card">
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      </section>
    );
  }

  const filings: any[] = data.filings ?? [];
  const totals = data.totals ?? { shares: 0, proceeds: 0, btc: 0 };

  return (
    <section id="sata-filings" className="section-anchor">
      <div className="section-header">SEC Filings</div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)", minWidth: 760 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
              <th style={thStyle}>Filed</th>
              <th style={thStyle}>Type</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Shares Sold</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Net Proceeds</th>
              <th style={{ ...thStyle, textAlign: "right" }}>BTC Purchased</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Avg BTC Price</th>
              <th style={thStyle}>Notes</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Filing</th>
            </tr>
          </thead>
          <tbody>
            {filings.map((f: any, i: number) => (
              <tr
                key={i}
                style={{
                  borderBottom: "1px solid var(--border)",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
              >
                <td style={tdStyle}>{fmtDate(f.filed)}</td>
                <td style={tdStyle}>
                  <Badge variant={typeBadgeVariant(f.type)}>{f.type}</Badge>
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }} className="mono">
                  {f.shares_sold != null ? f.shares_sold.toLocaleString() : "—"}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", color: "var(--green)" }} className="mono">
                  {fmtProceeds(f.net_proceeds ?? 0)}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", color: "var(--btc)" }} className="mono">
                  {f.btc_purchased != null ? `~${f.btc_purchased.toLocaleString()}` : "—"}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }} className="mono">
                  {f.avg_btc_price != null ? fmtBtcPrice(f.avg_btc_price) : "—"}
                </td>
                <td style={{ ...tdStyle, fontSize: "var(--text-xs)", color: "var(--t3)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {f.notes ?? "—"}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  {f.sec_url ? (
                    <a
                      href={f.sec_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent)", textDecoration: "none", fontSize: "var(--text-xs)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
                    >
                      SEC ↗
                    </a>
                  ) : (
                    <span style={{ color: "var(--t3)", fontSize: "var(--text-xs)" }}>--</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--amber)" }}>
              <td style={{ ...tdStyle, fontWeight: 600, color: "var(--amber)" }} colSpan={2}>Total</td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }} className="mono">
                {(totals.shares ?? 0).toLocaleString()}
              </td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: "var(--green)" }} className="mono">
                {fmtProceeds(totals.proceeds ?? 0)}
              </td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: "var(--btc)" }} className="mono">
                {(totals.btc ?? 0).toLocaleString()} ₿
              </td>
              <td style={tdStyle} colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  color: "var(--t3)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  whiteSpace: "nowrap",
};
