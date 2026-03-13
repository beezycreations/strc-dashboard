# STRC Intelligence Platform — Phase 2: Dashboard Wireframe & UI Specification

**Version:** 2.2  
**Date:** March 2026  
**Changes from v2.1:** Design review fixes — corrected duplicate build step 12→13; fixed tri-axis language (was "dual-axis") throughout Section 6.1.1; added `offset: true` note to yCumul scale; corrected ATM Pace risk card badge to amber WATCH; defined reference-only hedge calculator layout in Section 6.4; added dividend flag spec to Section 6.1 price chart; expanded Appendix C with full badge class table including `badge-violet`; removed "(previously 9.6)" artifact from Section 9.7; updated wireframe reference to `strc_dashboard_v5.html`.  
**Changes from v2.0:** Added Section 6.1.1 (Volume + ATM Issuance Tracker panel in Overview), Section 7.13 (`<VolumeATMTracker>` component), Section 9.6 (`/api/data/volume-atm` endpoint), updated Section 9.7 (update frequencies), updated build order in Section 12.1.  
**Changes from v1.0:** Added Section 6.5 (Position Modes — full rewrite for options-primary hedge calculator), Section 6.7 (Options Data Sources), Section 7.10–7.12 (new components), Section 9.5 (options API binding), Section 12.7 (Deribit integration).  
**Purpose:** Complete dashboard wireframe, design system, component library, and UI specification for Claude Code implementation. Accompanying interactive wireframe: `strc_dashboard_v5.html`.

---

## Table of Contents

1. [Design Direction](#1-design-direction)
2. [Design System — Tokens](#2-design-system--tokens)
3. [Layout Architecture](#3-layout-architecture)
4. [Responsive Breakpoints](#4-responsive-breakpoints)
5. [Navigation Structure](#5-navigation-structure)
6. [View Specifications](#6-view-specifications)
   - 6.1 [Overview](#61-overview)
     - 6.1.1 [Volume + ATM Issuance Tracker](#611-volume--atm-issuance-tracker)  ← **v2.1 new**
   - 6.2 [Risk Analysis](#62-risk-analysis)
   - 6.3 [Rate Engine](#63-rate-engine)
   - 6.4 [Volatility](#64-volatility)
   - 6.5 [Position Modes — Options Calculator](#65-position-modes--options-calculator)  ← **v2.0 full rewrite**
   - 6.6 [Tranche Product](#66-tranche-product)
   - 6.7 [Options Data Sources](#67-options-data-sources)  ← **v2.0 new**
7. [Component Library](#7-component-library)
8. [Chart Specifications](#8-chart-specifications)
9. [Data Binding Map](#9-data-binding-map)
10. [Interaction Patterns](#10-interaction-patterns)
11. [Accessibility Requirements](#11-accessibility-requirements)
12. [Implementation Notes for Claude Code](#12-implementation-notes-for-claude-code)

---

## 1. Design Direction

### 1.1 Concept

**"Bloomberg clarity, Apple warmth."**

The STRC Intelligence Platform is a professional investment tool used by a sophisticated operator who has already mastered the underlying instrument. The interface does not explain — it monitors, signals, and gets out of the way. Every design decision prioritizes information density without visual noise.

**Aesthetic pillars:**
- **White + warm gray** surface system — never cold blue-white
- **Typography-first** — numbers lead, labels subordinate
- **Color only for signal** — green/amber/red are informational, not decorative
- **Apple-level spatial precision** — 8px base grid, no pixel rounding ambiguity
- **Portu-inspired card elevation** — subtle shadows, generous inset padding, 14px border-radius

### 1.2 Personality Keywords
Precise · Trustworthy · Calm under pressure · Investment-grade · Not flashy

### 1.3 Anti-patterns (explicitly forbidden)
- Purple gradients on white backgrounds
- Dark mode default (light is primary; dark mode is optional future phase)
- Animated background effects
- Excessive iconography
- KPI cards with more than 3 lines of information
- Chart labels that overlap or rotate more than 0°
- Alert banners that push content down (use inline badges instead)

---

## 2. Design System — Tokens

### 2.1 Color Palette

```css
/* Neutrals */
--bg:         #FFFFFF    /* Page background */
--surface:    #FAFAF8    /* Card inner surfaces, table rows on hover */
--surface-2:  #F3F1ED    /* Progress track, input backgrounds */
--border:     rgba(0,0,0,0.07)   /* Default card/cell borders */
--border-med: rgba(0,0,0,0.11)   /* Hover borders */

/* Typography */
--t1: #0D0C0A    /* Primary text — headings, values */
--t2: #5C5955    /* Secondary text — labels, sublabels */
--t3: #9B9890    /* Tertiary text — timestamps, units, axis labels */

/* Signal colors — each has a background variant (-l) */
--accent:    #0052FF    /* Primary brand — STRC, primary metrics */
--accent-l:  #EBF0FF

--btc:       #F7931A    /* Bitcoin — BTC price, BTC metrics */
--btc-l:     #FFF4E6
--btc-d:     #C46E0C    /* Dark variant for text on btc-l background */

--green:     #00A86B    /* Positive / safe / buy signal */
--green-l:   #E6F7F1

--red:       #FF3B30    /* Negative / danger / alert */
--red-l:     #FFE9E8

--amber:     #FF9500    /* Warning / watch / hold signal */
--amber-l:   #FFF5E6

--violet:    #7C3AED    /* Rate / SOFR / tranche product */
--violet-l:  #EDE9FE
```

**Color assignment rules:**
- STRC price, effective yield, primary metrics → `--accent`
- Bitcoin price, BTC NAV, BTC coverage → `--btc` / `--btc-d`
- Safe / above threshold / buy signal → `--green`
- Watch / approaching threshold / hold → `--amber`
- Alert / breach / trim signal → `--red`
- Rate, SOFR, tranche, hedge cost → `--violet`
- mNAV, tactical mode → `--amber`

### 2.2 Typography

```css
/* Font families */
--font-ui:   'Instrument Sans', sans-serif;    /* All UI text, labels */
--font-num:  'DM Mono', monospace;             /* All financial numbers */
--font-serif: 'Instrument Serif', serif;       /* Optional: section titles */

/* Scale */
--text-xs:   10px;   /* Axis labels, timestamps */
--text-sm:   11px;   /* Table cells, footers */
--text-base: 13px;   /* Body text, labels */
--text-md:   15px;   /* Card titles */
--text-lg:   17px;   /* Section titles */
--text-xl:   22px;   /* KPI values */
--text-2xl:  28px;   /* Primary KPI values */

/* Numeric rendering */
font-variant-numeric: tabular-nums;   /* Apply to ALL number containers */
```

**Font loading:** Google Fonts — `Instrument Sans:ital,wght@0,400;0,500;0,600;0,700` and `DM Mono:wght@400;500`.

### 2.3 Spacing

```css
--space-base: 8px;
--page-pad:   32px;   /* Desktop page padding */
--page-pad-m: 16px;   /* Mobile page padding */
--card-pad:   20px;   /* Card interior padding */
--card-gap:   14px;   /* Gap between cards in a row */
--r:          14px;   /* Card border radius */
--r-sm:       9px;    /* Inner elements */
--r-xs:       6px;    /* Chips, badges */
```

### 2.4 Elevation

```css
--shadow:    0 1px 2px rgba(0,0,0,0.05), 0 3px 12px rgba(0,0,0,0.04);
--shadow-md: 0 2px 8px rgba(0,0,0,0.07), 0 8px 32px rgba(0,0,0,0.05);
```

---

## 3. Layout Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Topbar (60px, sticky, blur backdrop)                       │
├──────────┬──────────────────────────────────────────────────┤
│ Sidebar  │ Content Area (scrollable)                        │
│ (260px)  │  padding: 28px 32px                              │
│ fixed    │                                                  │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

- Sidebar: `position: fixed`, 260px, full height, `border-right: 1px solid var(--border)`
- Topbar: `position: sticky; top: 0; backdrop-filter: blur(12px); z-index: 50`
- Content: `margin-left: 260px`, scrollable, `padding: 28px 32px`
- View switching: CSS `display` toggle (no router, no scroll reset, instant)

---

## 4. Responsive Breakpoints

| Breakpoint | Width | Changes |
|---|---|---|
| Desktop | ≥1100px | 6-col KPI, full sidebar (260px), multi-col rows |
| Tablet | 860–1100px | 3-col KPI, sidebar 220px, risk grid 2-col |
| Mobile | ≤860px | Off-canvas sidebar (hamburger), 2-col KPI, all rows stack |
| Mobile small | ≤520px | KPI font reduces to 18px, options table horizontal scroll |

---

## 5. Navigation Structure

```
MONITOR
  ├── Overview
  ├── Risk Analysis
  ├── Rate Engine
  └── Volatility

STRATEGIES
  ├── Position Modes
  └── Tranche Product
```

Active nav item: `background: var(--t1); color: #fff; border-radius: 9px`  
Sidebar footer: live green pulse badge with "Live Data" label

---

## 6. View Specifications

### 6.1 Overview

**Purpose:** Real-time snapshot of all critical STRC metrics on one screen.

**Layout:**
```
[6-KPI strip: STRC Price | Rate | mNAV | BTC Price | BTC Reserve | USD Reserve]
[Price+Rate dual-axis chart (col-7) | Capital Stack vertical bar + Terms cards (col-5)]
[Flywheel metrics row: 4 cards]
[Volume + ATM Issuance Tracker — full width]                        ← v2.1 new
[BTC Coverage gauge+LP (col-4) | ATM Utilization+Runway (col-4) | Rate Countdown+Stopper (col-4)]
```

**KPI Strip — 6 cards:**
1. STRC Price (accent) — effective yield in footer
2. Current Rate (violet) — days to next announcement in footer
3. mNAV (amber) — 30d trend + regime badge
4. Bitcoin Price (btc) — 24h change + confirmed holdings
5. **BTC Reserve** (btc-l background) — `$XX.XB` BTC NAV value + coverage ratio (`X.X×`) + impairment price
6. USD Reserve (green) — coverage months + annual obligations

**Capital Stack chart:** Vertical bar chart (X = seniority tier, Y = notional $B). Orange dashed reference line at BTC NAV. Preferred terms cards below: STRF / STRC / STRK / STRD / Common — each shows rate, type, cumulative status, frequency, and structural note.

**Flywheel metrics row:** BTC Yield 2025 / BTC Dollar Gain / BTC Conversion Rate (regime-adjusted) / mNAV Break-Even BTC price

**Price + Rate chart — dividend flags:**

STRC pays dividends on the last calendar day of each month (per the CoD). The price chart overlays a vertical dashed green line at each month-end that falls within the visible date range. Each line has a small `DIV` chip at the top. Implementation: custom Chart.js plugin (`dividendFlagPlugin`) registered globally — draws after the chart renders, reads `chart.data.labels` to find month-end dates, renders via `ctx` canvas calls. Tooltip shows "Dividend payment date" when hovering a flagged column. Legend entry: green bordered square + "Dividend" label.

---

### 6.1.1 Volume + ATM Issuance Tracker

**Purpose:** Show STRC daily trading volume alongside ATM issuance events on a unified timeline. The primary insight is the correlation between volume spikes and ATM activity — elevated volume often precedes or coincides with 8-K filings disclosing issuance. This panel gives a read on market absorption and remaining ATM capacity.

**Panel position:** Full width, between the Flywheel row and the bottom three-column row in Overview.

**Panel layout:**
```
[card-header: title | time range tabs (1M / 3M / All since IPO)]
[6-chip KPI strip]
[Combined chart (col-8) | ATM Event Log (col-4)]
```

**KPI Strip — 6 stat cells, no card borders, inline bar:**

| Cell | Metric | Source |
|---|---|---|
| 1 | Today's Volume | FMP `/quote/STRC` → volume field |
| 2 | 20d Avg Volume | Computed from `price_history.volume_strc` rolling 20 sessions |
| 3 | Vol / 20d Avg | Ratio — flag ≥ 2.0× with amber badge, ≥ 3.0× with red badge |
| 4 | ATM Deployed (total) | `SUM(atm_issuance.proceeds_usd)` → format as `$X.XXB` |
| 5 | Remaining Capacity | `authorized − deployed` — amber if < $500M, red if < $200M |
| 6 | Trailing 90d Pace | `SUM(proceeds last 90d) / 3` → `$XXXMo/month` pace |

**Combined chart — tri-axis (three Y-scales):**

- **X-axis:** Trading dates from STRC IPO (Jul 29, 2025) to today. Condensed to show weekly ticks when showing All; daily ticks when showing 1M.
- **Y-left:** STRC daily volume in thousands of shares (K shares). Scale from 0 to max daily volume + 20% headroom.
- **Y-right:** Dual purpose — ATM issuance per event ($M, orange bars) AND cumulative ATM deployed ($B, violet stepped line). Scale: 0–500 for $M events; cumulative line uses its own right label.

**Chart datasets:**
1. **Daily volume bars** — `--accent` fill, 80% opacity, full width bars. These are the primary visual.
2. **20d rolling avg line** — `--accent` dashed line, weight 1.5px, no fill. Overlaid on volume bars. Shows trend clearly even on volatile days.
3. **ATM issuance event bars** — `--btc` (orange) fill, rendered as narrow bars (50% width of volume bars) at the exact dates of 8-K filings. Height proportional to proceeds amount ($M, right axis). These visually sit "inside" the volume bars — on high-volume days, they'll appear as an orange core within the blue bar.
4. **Cumulative ATM deployed line** — `--violet` stepped line, weight 2px, right axis. Shows $B deployed over time, stepping up at each issuance event. Fills from line to bottom with `rgba(124,58,237,0.04)`.

**Annotation logic:**
- When an ATM event bar is hovered, tooltip shows: date / shares issued / proceeds / price at issuance / LP at time.
- Days where Vol/Avg ≥ 2.0× and no confirmed ATM event: show subtle amber border around the volume bar — potential pre-issuance signal.
- Days where Vol/Avg ≥ 3.0× and no ATM event: red border — anomalous volume worth investigating.

**ATM Event Log — right column (scrollable):**

```
[log-header: "ATM Issuance Events — Since IPO" + total count badge]
[scrollable list, newest first]
```

Each event row:
```
[date chip] [proceeds badge] [shares] [price] [LP at time]
```

Columns: Date / Proceeds ($M) / Shares Issued (M) / Issue Price / LP at Issuance / Remaining Cap after

Color coding: proceeds badge — green if proceeds > prior event, amber if declining, red if < $100M (accelerating depletion).

Scroll height: `max-height: 320px; overflow-y: auto`. No pagination.

**Important analytical notes for Claude Code:**

1. **Volume source is FMP daily OHLCV** — the `price_history` table already stores `volume_strc` per the Phase 1 schema. No new data pipeline needed for volume.

2. **ATM event dates come from EDGAR** — the `atm_issuance` table stores the 8-K filed date, proceeds, shares, and price. The 8-K is typically filed 2–5 business days after the issuance window closes. Volume spikes may therefore **precede** the logged date by 2–5 days. Do not try to align them exactly — show both independently and let the user see the pattern.

3. **Pre-issuance volume signal:** The key insight is: STRC volume spike → LP ratchet window opening → ATM likely to deploy → signal to check for pending 8-K. Do NOT surface this as an automated alert (insufficient confidence). Surface it as a visual pattern only.

4. **Cumulative line guard:** Only render the cumulative line from the first confirmed issuance event date. Before that date it shows zero. Do not interpolate.

5. **ATM_remaining alert:** When remaining capacity < $500M, add amber `<400M remaining` badge to the KPI strip cell. When < $200M, red. This matters because the ATM program is the primary mechanism supporting STRC premium pricing.

---

**Purpose:** Six quantitative risk dimensions with gauges, mini-charts, and threshold status.

**Layout:**
```
[Section header: risk count badges (N safe / N watch / N alert)]
[3-column grid of 6 risk cards]
[Structural Protections row: Dividend Stopper | FC Put + Saylor Carve-Out | Voting+Redemption]
```

**Risk Cards (3×2 grid):**
1. Dividend Coverage — ring gauge showing months + reserve/ATM progress bars
2. BTC Collateral Coverage — bar chart of coverage at stress scenarios
3. mNAV Sustainability — 60d area line with regime threshold lines
4. Liquidation Recovery — step curve (recovery % vs BTC price)
5. Rate Reset Risk — 12-month floor projection (3 scenarios)
6. ATM Pace vs BTC — monthly bar chart of ATM utilization. Badge: **amber WATCH** when remaining < $1B at current pace (< ~3 months runway). Green SAFE only when remaining > $1.5B.

Each card: `card-title` + `badge` (signal status) + mini chart + `stat-row` of key thresholds.

---

### 6.3 Rate Engine

**Purpose:** Rate history, SOFR forward curve from SR1 futures, and floor projections.

**Layout:**
```
[Section header with current rate + SOFR chips]
[Rate History mixed chart (col-8) | Announcement Log (col-4)]
[SOFR Forward Curve — SR1 (col-6) | Rate Floor Projection 12mo — 3 scenarios (col-6)]
```

**Rate History chart:** `ComposedChart` — bars for rate (violet, full opacity = confirmed, 40% opacity = estimated), line for 1M Term SOFR (accent, dashed). Y-axis 0–14%.

**SR1 Forward Curve:** Line chart from FMP `/historical-price-full/SR1` futures prices. Formula: `SOFR_implied = 100 − SR1_price`. Shows implied SOFR M+1 through M+12 with horizontal reference line at current SOFR. This is the input to the minimum rate floor projection.

**Announcement Log:** Scrollable list, each row: date / rate% / delta bps / source badge (EDGAR confirmed vs. Estimated).

---

### 6.4 Volatility

**Purpose:** Realized vol, MSTR IV, beta, correlation — hedge construction framework.

**Layout:**
```
[Vol + Beta matrix table (col-6) | Rolling Correlation chart (col-6)]
[MSTR Short Hedge Calculator (col-6) | BTC Futures Hedge Calculator (col-6)]
```

**Vol matrix:** Grid with rows for STRC / STRF / STRK / STRD / MSTR / BTC / SPY. Columns: σ30d / σ90d / Vol Ratio / IV(30d) / β/BTC / β/MSTR / Signal. MSTR IV column shows 30d and 60d ATM IV from FMP options endpoint. SPY shown as macro baseline row in muted color. Vol Ratio > 1.5 triggers amber highlight on that cell.

**Hedge calculators:** See Section 6.5 for the primary interactive options calculator. The Volatility view hedge calculators in Section 6.4 are **reference-only static panels** — not interactive. Each shows two stat cards side by side:

```
┌ MSTR Hedge Reference ──────────────────┐
│ Beta to MSTR (30d)    0.22             │
│ Hedge Ratio           22% of position  │
│ Notional (@$1M)       $220,000         │
│ Est. ATM put cost     ~X.XX%/yr        │
│ Source: β × MSTR 30d IV                │
└────────────────────────────────────────┘

┌ BTC Hedge Reference ───────────────────┐
│ Beta to BTC (30d)     0.18             │
│ Hedge Ratio           18% of position  │
│ Notional (@$1M)       $180,000         │
│ Est. ATM put cost     ~X.XX%/yr        │
│ Source: β × Deribit 30d IV             │
└────────────────────────────────────────┘
```

These panels are read-only stat rows pulled from `/api/data/volatility`. They provide a cross-reference for the interactive calculator in Position Modes. No inputs, no recalculation — clicking them navigates to Position Modes.

---

### 6.5 Position Modes — Options Calculator

**Version:** 2.0 — Full rewrite. This view replaces the simple short-selling calculator from v1.0.

**Purpose:** Interactive position sizing and hedge construction tool using live options pricing. The primary hedge strategy is options-based (puts / put spreads / collars). Short-selling parameters remain visible as a cost comparison reference.

#### 6.5.1 Mode Tab Navigation

```
[ Mode 1 · Long | Mode 2 · Options Hedge ]
```

Mode 1 (Long) is unchanged from v1.0 — see Section 6.5.6.  
Mode 2 (Options Hedge) is the new calculator described below.

#### 6.5.2 Mode 2 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ [15-min delay notice banner — amber, dismissable]                    │
├────────────────────────────────┬─────────────────────────────────────┤
│ CALCULATOR PANEL (40%)         │ OPTIONS CHAIN (60%)                 │
│                                │                                     │
│ ┌ INPUTS ─────────────────┐    │ [ MSTR Puts ] [ BTC Puts ∙ Deribit] │
│ │ Position Size   $input  │    │ Expiry: [ 30d ] [ 60d ] [ 90d ]    │
│ │ Asset      [MSTR] [BTC] │    │ ─────────────────────────────────  │
│ │ Strategy  [selector ▾]  │    │ Options table rows                  │
│ │ Hedge Ratio  [%] ←β ref │    │ (click row to select strike)        │
│ └─────────────────────────┘    │                                     │
│                                │                                     │
│ ┌ HEDGE COST BREAKDOWN ───┐    │                                     │
│ │ [cost explanation card] │    │                                     │
│ └─────────────────────────┘    │                                     │
│                                │                                     │
│ ┌ OUTPUTS ────────────────┐    │                                     │
│ │ Hedge Notional          │    │                                     │
│ │ Contracts               │    │                                     │
│ │ Premium / Cost          │    │                                     │
│ │ Ann. Cost %             │    │                                     │
│ │ Net Hedged Yield        │    │                                     │
│ │ vs SOFR                 │    │                                     │
│ │ Monthly Income (net)    │    │                                     │
│ │ Break-even STRC Rate    │    │                                     │
│ └─────────────────────────┘    │                                     │
│                                │                                     │
│ ┌ RISK SCORE ─────────────┐    │                                     │
│ │ X.X / 10  [color bar]   │    │                                     │
│ │ 5 component scores      │    │                                     │
│ └─────────────────────────┘    │                                     │
└────────────────────────────────┴─────────────────────────────────────┘
```

#### 6.5.3 Calculator Inputs

**Position Size**
- Input type: number input with `$` prefix, formatted with commas
- Default: `$1,000,000`
- Min: `$10,000` | Max: no hard limit
- On change: recalculate all outputs immediately

**Asset Toggle**
- Two-button pill: `[MSTR]` `[BTC]`
- Default: MSTR
- Switching: loads appropriate options chain tab and recalculates using corresponding beta
- MSTR hedge ratio default: `Beta_STRC_to_MSTR_30d` (e.g. 22%)
- BTC hedge ratio default: `Beta_STRC_to_BTC_30d` (e.g. 18%)
- Label under toggle: "Hedge ratio auto-set from 30d beta. Override below."

**Strategy Selector**
```
Options: ATM Put | Put Spread | Collar
```
- Default: `ATM Put`
- `ATM Put`: select one put row (long put, full premium cost)
- `Put Spread`: select one put row as long leg. Short leg auto-suggested at −15% OTM from long. User can click a second row in the chain to override short leg.
- `Collar`: select one put row as hedge. Call auto-suggested at +10% OTM of current price. User can override call strike. Call premium received shown as a green credit in cost breakdown.

**Hedge Ratio**
- Input: numeric `%` field, editable
- Default: auto-populated from `Beta_STRC_to_MSTR_30d` (MSTR) or `Beta_STRC_to_BTC_30d` (BTC)
- Adjacent label: "Auto from β = 0.22 (30d)" — updates when beta changes
- Rebalance trigger displayed when current ratio deviates > 15% from entry ratio

**Expiry**
- Three tabs on the options chain panel: `30d` `60d` `90d`
- Tabs filter the options chain to show the nearest expiry within that window
- Active expiry DTE used in annualized cost calculation

#### 6.5.4 Options Chain Table

**MSTR Puts tab (FMP data):**

| Col | Header | Format | Notes |
|---|---|---|---|
| 1 | Strike | `$XXX` | Bold |
| 2 | Bid | `$X.XX` | |
| 3 | Ask | `$X.XX` | |
| 4 | Mid | `$X.XX` | **Bold — this drives cost** |
| 5 | IV | `XX%` | Color: green < 80%, amber 80–100%, red > 100% |
| 6 | Delta | `-X.XX` | Violet |
| 7 | Theta | `-$X.XX` | Muted |
| 8 | OI | `XX,XXX` | Grey if < 100 |
| 9 | Vol | `XXX` | |

**Rows:**
- ATM row (nearest to current MSTR price): highlighted with `--violet-l` background + `ATM` badge
- Selected row (user clicked): highlighted with `--accent-l` background + `●` indicator
- For Put Spread: second selected row highlighted with `--green-l` (short leg, income)
- For Collar: call row shown in a separate sub-table below with `--green-l` highlight (call = credit)
- Low OI rows (< 100): greyed out, `cursor: not-allowed`, tooltip: "Low liquidity — OI < 100. Use with caution."
- Max rows per expiry: 11 (ATM ± 5 strikes)

**BTC Puts tab (Deribit data):**

Same columns except:
- Mid column shows **both** BTC price and USD equivalent: `0.0248 BTC ($1,758)`
- Extra column: `USD Mid` — explicit USD cost per contract (1 BTC/contract)
- IV color thresholds adjusted: green < 60%, amber 60–80%, red > 80%
- Footer note: "Deribit: 1 contract = 1 BTC. Prices quoted in BTC. USD conversion uses live BTC spot."
- Instrument names shown in sub-header: `BTC-28MAR26-70000-P` format

**Data delay banner (persistent when options tab active):**
```
⏱ Options prices are delayed ~15 minutes (FMP Standard plan). Deribit data refreshes every 5 minutes.
Premiums may differ from live market. Confirm with broker before execution.
```
Banner: `--amber-l` background, amber text, small font, dismissable per session.

#### 6.5.5 Hedge Cost Breakdown Card

This card sits below the inputs and explains the source of the hedge cost number. This is explicit by design — the user should always know what they are paying for and why.

**Structure per strategy:**

**ATM Put:**
```
┌ HEDGE COST SOURCE ────────────────────────────────────────┐
│ Strategy: Long MSTR Put @ $245 strike (30d, ~ATM)         │
│                                                           │
│ Premium paid:    $10.35/share × 100 shares × 9 contracts  │
│                = $9,315 upfront                           │
│                                                           │
│ Annualized:      $9,315 / $1,000,000 × (365/28)          │
│                = 12.14% × 1.15 (roll friction)            │
│                = 2.22% annualized cost                    │
│                                                           │
│ What this buys: Full downside protection on $220,000      │
│ MSTR notional below $245. MSTR can rally without cost.   │
│                                                           │
│ vs Short-selling: ~0.8% borrow cost (same notional),     │
│ but unlimited loss if MSTR rallies above entry.           │
└───────────────────────────────────────────────────────────┘
```

**Put Spread:**
```
│ Buy $245P @ $10.35 / Sell $210P @ $3.20 = Net $7.15/share │
│ Protection range: $245 → $210 (−14.3% from current)       │
│ Below $210: unprotected.                                   │
```

**Collar:**
```
│ Buy $245P @ $10.35 / Sell $275C @ $8.90 = Net $1.45/share │
│ Net cost: near-zero. Caps MSTR upside above $275 (+12%).   │
│ Full downside protection below $245.                       │
│ Call premium received: $8,010 (shown as green credit)      │
```

The cost breakdown card recalculates and re-renders every time the user changes strategy, strike, or position size. Values are computed in JavaScript from the selected options chain row — not hardcoded.

#### 6.5.6 Outputs Panel

All outputs recalculate in real-time as inputs change. Each output shown in a stat tile with label + mono value.

```typescript
// Calculation logic

// Step 1: Hedge notional
hedge_notional = position_size * (hedge_ratio_pct / 100)

// Step 2: Contracts
// MSTR: 100 shares per contract
contracts_mstr = Math.ceil(hedge_notional / (100 * mstr_price * Math.abs(selected_delta)))
// BTC Deribit: 1 BTC per contract
contracts_btc  = Math.ceil(hedge_notional / (btc_price * Math.abs(selected_delta)))

// Step 3: Premium cost
// MSTR
premium_mstr = contracts_mstr * selected_mid * 100
// BTC — convert from BTC to USD
premium_btc  = contracts_btc * selected_mid_btc * btc_spot_price

// Step 4: Adjust for strategy
// Put Spread: subtract short leg premium received
if (strategy === 'put_spread') {
  premium_net = premium_mstr - (contracts_mstr * short_put_mid * 100)
}
// Collar: subtract call premium received
if (strategy === 'collar') {
  premium_net = premium_mstr - (contracts_mstr * call_mid * 100)
}

// Step 5: Annualized cost
ann_cost_pct = (premium_net / position_size) * (365 / selected_dte) * 100
ann_cost_with_roll = ann_cost_pct * 1.15  // 15% roll friction

// Step 6: Outputs
net_hedged_yield = strc_effective_yield - ann_cost_with_roll
spread_vs_sofr_bps = (net_hedged_yield - sofr_1m_pct) * 100
monthly_income_net = position_size * (net_hedged_yield / 100) / 12
breakeven_strc_rate = ann_cost_with_roll  // STRC rate at which net yield = 0
```

**Display tiles (8 tiles in 2×4 grid):**
1. Hedge Notional — `$XXX,XXX`
2. Contracts — `XX contracts` with contract type label
3. Premium (upfront) — `$XX,XXX`
4. Annualized Cost — `X.XX%` (violet, negative)
5. Net Hedged Yield — `XX.XX%` (accent highlighted tile)
6. vs SOFR — `+XXXbps` (green if > 250bps, amber if 150–250, red if < 150)
7. Monthly Income (net) — `$X,XXX`
8. Break-even STRC Rate — `X.XX%` with note "yield = 0% below this rate"

**Alert tile:** If break-even rate > SOFR floor (4.30%), show amber warning: "Break-even rate exceeds SOFR floor — strategy relies on STRC rate staying above X.XX%."

#### 6.5.7 Risk Score

The composite risk score is a **fully quantitative** metric computed from 5 inputs. It is not a qualitative assessment — it is a weighted formula that outputs a number from 0 to 10.

**Component scores (each normalized 0–10):**

```typescript
interface RiskScoreInputs {
  btc_coverage_ratio: number;       // e.g. 4.3
  net_yield_pct: number;            // e.g. 9.07
  sofr_pct: number;                 // e.g. 4.30
  strike_otm_pct: number;           // % out of the money, 0 = ATM
  iv_percentile: number;            // 0–100, where 100 = highest IV in 1yr window
  days_to_announcement: number;     // e.g. 18
}

function calcComponentScores(inputs: RiskScoreInputs) {
  return {
    // Higher coverage = higher score (max 10 at 4× coverage)
    btc:   Math.min(10, (inputs.btc_coverage_ratio - 1) / 3 * 10),
    // Higher yield spread over SOFR = higher score (max 10 at 700bps spread)
    yield: Math.min(10, Math.max(0, (inputs.net_yield_pct - inputs.sofr_pct) / 7 * 10)),
    // ATM = 10, 20% OTM = 0 (less protection = more risk)
    strike: Math.max(0, 10 - inputs.strike_otm_pct / 2),
    // Low IV percentile = cheap hedge = high score; high IV = expensive = low score
    iv:    Math.max(0, (100 - inputs.iv_percentile) / 10),
    // Close to announcement = uncertainty = low score
    days:  Math.min(10, inputs.days_to_announcement / 3),
  };
}

function calcComposite(scores: ReturnType<typeof calcComponentScores>) {
  return (
    scores.btc    * 0.30 +
    scores.yield  * 0.25 +
    scores.strike * 0.20 +
    scores.iv     * 0.15 +
    scores.days   * 0.10
  );
}
```

**Weights rationale:**
- BTC Coverage (30%): Primary structural protection — the most durable safety factor
- Net Yield vs SOFR (25%): The economic reason to hold the position — must be compelling
- Strike OTM % (20%): ATM puts provide full protection; OTM puts have gaps
- MSTR IV Percentile (15%): High IV = expensive hedges = worse risk/reward
- Days to Announcement (10%): Rate uncertainty is real but bounded (25bps/mo cap)

**Color thresholds:**
- 7.0–10.0 → green (`--green`, `--green-l` background)
- 4.0–6.9 → amber (`--amber`, `--amber-l` background)
- 0–3.9 → red (`--red`, `--red-l` background)

**Display:**
```
┌ COMPOSITE RISK SCORE ─────────────────────────────────────┐
│  7.8 / 10              ████████░░  GREEN                  │
│                                                           │
│ BTC Coverage    9.8   ██████████  (weight 30%)            │
│ Yield Spread    8.1   ████████░░  (weight 25%)            │
│ Strike OTM %    6.0   ██████░░░░  (weight 20%)            │
│ IV Percentile   4.2   ████░░░░░░  (weight 15%)            │
│ Days to Ann.    6.0   ██████░░░░  (weight 10%)            │
└───────────────────────────────────────────────────────────┘
```

Each component row: label + score number (mono) + proportional bar + weight label.  
The composite bar at the top is larger (height 12px vs 6px for components).

#### 6.5.8 Mode 1 — Long (Unchanged from v1.0)

```
[2×2 KPI mini-grid (50%) | Position Dashboard card (50%)]
```
Mini-grid: Effective Yield / Par Spread / Monthly Income per $1M / YTD Income  
Dashboard: Signal (hold/buy/trim) + buy/trim trigger levels  
Signals: Buy < $98 (> 200bps discount + BTC coverage > 3.0×) | Hold $98–$102 | Trim > $104

---

### 6.6 Tranche Product

**Purpose:** Mode 3 — coverage tests, junior yield sensitivity, pool NAV, excess spread history.

**Layout:**
```
[Pool NAV + per-unit valuation card (full width)]
[3-column tranche config cards (A/B/C)]
[Excess Spread + RFB historical chart (col-6) | Sensitivity table + Coverage matrix (col-6)]
```

**Pool NAV card:** Three stat cells — Pool NAV / Senior NAV per Unit / Junior NAV per Unit (Config A default). Shows income allocation: pool monthly income / senior income / junior income / accrued receivable.

**Config cards:** Green (A) / Accent (B) / Amber (C) top border. 2×2 grid per card: allocations + yields. Mini summary: SCR / floor / RFB.

**Excess Spread chart (NEW from v2.0 audit):** Line chart showing EST for all three configs over time since IPO, with EOD floor line (red dashed at 0%). Confirms that excess spread has grown as STRC rate increased.

**Coverage test matrix:** CSS Grid 4×4. Cells color-coded pass/warn/fail. Values computed from live STRC rate.

**Junior yield sensitivity table:** STRC rate scenarios → junior yield per config. Config C goes negative at SOFR floor → red cells.

---

### 6.7 Options Data Sources

**NEW SECTION — v2.0**

#### 6.7.1 MSTR Options (FMP)

**Endpoint:**
```
GET https://financialmodelingprep.com/api/v3/options/MSTR?apikey=${FMP_API_KEY}
```

**Response fields used:**
```typescript
interface FMPOptionContract {
  symbol:         string;    // "MSTR260328P00245000"
  type:           'put' | 'call';
  strike:         number;    // 245.00
  expiration:     string;    // "2026-03-28"
  bid:            number;
  ask:            number;
  last:           number;
  impliedVolatility: number; // 0.89 (multiply by 100 for display %)
  delta:          number;    // -0.48
  theta:          number;    // -0.32
  openInterest:   number;    // 18200
  volume:         number;    // 1450
}
```

**Filtering logic:**
```typescript
function filterMstrChain(contracts: FMPOptionContract[], mstrPrice: number, expiryWindow: '30d' | '60d' | '90d') {
  const now = new Date();
  const windowDays = { '30d': 30, '60d': 60, '90d': 90 }[expiryWindow];

  // Step 1: Filter to puts only
  const puts = contracts.filter(c => c.type === 'put');

  // Step 2: Find nearest expiry within window
  const targetExpiry = puts
    .map(c => c.expiration)
    .filter(exp => {
      const dte = (new Date(exp).getTime() - now.getTime()) / (1000 * 86400);
      return dte > 0 && dte <= windowDays + 7;
    })
    .sort()
    .at(0);

  // Step 3: Filter to target expiry, ATM ± 5 strikes
  return puts
    .filter(c => c.expiration === targetExpiry)
    .filter(c => c.strike >= mstrPrice * 0.80 && c.strike <= mstrPrice * 1.20)
    .sort((a, b) => a.strike - b.strike);
}
```

**Polling:** Every 5 minutes during market hours. Outside market hours: display last close prices with "Market closed" badge. Timestamp shown next to delay banner.

**Derived: IV Percentile**
```typescript
// Compute from 252-day rolling history of MSTR_IV_30d stored in daily_metrics table
iv_percentile = percentileRank(iv_30d_history_252d, current_iv)
```

#### 6.7.2 BTC Options (Deribit)

**Base URL:** `https://www.deribit.com/api/v2/public/`  
**Auth:** None required for public endpoints.  
**Rate limit:** 20 requests/second — use a single bulk fetch per poll cycle.

**Step 1 — Fetch active BTC option instruments:**
```
GET /get_instruments?currency=BTC&kind=option&expired=false
```
Response: array of instrument objects. Filter to `option_type = 'put'` and `expiration_timestamp` within target window.

**Step 2 — Fetch book summary for filtered instruments:**
```
GET /get_book_summary_by_instrument?instrument_name=BTC-28MAR26-70000-P
```
Or use the bulk endpoint for efficiency:
```
GET /get_book_summary_by_currency?currency=BTC&kind=option
```
Then filter client-side.

**Response fields used:**
```typescript
interface DeribitBookSummary {
  instrument_name:     string;    // "BTC-28MAR26-70000-P"
  bid_price:           number;    // in BTC, e.g. 0.0240
  ask_price:           number;    // in BTC
  mid_price:           number;    // in BTC
  mark_iv:             number;    // implied vol as percentage, e.g. 69.2
  open_interest:       number;    // in contracts (1 BTC each)
  volume:              number;    // 24h volume
  delta:               number;    // e.g. -0.33
  underlying_price:    number;    // BTC spot at time of quote
}
```

**Key difference — BTC price quoting:**  
Deribit prices are in BTC, not USD. To convert to USD:
```typescript
mid_usd = mid_price_btc * btc_spot_price
// e.g. 0.0248 BTC × $70,847 = $1,757
```
Always show both: `0.0248 BTC ($1,757)` in the options table.

**Instrument name parsing:**
```typescript
// "BTC-28MAR26-70000-P"
function parseDeribitName(name: string) {
  const [, expiry, strike, type] = name.split('-');
  return {
    expiry,   // "28MAR26"
    strike:   parseInt(strike),   // 70000
    type:     type === 'P' ? 'put' : 'call',
  };
}
```

**Filtering:** Show puts with strikes from BTC_spot × 0.75 to BTC_spot × 1.15 (ATM ± ~5 strikes at round intervals). Sort by strike ascending.

**Polling:** Every 5 minutes. Deribit is a 24/7 market — no market-hours guard needed. If Deribit API returns error, display last cached prices with amber "Deribit data stale" badge.

**Contract size:** 1 BTC per contract. No multiplier like MSTR's 100× shares.

**Storing Deribit data:**  
Do NOT store Deribit options data in Neon PostgreSQL — it is transient, high-frequency pricing data. Fetch on demand and cache in memory (SWR cache) for the session only. Deribit IV can be stored in `daily_metrics.mstr_iv_30d` field extended to include `btc_iv_30d: number | null` — pull daily ATM value.

#### 6.7.3 New API Route: `/api/data/options`

```typescript
// src/app/api/data/options/route.ts
// export const maxDuration = 30;  // Vercel Pro

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const asset = searchParams.get('asset') as 'mstr' | 'btc';
  const expiry = searchParams.get('expiry') as '30d' | '60d' | '90d';

  if (asset === 'mstr') {
    // Fetch from FMP
    const data = await fetchMstrOptions(expiry);
    return NextResponse.json({ asset: 'mstr', chain: data, delayed_minutes: 15, source: 'FMP' });
  } else {
    // Fetch from Deribit
    const btcSpot = await getBtcSpot();
    const data = await fetchDeribitBtcPuts(expiry, btcSpot);
    return NextResponse.json({ asset: 'btc', chain: data, btc_spot: btcSpot, delayed_minutes: 0, source: 'Deribit' });
  }
}
```

**SWR usage in frontend:**
```typescript
const { data: optionsData } = useSWR(
  `/api/data/options?asset=${asset}&expiry=${expiry}`,
  fetcher,
  {
    refreshInterval: 5 * 60 * 1000,  // 5 minutes
    revalidateOnFocus: false,
    dedupingInterval: 4 * 60 * 1000, // don't re-fetch if within 4min of last call
  }
);
```

---

## 7. Component Library

Claude Code should build these as reusable React components in `src/components/`:

### 7.1 `<KpiCard>`
```typescript
interface KpiCardProps {
  label: string;
  dotColor: string;
  value: string;
  delta?: string;
  deltaType?: 'up' | 'down' | 'neutral';
  footer?: string | ReactNode;
  highlighted?: boolean;    // for BTC Reserve card: applies btc-l background
}
```

### 7.2 `<Badge>`
```typescript
type BadgeVariant = 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'btc' | 'neutral';
interface BadgeProps { variant: BadgeVariant; children: ReactNode; }
```

### 7.3 `<ProgressBar>`
```typescript
interface ProgressBarProps {
  label: string;
  value: string;
  pct: number;
  color: string;
  subtext?: string;
}
```

### 7.4 `<StatRow>`
```typescript
interface StatRowProps {
  cells: Array<{ label: string; value: string; mono?: boolean; color?: string }>;
}
```

### 7.5 `<SignalPanel>`
```typescript
type Signal = 'buy' | 'hold' | 'trim';
interface SignalPanelProps { currentSignal: Signal; strcPrice: number; btcCoverage: number; }
```

### 7.6 `<CoverageMatrix>`
```typescript
interface CoverageMatrixProps {
  strcRate: number;
  seniorTargetRate: number;
  configs: Array<{ name: string; seniorPct: number; juniorPct: number; }>;
}
```

### 7.7 `<TrancheSensitivityTable>`
```typescript
interface TrancheSensitivityTableProps {
  configs: Array<{ seniorPct: number; }>;
  seniorTargetRate: number;
  rateScenarios: number[];
}
```

### 7.8 `<CapitalStackBar>`
```typescript
interface StackSegment { label: string; notional: number; color: string; rate: string; rank: number; }
interface CapitalStackBarProps { segments: StackSegment[]; btcNav: number; highlightTicker?: string; }
```

### 7.9 `<CountdownChip>`
```typescript
interface CountdownChipProps { daysUntil: number; date: string; label: string; }
```

### 7.10 `<OptionsChain>` ← **v2.0 new**

```typescript
interface OptionRow {
  strike: number;
  bid: number;
  ask: number;
  mid: number;          // USD for both MSTR and BTC
  mid_btc?: number;     // BTC denomination (Deribit only)
  iv: number;           // percentage, e.g. 69.2
  delta: number;        // e.g. -0.33
  theta?: number;
  oi: number;
  volume?: number;
  instrument_name?: string;  // Deribit: "BTC-28MAR26-70000-P"
  dte: number;          // days to expiry
  is_atm: boolean;      // strike nearest to current price
}

interface OptionsChainProps {
  asset: 'mstr' | 'btc';
  rows: OptionRow[];
  selectedPutStrike?: number;
  selectedShortPutStrike?: number;  // put spread short leg
  selectedCallStrike?: number;      // collar call
  strategy: 'atm_put' | 'put_spread' | 'collar';
  onSelectRow: (row: OptionRow, legType: 'put' | 'short_put' | 'call') => void;
  isLoading: boolean;
  delayMinutes: number;
  lastUpdated: string;
}
```

Row highlight logic:
- ATM row: `--violet-l` background + ATM badge
- Selected put: `--accent-l` background + `●` prefix on strike
- Selected short put (spread): `--green-l` + `↑` prefix (credit leg)
- Selected call (collar): `--green-l` + `↑` prefix (credit leg)
- Low OI (< 100): `opacity: 0.45; cursor: not-allowed`

### 7.11 `<HedgeCalculator>` ← **v2.0 new**

```typescript
interface HedgeCalculatorState {
  positionSize: number;
  asset: 'mstr' | 'btc';
  strategy: 'atm_put' | 'put_spread' | 'collar';
  hedgeRatioPct: number;
  selectedPut: OptionRow | null;
  selectedShortPut: OptionRow | null;   // put spread
  selectedCall: OptionRow | null;        // collar
}

interface HedgeCalculatorOutputs {
  hedgeNotional: number;
  contracts: number;
  premiumNet: number;         // net of any credits (spread, collar)
  annCostPct: number;         // with 1.15× roll friction
  netHedgedYield: number;
  spreadVsSofr_bps: number;
  monthlyIncomeNet: number;
  breakevenStrcRate: number;
}

interface HedgeCalculatorProps {
  state: HedgeCalculatorState;
  outputs: HedgeCalculatorOutputs;
  onStateChange: (partial: Partial<HedgeCalculatorState>) => void;
  // Reference data
  strcEffectiveYield: number;
  sofr1m: number;
  betaMstrStrc30d: number;
  betaBtcStrc30d: number;
  mstrPrice: number;
  btcSpot: number;
}
```

### 7.12 `<RiskScoreGauge>` ← **v2.0 new**

```typescript
interface RiskScoreComponents {
  btc:    number;   // 0–10
  yield:  number;
  strike: number;
  iv:     number;
  days:   number;
}

interface RiskScoreGaugeProps {
  composite: number;           // 0–10
  components: RiskScoreComponents;
  weights: { btc: 0.30; yield: 0.25; strike: 0.20; iv: 0.15; days: 0.10 };
}
```

Render: composite score headline + color + 10-segment bar, then 5 component rows each with label / score / proportional bar / weight%. Do not show raw weight numbers to user — show weight as relative bar width or `(30%)` parenthetical label in muted color.

---

### 7.13 `<VolumeATMTracker>` ← **v2.1 new**

```typescript
interface ATMEvent {
  date:          string;      // ISO date of 8-K filing
  proceeds_usd:  number;      // e.g. 400_000_000
  shares_issued: number;      // e.g. 4_620_000
  issue_price:   number;      // weighted avg price of issuance window
  lp_at_time:    number;      // LP on date of filing
  remaining_cap: number;      // authorized − cumulative deployed after this event
  is_confirmed:  boolean;     // from EDGAR vs. estimated
}

interface VolumeDayPoint {
  date:           string;
  volume:         number;     // shares traded
  avg_20d:        number;     // rolling 20-session average
  vol_ratio:      number;     // volume / avg_20d
  has_atm_event:  boolean;    // true if ATM 8-K filed on this date
  atm_proceeds?:  number;     // $M if ATM event on this day
}

interface VolumeATMTrackerProps {
  volumeHistory:  VolumeDayPoint[];   // all available trading days since IPO
  atmEvents:      ATMEvent[];         // confirmed + estimated events
  authorized:     number;             // $4,200,000,000
  deployed:       number;             // cumulative proceeds
  timeRange:      '1m' | '3m' | 'all';
  onRangeChange:  (range: '1m' | '3m' | 'all') => void;
}
```

**KPI strip (6 cells):** Today Volume / 20d Avg / Vol Ratio (with color badge) / ATM Deployed / Remaining Cap / 90d Pace ($/month)

**Chart:** Chart.js mixed type — blue volume bars (left Y, K shares) + 20d avg dashed line + narrow orange bars for ATM event amounts (right Y #1, $M) + violet stepped cumulative line (right Y #2, $B). Three Y-scales: `yVol` (left), `yAtm` (right), `yCumul` (right, `offset: true` to prevent axis collision).

**Volume signal logic:**
- `vol_ratio ≥ 2.0×` and `!has_atm_event` → amber bar border: potential pre-issuance
- `vol_ratio ≥ 3.0×` and `!has_atm_event` → red bar border: anomalous volume  
- Never surface as an automated alert — visual pattern only

**ATM event log:** Scrollable list below chart, newest-first. Columns: Date / Proceeds / Shares / Issue Price / LP at Time / Remaining. `is_confirmed: false` rows show `~` prefix and amber `Est.` badge. Proceeds badge green/amber/red based on amount vs. prior event.

**Data notes:**
- Volume: from `price_history.volume_strc` — already in pipeline (FMP daily OHLCV)
- ATM events: from `atm_issuance` table — populated by EDGAR 8-K parser
- 8-K filing date lags actual issuance window close by 2–5 days; do NOT attempt to align with volume spikes — show independently

---

## 8. Chart Specifications

### 8.1 Chart Library

**Primary:** Recharts — native React integration.  
**Fallback:** Chart.js via `react-chartjs-2`.

### 8.2 Global Chart Defaults

```typescript
{
  fontFamily: "'DM Mono', monospace",
  fontSize: 10,
  color: '#9B9890',
  gridColor: 'rgba(0,0,0,0.05)',
  tooltipBackground: '#0D0C0A',
  tooltipBodyColor: '#FFFFFF',
  tooltipCornerRadius: 8,
  tooltipPadding: 10,
}
```

### 8.3 Chart Type Assignments

| Chart | Type | Component |
|---|---|---|
| STRC Price + Rate | Dual-axis ComposedChart | `<ComposedChart>` |
| Capital Stack | Vertical bar + reference line | `<BarChart>` |
| BTC Coverage scenarios | Horizontal bar | `<BarChart layout="vertical">` |
| mNAV history | Area line + threshold lines | `<AreaChart>` |
| Recovery curve | Step area | `<AreaChart stepType="step">` |
| Rate floor scenarios | Multi-line | `<LineChart>` |
| Rate history | Mixed bar + line | `<ComposedChart>` |
| SOFR Forward Curve (SR1) | Line + reference | `<LineChart>` |
| Rate projection 12mo | Multi-line (3 scenarios) | `<LineChart>` |
| Rolling correlation | Multi-line | `<LineChart>` |
| Excess spread history | Multi-line (3 configs) | `<LineChart>` |
| **Volume + ATM combined** | **Mixed bar + line + stepped** | **Chart.js mixed (3 Y-axes)** |
| Hedge yield comparison | Bar | `<BarChart>` |
| BTC Coverage gauge | Custom SVG arc | Custom component |

### 8.4 Chart Interaction Rules

- All charts: hover tooltip enabled
- Tooltips: dark background, monospace numbers
- No library-rendered legends — use custom `<ChartLegend>` above chart
- Price chart: vertical hairline crosshair on hover
- Charts do not re-animate on data updates — update in place

---

## 9. Data Binding Map

### 9.1 `/api/data/snapshot`

```typescript
interface DashboardSnapshot {
  strc_price:              number;
  strc_par_spread_bps:     number;
  strc_rate_pct:           number;
  strc_rate_since_ipo_bps: number;
  strc_effective_yield:    number;
  mnav:                    number;
  mnav_regime:             string;
  mnav_30d_trend:          number;
  mnav_confidence_low:     number;
  mnav_confidence_high:    number;
  btc_price:               number;
  btc_24h_pct:             number;
  btc_holdings:            number;
  btc_nav:                 number;
  btc_coverage_ratio:      number;
  btc_impairment_price:    number;
  usd_reserve:             number;
  usd_coverage_months:     number;
  total_annual_obligations:number;
  strc_atm_deployed:       number;
  strc_atm_authorized:     number;
  mstr_atm_deployed_est:   number;
  mstr_atm_authorized:     number;
  sofr_1m_pct:             number;
  days_to_announcement:    number;
  min_rate_next_month:     number;
  lp_current:              number;
  lp_formula_active:       boolean;
  atm_last_confirmed_date: string;
  dividend_stopper_active: boolean;
  btc_yield_ytd:           number;
  btc_dollar_gain_ytd:     number;
  btc_conversion_rate:     number;
  mnav_breakeven_btc:      number;
  is_market_open:          boolean;
  last_updated:            string;
  // Volume summary (from price_history — latest session)
  strc_volume_today:       number;     // shares
  strc_volume_avg_20d:     number;     // 20-session rolling avg
  strc_volume_ratio:       number;     // today / avg_20d
  atm_deployed_total:      number;     // cumulative $
  atm_remaining:           number;     // authorized − deployed
  atm_pace_90d_monthly:    number;     // trailing 90d pace per month ($)
}
```

### 9.2 `/api/data/history`

```typescript
interface HistoryResponse {
  prices: Array<{ date: string; strc: number; mstr: number; btc: number }>;
  rates:  Array<{ date: string; rate_pct: number; sofr_pct: number; is_confirmed: boolean }>;
  mnav:   Array<{ date: string; mnav: number; mnav_low: number; mnav_high: number }>;
  vol:    Array<{ date: string; vol_30d_strc: number; vol_90d_strc: number }>;
  corr:   Array<{ date: string; corr_strc_mstr_30d: number; corr_strc_btc_30d: number }>;
  sofr_forward: Array<{ month_n: number; implied_sofr: number }>;  // SR1 futures curve
}
```

### 9.3 `/api/data/tranche`

```typescript
interface TrancheResponse {
  strc_rate_pct: number;
  pool_nav:      number;
  senior_nav_per_unit: number;
  junior_nav_per_unit_a: number;
  monthly_income_pool: number;
  configs: Array<{
    name: 'A' | 'B' | 'C';
    senior_pct: number;
    junior_pct: number;
    junior_yield_pct: number;
    scr: number; est: number; rfb: number; floor_pct: number;
    scr_status: 'pass' | 'watch' | 'cash_trap' | 'eod';
    est_status: 'pass' | 'watch' | 'cash_trap' | 'eod';
    rfb_status: 'pass' | 'watch' | 'cash_trap' | 'eod';
    excess_spread_history: Array<{ date: string; est_pct: number }>;
  }>;
}
```

### 9.4 `/api/data/volatility`

```typescript
interface VolatilityResponse {
  instruments: Array<{
    ticker: string;
    vol_30d: number; vol_90d: number; vol_ratio: number;
    iv_30d: number | null;    // MSTR only (FMP options)
    iv_60d: number | null;    // MSTR only
    iv_percentile: number | null;  // 252-day rolling
    beta_btc_30d: number | null;
    beta_btc_90d: number | null;
    beta_mstr_30d: number | null;
    beta_mstr_90d: number | null;
    signal: 'normal' | 'watch' | 'stress';
  }>;
  corr_history: Array<{
    date: string;
    strc_mstr_30d: number; strc_mstr_90d: number; strc_btc_30d: number;
  }>;
}
```

### 9.5 `/api/data/options` ← **v2.0 new**

```typescript
interface OptionsResponse {
  asset: 'mstr' | 'btc';
  expiry_label: string;        // "30d" | "60d" | "90d"
  actual_expiry_date: string;  // "2026-03-28"
  dte: number;                 // days to expiry
  spot_price: number;          // MSTR price or BTC spot
  btc_spot?: number;           // included for BTC asset
  chain: OptionRow[];          // filtered chain (ATM ± 5 strikes)
  delayed_minutes: number;     // 15 for FMP, 0 for Deribit
  source: 'FMP' | 'Deribit';
  last_updated: string;        // ISO timestamp
}
```

### 9.6 `/api/data/volume-atm` ← **v2.1 new**

```typescript
interface VolumeATMResponse {
  // KPI strip values
  volume_today:          number;      // shares traded today (or last session)
  volume_avg_20d:        number;      // rolling 20-session average
  volume_ratio:          number;      // today / avg_20d
  atm_authorized:        number;      // $4,200,000,000
  atm_deployed:          number;      // cumulative proceeds to date
  atm_remaining:         number;      // authorized − deployed
  atm_pace_90d_monthly:  number;      // avg monthly pace, trailing 90 calendar days

  // Time series for chart — all trading days since IPO
  volume_history: Array<{
    date:            string;
    volume:          number;    // raw shares
    avg_20d:         number;    // 20-session rolling avg
    vol_ratio:       number;    // volume / avg_20d
    has_atm_event:   boolean;
    atm_proceeds_m?: number;    // $M on event days, null otherwise
  }>;

  // Cumulative line (aligned to volume_history dates)
  cumulative_atm: Array<{
    date:        string;
    cumulative:  number;    // $B deployed through this date
  }>;

  // ATM event log — for the event table
  atm_events: Array<{
    date:          string;
    proceeds_usd:  number;
    shares_issued: number;
    issue_price:   number;
    lp_at_time:    number;
    remaining_cap: number;
    is_confirmed:  boolean;
  }>;
}
```

**Route:** `src/app/api/data/volume-atm/route.ts`

```typescript
export async function GET() {
  const [volumeRows, atmRows] = await Promise.all([
    db.select().from(price_history)
      .where(eq(price_history.ticker, 'STRC'))
      .orderBy(asc(price_history.date))
      .limit(300),   // ~14 months of trading days; IPO was Jul 2025
    db.select().from(atm_issuance)
      .orderBy(asc(atm_issuance.filed_date)),
  ]);

  // Build cumulative ATM line aligned to trading days
  // Build volume_history array with rolling avg and atm_proceeds overlay
  // Compute KPI summary values
  // Return VolumeATMResponse
}
```

**Polling:** Every 60 seconds during market hours (volume updates intraday). Outside market hours: poll once on page load only (volume won't change). ATM events only change when EDGAR parser fires — no need to poll the event log separately.

---

### 9.7 Update Frequencies

| Component | Interval | Notes |
|---|---|---|
| KPI Strip | 60s (market hours) | Stop polling after hours |
| Options Chain | 5 min | Both MSTR (FMP) and BTC (Deribit) |
| Calculator outputs | Real-time | Computed client-side from options state |
| Risk score | Real-time | Computed client-side from calc state |
| Vol/beta table | Daily | On page load |
| Tranche metrics | On STRC rate change | Monthly effectively |
| SOFR forward curve | Daily | On Rate Engine load |
| **Volume + ATM tracker** | **60s (market hours) · once on load (after hours)** | **ATM event log: on EDGAR parse only** |

---

## 10. Interaction Patterns

### 10.1 Loading States

**Initial load:** Skeleton shimmer on card areas — never show zeroes.

```css
.skeleton {
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 50%, var(--surface) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 6px;
}
```

**Options chain loading:** Show skeleton rows (4–6 rows) with pulsing animation. Preserve table column widths so layout doesn't shift on data arrival.

### 10.2 Options Chain Interactions

- **Click row to select:** Immediately updates calculator state and recalculates all outputs
- **Strategy switch:** Deselects short put / call row. Re-suggests default secondary leg.
- **Put Spread — second leg auto-suggestion:** When long put selected, auto-highlight the strike at ~−15% OTM as the suggested short put with amber `Suggested short leg` badge. User can click any other row to override.
- **Collar — call suggestion:** When put selected, load call sub-table showing strikes at ATM +5% to +20%. Auto-suggest +10% OTM call.
- **Low-OI row click:** Show tooltip "Low open interest — this strike may be hard to fill at mid price." Allow selection but add amber warning in cost breakdown.

### 10.3 Stale Data Warning

Options chain: if `last_updated` > 10 minutes ago (during market hours), replace the delay banner with:
```
⚠️ Options data may be older than expected. Last update: [time]. FMP API may be experiencing delays.
```

### 10.4 Alert System

**Alerts button** (topbar): opens right slide-over with:
- Active alerts (e.g. "USD Coverage below 12 months", "Config C RFB < 3%")
- Alert history
- No user-configurable thresholds in v1

### 10.5 Rate Announcement Banner

When new STRC rate announced (EDGAR parser):
- Non-dismissable banner for 24 hours
- Background: `--violet-l`, text: "New rate: 11.25% → X.XX% effective [date]"
- Options calculator automatically recalculates all tranche metrics on rate change

---

## 11. Accessibility Requirements

- All interactive elements: visible focus ring (`outline: 2px solid var(--accent)`)
- Color never the sole differentiator — badges always include text
- Charts: `aria-label` descriptions
- Tables: `<th scope="col">` and `<th scope="row">`
- Options chain: keyboard-navigable rows (Tab + Enter to select)
- Calculator inputs: labeled with `<label>` or `aria-label`
- Risk score: `aria-label="Composite risk score: 7.8 out of 10"`
- Live polling regions: `aria-live="polite"` on KPI strip
- Minimum contrast: 4.5:1 for all text

---

## 12. Implementation Notes for Claude Code

### 12.1 Build Order (Updated v2.0)

```
1. Design system setup
   → src/styles/tokens.css
   → Google Fonts in layout.tsx
   → Global chart config in src/lib/chart-config.ts

2. Shell components
   → Sidebar, Topbar, responsive shell

3. Core component library
   → KpiCard, Badge, ProgressBar, StatRow, SignalPanel
   → CapitalStackBar, CoverageMatrix, TrancheSensitivityTable

4. Overview view (mock → API)

5. API integration: /api/data/snapshot, /api/data/history

6. Risk Analysis view

7. Rate Engine view (add SOFR forward curve from SR1)

8. Volatility view (reference hedge calculators only — not interactive)

9. Position Modes — Mode 1 (Long)

10. Options data layer                   ← NEW
    → src/lib/options/fmp-client.ts       (MSTR puts via FMP)
    → src/lib/options/deribit-client.ts   (BTC puts via Deribit)
    → src/lib/options/filter.ts           (ATM ± 5 filter logic)
    → /api/data/options route
    → SWR hook: useOptionsChain(asset, expiry)

11. Volume + ATM Issuance Tracker        ← NEW (v2.1)
    → Verify price_history.volume_strc populated by existing FMP pipeline
    → Verify atm_issuance table populated by EDGAR parser
    → /api/data/volume-atm route (rolling avg, cumulative, event list)
    → VolumeATMTracker component (mixed chart + KPI strip + event log)
    → Wire to Overview — position after Flywheel row

12. Position Modes — Mode 2 (Options Calculator)    ← NEW
    → HedgeCalculator component (inputs + state)
    → OptionsChain component (table + row selection)
    → HedgeCostBreakdown component (per strategy)
    → HedgeOutputs component (8 output tiles)
    → RiskScoreGauge component (composite + 5 components)
    → Wire all to /api/data/options

13. Tranche Product view
```

### 12.2 Calculator State Management

The options calculator has enough state complexity to warrant a dedicated state file rather than local component state:

```typescript
// src/lib/calculator/hedge-calculator-state.ts

export interface HedgeCalcState {
  positionSize: number;
  asset: 'mstr' | 'btc';
  strategy: 'atm_put' | 'put_spread' | 'collar';
  expiry: '30d' | '60d' | '90d';
  hedgeRatioPct: number;
  selectedPut: OptionRow | null;
  selectedShortPut: OptionRow | null;
  selectedCall: OptionRow | null;
  isHedgeRatioOverridden: boolean;   // tracks if user manually changed the ratio
}

export const DEFAULT_STATE: HedgeCalcState = {
  positionSize: 1_000_000,
  asset: 'mstr',
  strategy: 'atm_put',
  expiry: '30d',
  hedgeRatioPct: 22,                // will be overwritten by live beta on load
  selectedPut: null,
  selectedShortPut: null,
  selectedCall: null,
  isHedgeRatioOverridden: false,
};
```

Use `useReducer` rather than multiple `useState` calls — the outputs depend on multiple state fields simultaneously.

### 12.3 IV Percentile Calculation

```typescript
// src/lib/options/iv-percentile.ts
// Run daily in the daily_metrics cron job

export async function calcIvPercentile(db: DB): Promise<number> {
  const history = await db
    .select({ iv: daily_metrics.mstr_iv_30d })
    .from(daily_metrics)
    .orderBy(desc(daily_metrics.date))
    .limit(252)
    .where(isNotNull(daily_metrics.mstr_iv_30d));

  const values = history.map(r => r.iv).sort((a, b) => a - b);
  const current = values.at(-1) ?? 0;
  const rank = values.filter(v => v <= current).length;
  return Math.round((rank / values.length) * 100);
}
```

Store result in `daily_metrics.mstr_iv_percentile_252d: numeric(5,2)`.

### 12.4 Deribit Error Handling

```typescript
// src/lib/options/deribit-client.ts

export async function fetchDeribitBtcPuts(
  expiry: '30d' | '60d' | '90d',
  btcSpot: number
): Promise<OptionRow[]> {
  try {
    const res = await fetch(
      'https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option',
      { next: { revalidate: 300 } }  // 5min cache via Next.js fetch
    );
    if (!res.ok) throw new Error(`Deribit ${res.status}`);
    const { result } = await res.json();
    return parseDeribitPuts(result, expiry, btcSpot);
  } catch (err) {
    console.error('Deribit fetch failed:', err);
    return [];  // caller displays stale badge, empty table state
  }
}
```

Never throw on Deribit failures — the MSTR options calculator should remain fully functional even if Deribit is down.

### 12.5 Data Formatting Utilities

```typescript
// src/lib/utils/format.ts
export const fmt = {
  price:      (v: number) => `$${v.toFixed(2)}`,
  pct:        (v: number) => `${v.toFixed(2)}%`,
  bps:        (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}bps`,
  mult:       (v: number) => `${v.toFixed(2)}×`,
  usdB:       (v: number) => `$${(v/1e9).toFixed(2)}B`,
  usdM:       (v: number) => `$${(v/1e6).toFixed(0)}M`,
  usdK:       (v: number) => `$${(v/1e3).toFixed(0)}K`,
  btcAmt:     (v: number) => `${v.toFixed(4)} BTC`,
  btcUsd:     (btc: number, spot: number) => `${btc.toFixed(4)} BTC ($${(btc*spot).toFixed(0)})`,
  contracts:  (n: number) => `${n} contract${n !== 1 ? 's' : ''}`,
  delta:      (v: number, unit = '') => `${v > 0 ? '▲ +' : '▼ '}${Math.abs(v).toFixed(2)}${unit}`,
  score:      (v: number) => v.toFixed(1),
};
```

### 12.6 Market Hours Guard

```typescript
// src/lib/utils/market-hours.ts
export function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const hour = et.getHours() + et.getMinutes() / 60;
  return day >= 1 && day <= 5 && hour >= 9.5 && hour < 16;
}
// Note: Deribit (BTC options) trades 24/7 — do NOT gate Deribit polling by market hours
```

### 12.7 Environment Variables (Updated)

```env
# Existing
NEON_DATABASE_URL=...
NEON_DATABASE_DIRECT_URL=...
FMP_API_KEY=...
FRED_API_KEY=...

# New — no key required for Deribit public API
# But add this for documentation and future authenticated endpoints:
DERIBIT_API_URL=https://www.deribit.com/api/v2/public
```

---

## Appendix C — Color Usage Quick Reference

| Element | Token | Hex |
|---|---|---|
| STRC price, primary metrics | `--accent` | `#0052FF` |
| mNAV, hold signal | `--amber` | `#FF9500` |
| Bitcoin price, BTC NAV | `--btc` | `#F7931A` |
| Dividend rate, SOFR, hedge cost | `--violet` | `#7C3AED` |
| Safe status, buy signal | `--green` | `#00A86B` |
| Alert, trim signal, negative | `--red` | `#FF3B30` |
| Primary text | `--t1` | `#0D0C0A` |
| Secondary text | `--t2` | `#5C5955` |
| Tertiary text / timestamps | `--t3` | `#9B9890` |

**Badge classes:**

| Class | Background | Text | Use |
|---|---|---|---|
| `badge-green` | `--green-l` | `--green` | Safe / pass / confirmed |
| `badge-amber` | `--amber-l` | `--amber` | Watch / estimated / elevated |
| `badge-red` | `--red-l` | `--red` | Alert / fail / critical |
| `badge-blue` | `--accent-l` | `--accent` | Informational / price |
| `badge-violet` | `--violet-l` | `--violet` | Rate / SOFR / LP / announcement dates |
| `badge-btc` | `--btc-l` | `--btc-d` | BTC-denominated values / ATM events |
| `badge-neutral` | `--surface-2` | `--t2` | Labels / metadata / counts |

## Appendix D — Options Calculator Decision Log

| Decision | Choice | Rationale |
|---|---|---|
| Options vs short-selling | Options primary | Defined risk, no borrow cost volatility, cleaner P&L |
| MSTR options source | FMP (`/v3/options/MSTR`) | Already in Phase 1 spec, reliable, 15-min delay acceptable |
| BTC options source | Deribit public API | Dominant venue globally, free, no auth, 20 req/s |
| BTC options caching | SWR in-memory only | Not stored in Postgres — transient pricing data |
| Default strategy | ATM Put | Most protective, simplest, best for first-load communication |
| Collar: include | Yes | Near-zero cost collar is compelling for STRC context given high yield |
| OI filter | Grey < 100 OI | Visible but flagged — user informed, not silently excluded |
| Default position size | $1,000,000 | Matches existing example sizing throughout spec |
| Risk score type | Quantitative composite (5 inputs, weighted) | Reproducible, explainable, no qualitative overrides |
| Roll friction | 1.15× premium | 15% friction is conservative standard assumption for retail roll |

---

*End of Phase 2 Document v2.2 — STRC Intelligence Platform*  
*Accompanying files: `strc_dashboard_v5.html` (full interactive wireframe — all design review fixes applied)*  
*Previous versions: `strc_platform_phase2_v1_backup.md` (v1.0), `strc_dashboard_v3.html` (v2.0), `strc_dashboard_v4.html` (v2.1)*  
*Next: Phase 3 — Data Architecture & API Mapping Specification*
