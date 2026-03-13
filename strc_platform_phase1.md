# STRC Intelligence Platform — Phase 1: Product & Data Specification

**Version:** 1.0  
**Date:** March 2026  
**Purpose:** Complete product, data, and architecture specification for the STRC Intelligence Platform. This document is the authoritative reference for Claude Code implementation across all subsequent build phases.

---

## Table of Contents

1. [STRC Instrument Specification](#1-strc-instrument-specification)
2. [Full Capital Stack](#2-full-capital-stack)
3. [Bitcoin Accumulation Flywheel Mechanics](#3-bitcoin-accumulation-flywheel-mechanics)
4. [Six Risk Dimensions — Formulas and Thresholds](#4-six-risk-dimensions--formulas-and-thresholds)
5. [Volatility and Beta Framework](#5-volatility-and-beta-framework)
6. [Yield Strategies — Position Modes](#6-yield-strategies--position-modes)
7. [Leveraged Tranche Product Specification](#7-leveraged-tranche-product-specification)
8. [Complete Metric Dictionary](#8-complete-metric-dictionary)
9. [Data Source Map](#9-data-source-map)
10. [Estimation Models](#10-estimation-models)
11. [Neon PostgreSQL Schema](#11-neon-postgresql-schema)
12. [Pipeline Architecture](#12-pipeline-architecture)
13. [Tech Stack and Deployment Specification](#13-tech-stack-and-deployment-specification)

---

## 1. STRC Instrument Specification

### 1.1 Core Terms (from Certificate of Designations, July 28 2025)

| Parameter | Value |
|---|---|
| Full name | Variable Rate Series A Perpetual Stretch Preferred Stock |
| Ticker | STRC (Nasdaq) |
| Par value | $0.001 per share |
| Stated Amount | $100.00 per share |
| IPO price | $90.00 per share |
| IPO date | July 29, 2025 |
| IPO shares | 28,011,111 |
| IPO net proceeds | ~$2.474B |
| Current outstanding (as of Q4 2025) | ~$3.4B aggregate stated amount |
| ATM program authorized | $4.2B |
| Initial dividend rate | 9.00% per annum |
| Current dividend rate (as of Feb 2026) | 11.25% per annum |
| Dividend type | Cumulative |
| Payment frequency | Monthly — last calendar day of each month |
| First payment date | August 31, 2025 |
| Record date | 15th calendar day of each payment month |
| Tax treatment | Return of Capital (ROC) — expected for 10+ years |
| Seniority (dividends) | Junior to STRF; senior to STRK, STRD, MSTR common |
| Seniority (liquidation) | Junior to converts and STRF; senior to STRK, STRD, MSTR common |
| Collateralization | **NOT directly collateralized by BTC** — indirect claim on residual assets only |

### 1.2 Rate Reset Mechanism (Critical)

The Monthly Regular Dividend Rate Per Annum resets at company discretion before the first Business Day of each calendar month, subject to the following hard constraints from the Certificate of Designations:

**Hard Floor 1 — Cannot go negative:** Rate ≥ 0.00%

**Hard Floor 2 — SOFR floor:** Rate ≥ Monthly SOFR Per Annum as of the notification date.
- Monthly SOFR Per Annum = 1-Month Term SOFR, sourced from CME Group: https://www.cmegroup.com/market-data/cme-group-benchmark-administration/term-sofr.html

**Hard Floor 3 — 25bps/month reduction cap:**
```
Min rate for period T = Rate(T-1) - [25bps + max(0, SOFR(T-1_start) - min_SOFR_during(T-1))]
```
Meaning: the company may only reduce the rate by at most 25bps per month plus any net decline in SOFR during the prior period.

**Hard constraint — accrued dividend blocker:** The company cannot reduce the rate at all if any accumulated Regular Dividends for prior completed periods remain unpaid.

**Implication for yield engineering:** The rate is asymmetric. Increases are unconstrained (company can raise freely). Decreases are capped at ~25bps/month. A rate of 13% takes a minimum of ~14 months to reduce to 9.75% (the SOFR floor today at ~4.3%). This creates a structural long volatility position for STRC holders during stress: rising BTC stress → price falls below par → company raises rate → yield increases.

**Maximum reduction path formula:**
```
Rate_floor(n months from now) = max(SOFR_forward(n), Rate_current - (n × 25bps))
```

### 1.3 Dynamic Liquidation Preference

The Liquidation Preference (LP) is not simply $100. It adjusts dynamically:

```
LP = max(
  $100,                                          -- Stated Amount floor
  Last_Close_Price(prior trading day),           -- if ATM issuance active in last 10 days
  Average(Last_Close_Prices, trailing_10_days)   -- if ATM issuance active in last 10 days
)
```

When no ATM issuance has occurred in the **trailing 10 calendar days**, LP = $100 flat.

**Implementation note for Claude Code:** To determine whether ATM is "active in last 10 days," query `atm_issuance` (ticker='STRC') and check whether the most recent confirmed row has a `report_date` within 10 calendar days of today. If yes, apply the full max() formula. If no, LP = $100. When ATM is active but no confirming 8-K has arrived yet, default to the max() formula — LP can only ratchet up, never silently reset down.

**Implication:** If STRC trades above $100 during active ATM issuance (e.g., $103), the LP ratchets up to $103. In a wind-down scenario following such a period, holders would be entitled to $103 + accrued dividends, not just $100.

### 1.4 Dividend Stopper Mechanism

When STRC dividends are not paid in full for any period, a **dividend stopper** activates:
- No dividends may be declared or paid on any Dividend Junior Stock (STRK, STRD, MSTR common)
- No share repurchases on any Junior Stock
- This continues until all accumulated STRC dividends are paid in full

The stopper makes STRC a de facto veto on junior capital distributions — a meaningful structural protection.

### 1.5 Fundamental Change Put Right

Holders may require repurchase at LP + accrued dividends upon:
- Any person or group acquiring >50% of voting power (excluding: company, subsidiaries, Permitted Parties)
- Sale of substantially all company assets
- Merger/consolidation where existing shareholders end up with <50% of surviving entity

**Critical carve-out — Permitted Party exception:** Michael J. Saylor, his heirs, and his affiliates are explicitly defined as "Permitted Parties" and are excluded from triggering a Fundamental Change. Saylor can increase his control stake without triggering the put right.

### 1.6 Redemption Rights

| Type | Condition |
|---|---|
| Optional Redemption | Company's option, at any time after Nasdaq listing (already listed) |
| Clean-Up Redemption | When <10% of original issuance remains outstanding |
| Tax Redemption | Upon adverse tax law changes affecting the company |
| Fundamental Change | Holder put right — see 1.5 above |

**Redemption Price** = LP (as defined in 1.3) + accrued and unpaid dividends.

### 1.7 Voting Rights

STRC holders vote alongside STRF as a single class (not with MSTR common) on:
- Issuance of any stock ranking senior or equal to STRC
- Amendments to CoD that adversely affect STRC rights
- Certain merger/restructuring events

Threshold: majority of outstanding STRC + STRF shares voting together.

---

## 2. Full Capital Stack

### 2.1 Liquidation Priority (Senior to Junior)

```
1. Convertible Notes          ~$8.2B outstanding  4.4yr avg maturity  Senior unsecured debt
2. STRF (Strife)              ~$711M              10% fixed cumulative  Quarterly payments
3. STRC (Stretch)             ~$3.4B              Variable rate cumulative  Monthly payments  ← FOCUS
4. STRK (Strike)              ~$700M est.         8% fixed cumulative  Convertible to MSTR
5. STRD (Stride)              ~$1.0B              10% fixed NON-cumulative  Quarterly payments
6. MSTR Common Equity         Residual            No dividend until all preferreds current
```

**Important disclaimer (from Strategy.com investor disclosure):** The Company's preferred securities are not collateralized by the Company's bitcoin holdings and only have a preferred claim on the residual assets of the company.

**Note on "STRE":** Strategy's public disclosure lists STRE alongside STRF/STRC/STRK/STRD. STRE does not appear in other public filings reviewed for this spec and may be a placeholder/future instrument or a disclosure artifact. Do NOT create a data row or schema entry for STRE until its Certificate of Designations or a Form 8-K confirms its existence and terms. If encountered in an 8-K parse, flag it for manual review rather than silently ignoring it.

### 2.2 Dividend Priority Details

| Instrument | Dividend vs STRC |
|---|---|
| STRF | **Senior** — must be current before STRC gets paid |
| STRC | **Parity with itself** — but no Dividend Parity Stock currently defined |
| STRK | **Junior** — dividend stopper blocks STRK if STRC is unpaid |
| STRD | **Junior** — additionally, non-cumulative (missed = gone) |
| MSTR common | **Junior** — last to receive any distribution |

### 2.3 Annual Dividend Obligations (as of Q4 2025)

| Instrument | Notional | Rate | Annual Cost |
|---|---|---|---|
| Convertible Notes | $8.2B | ~0.6% blended | ~$49M interest |
| STRF | $711M | 10.0% | ~$71M |
| STRC | $3.4B | 11.25% | ~$383M |
| STRK | ~$700M est. | 8.0% | ~$56M |
| STRD | $1.0B | 10.0% | ~$100M |
| **Total** | | | **~$659–689M** |

Note: Q3 2025 earnings cited $689M total annual interest and dividend obligations. STRC has grown since then; current run rate is likely $720–750M+.

### 2.4 USD Reserve

As of Q4 2025 / Feb 2026: **$2.25B USD Reserve**  
Coverage: ~2.5 years of total dividend and interest obligations at current rates  
Target policy: minimum 12 months, goal 24+ months  
Funding mechanism: MSTR ATM equity issuance (not BTC sales)

---

## 3. Bitcoin Accumulation Flywheel Mechanics

### 3.1 mNAV Formula

```
mNAV = MSTR_Market_Cap / BTC_NAV

BTC_NAV = (BTC_Holdings × BTC_Price) + Software_Business_Value

Software_Business_Value ≈ $100M (negligible, effectively ignored in practice)
```

Current values (March 2026):
- BTC Holdings: ~738,731 BTC
- BTC Price: ~$70,800
- BTC NAV: ~$52.3B
- MSTR Market Cap: ~$63B (estimated at ~1.2x mNAV)
- mNAV: ~1.2x (down from peak 3.4x in late 2024)

### 3.2 mNAV Regime Thresholds (from Strategy SEC filings)

| mNAV Range | Strategy Behavior |
|---|---|
| > 4.0x | Actively issue MSTR to acquire Bitcoin |
| 2.5x – 4.0x | Opportunistically issue MSTR to acquire Bitcoin |
| < 2.5x | Tactically issue MSTR to (1) pay interest/dividends (2) fund preferred dividends (3) when otherwise advantageous |
| < 1.0x | Consider issuing credit instruments to repurchase MSTR |

**Current regime (1.2x):** Tactical mode — MSTR issuance funds dividends and reserve, not BTC accumulation. USD Gain per dollar issued = (mNAV - 1.0) = ~$0.20 per dollar raised.

### 3.3 The Flywheel Loop

```
Step 1: Issue preferred stock (STRC ATM) or common equity (MSTR ATM)
         → Raise cash proceeds
Step 2: Deploy proceeds into BTC purchases (when mNAV > 1.0x and in accumulation mode)
         → Increase BTC holdings
Step 3: Higher BTC holdings → higher BTC NAV
         → If MSTR premium holds, mNAV-adjusted market cap rises
Step 4: Rising MSTR share price enables further accretive ATM issuance
         → Reinforces ability to raise more capital → back to Step 1

Interruption conditions:
- BTC price decline → MSTR falls harder than BTC (MSTR beta to BTC > 1.0)
  → MSTR_MarketCap falls faster than BTC_NAV → mNAV compresses toward 1.0x
  → ATM issuance generates less USD gain per dollar raised → flywheel slows
- MSTR market cap compression independent of BTC (premium collapse without BTC move)
  → mNAV falls toward 1.0x → ATM issuance approaches dilutive territory → flywheel stalls
- Both conditions together (BTC down + premium collapse) → mNAV can fall below 1.0x
  → ATM issuance becomes value-destructive → company switches to credit issuance mode

Note: if BTC falls while MSTR market cap held constant, mNAV would mathematically
rise (smaller denominator). In practice MSTR has beta > 1 to BTC and falls harder,
so BTC declines empirically compress mNAV. The dashboard mNAV trend (30-day slope)
captures this dynamic and is more useful than the spot reading alone.
```

### 3.4 BTC Yield Metric

```
BTC_Yield = (BTC_per_diluted_share_end - BTC_per_diluted_share_start) / BTC_per_diluted_share_start
```

2025 full year: 22.8%  
Interpretation: despite massive share dilution from ATM programs, BTC per diluted share still grew 22.8% — the BTC accumulation more than offset dilution. This is the primary measure of whether the flywheel is creating or destroying value per share.

### 3.5 BTC Dollar Gain Metric

```
BTC_Dollar_Gain = BTC_added_in_period × BTC_Price - Capital_raised_in_period × (1 - 1/mNAV)
```

2025 full year: $8.9B BTC Dollar Gain  
This is the dollar value accreted to BTC NAV per share net of dilution cost. Positive as long as mNAV > 1.0x.

---

## 4. Six Risk Dimensions — Formulas and Thresholds

### 4.1 Dividend Coverage / Ability to Pay

**Primary metric:**
```
USD_Reserve_Coverage_Months = USD_Reserve / (Total_Annual_Obligations / 12)
```

**Secondary metric:**
```
-- Guard: only meaningful when mNAV > 1.0x (below 1.0x, ATM issuance is value-destructive)
-- When mNAV <= 1.0x, display "N/A — ATM issuance not viable" instead of a number
-- When mNAV is between 1.0x and 1.05x, clamp denominator to avoid division instability

if mNAV <= 1.0:
  ATM_Runway_Months = null  -- display as "N/A"
else:
  USD_Gain_Rate = max(0.05, mNAV - 1.0)  -- clamp to 5% minimum to avoid instability near 1.0x
  ATM_Runway_Months = (MSTR_ATM_Capacity_Remaining + STRC_ATM_Capacity_Remaining)
                      / (Total_Monthly_Obligations / USD_Gain_Rate)
```
Note: This estimates how many months of issuance capacity remains to fund obligations, discounted by the USD gain rate at current mNAV. A result > 36 months should be displayed as "> 36 months" to avoid false precision at high mNAV values.

**Stress threshold:** USD Reserve Coverage < 12 months = elevated watch  
**Critical threshold:** USD Reserve Coverage < 6 months = high alert

### 4.2 BTC Collateral Coverage Ratio

**Formula:**
```
BTC_Coverage_Ratio = (BTC_Holdings × BTC_Price) / Total_Senior_Claims

Total_Senior_Claims = Convert_Notional 
                    + STRF_Stated_Amount 
                    + STRC_Stated_Amount 
                    + STRC_Accrued_Unpaid_Dividends
                    (Note: STRK and STRD excluded — junior to STRC)
```

**STRC-specific impairment price:**
```
STRC_Impairment_BTC_Price = (Convert_Notional + STRF_Stated_Amount + STRC_Stated_Amount) 
                             / BTC_Holdings
```

Current estimate: (~$8.2B + $0.711B + $3.4B) / 738,731 = ~$16,700/BTC  
Approximate: BTC would need to fall ~76% from $70,800 before STRC holders face impairment.

**Stress scenarios to display:**

| BTC Price | BTC Value | Coverage vs Senior Claims | Signal |
|---|---|---|---|
| $70,800 (spot) | $52.3B | ~4.3x | ✅ Safe |
| $49,560 (-30%) | $36.6B | ~3.0x | ✅ Safe |
| $35,400 (-50%) | $26.1B | ~2.1x | ⚠️ Watch |
| $21,240 (-70%) | $15.7B | ~1.3x | 🔴 Alert |
| $16,700 (-76%) | $12.3B | ~1.0x | 💀 Impairment |

### 4.3 mNAV Premium Sustainability

**Formula:** See 3.1 above.

**Key monitoring signals:**
- mNAV 30-day trend (slope of mNAV over trailing 30 trading days)
- mNAV vs BTC price correlation (should be positive; divergence is a signal)
- mNAV regime classification (see 3.2)
- Days since last MSTR ATM issuance (proxy for whether company believes mNAV is sustainable)

**Threshold mapping:**
```
mNAV > 2.5x  → BTC accumulation mode active, flywheel self-reinforcing
mNAV 1.5–2.5x → Opportunistic, ATM still generates meaningful USD gain (~$0.33-0.60 per $1)
mNAV 1.0–1.5x → Tactical (current), thin USD gain, reserve is primary buffer
mNAV < 1.0x  → Crisis: ATM issuance destroys BTC NAV per share
```

### 4.4 Liquidation Waterfall / Recovery Analysis

**STRC recovery estimate in wind-down:**
```
STRC_Recovery_Per_Share = min(
  LP_per_share + Accrued_Dividends_per_share,
  max(0, (BTC_Value - Convert_Notional - STRF_Total_Claim)) / STRC_Shares_Outstanding
)

STRC_Recovery_Rate = STRC_Recovery_Per_Share / (LP_per_share + Accrued_Dividends_per_share)
```

This should be computed and displayed across a BTC price range from spot down to $0 as a recovery curve, not a point estimate.

### 4.5 Rate Reset Risk

**Current rate state:**
- Current rate: 11.25%
- Current 1-month Term SOFR: ~4.30% (fetch live from CME)
- SOFR floor on STRC rate: 4.30%
- Maximum reduction per month: 25bps (+ any SOFR decline)
- Minimum rate achievable at any point in time: max(SOFR, Rate_current - n×25bps)

**Forward rate path projections (display 3 scenarios):**
```
Bear case (SOFR flat):    Rate_floor(n) = max(4.30%, 11.25% - n × 0.25%)
Base case (SOFR -50bps):  Rate_floor(n) = max(3.80%, 11.25% - n × 0.25%)
Bull case (SOFR -100bps): Rate_floor(n) = max(3.30%, 11.25% - n × 0.25%)
```
At current 11.25%, it takes 28 months of consecutive 25bps cuts to reach 4.25% (≈ SOFR floor today).

**Rate signal interpretation:**
- Rate increase announcement = price drifting below $100, company needs to attract buyers
- Rate decrease announcement = price above $100, company reducing cost of capital
- Rate held flat = price near $100, equilibrium

### 4.6 ATM Issuance Pace vs BTC Accumulation

**Primary metrics:**
```
STRC_ATM_Utilization = STRC_Deployed / STRC_ATM_Authorized   -- $3.4B / $4.2B = 81%
STRC_ATM_Remaining = STRC_ATM_Authorized - STRC_Deployed     -- ~$800M remaining

MSTR_ATM_Pace_30d = MSTR_shares_issued_30d × MSTR_avg_price_30d  -- estimate from filings
BTC_Acquired_30d = latest_8K_BTC - prior_30d_8K_BTC              -- from EDGAR

BTC_Conversion_Rate = BTC_Acquired_value / Total_ATM_Proceeds    -- target: ~85-95% in accumulation mode
                                                                   -- lower in tactical mode (dividends first)
```

---

## 5. Volatility and Beta Framework

### 5.1 Instruments Tracked

- STRC, STRF, STRK, STRD (all four preferreds)
- MSTR (common equity)
- BTC-USD (Bitcoin price)
- Reference: SPY (S&P 500 as macro baseline)

### 5.2 Volatility Metrics

**30-day Realized Volatility:**
```
σ_30d = std(daily_log_returns, window=30) × sqrt(252)
```

**90-day Realized Volatility:**
```
σ_90d = std(daily_log_returns, window=90) × sqrt(252)
```

**Regime note for preferreds:** STRC is designed to suppress volatility (rate reset absorbs price pressure). Realized vol will appear low in normal markets. During BTC stress events, the mechanism gets overwhelmed and vol spikes. The 90-day vol will capture stress events that 30-day vol misses once the stress passes. The ratio σ_30d/σ_90d is itself a useful signal: when it spikes above 1.5, STRC is experiencing a stress event the recent window is still capturing.

### 5.3 Beta Calculations

**Beta to BTC:**
```
Beta_to_BTC(instrument) = Cov(instrument_returns, BTC_returns) / Var(BTC_returns)
```
Compute over both 30-day and 90-day rolling windows.

**Beta to MSTR:**
```
Beta_to_MSTR(instrument) = Cov(instrument_returns, MSTR_returns) / Var(MSTR_returns)
```
Compute over both 30-day and 90-day rolling windows.

**Interpretation for hedge construction:**
- Beta_to_MSTR(STRC) tells you the MSTR short ratio needed to neutralize MSTR equity exposure
- Beta_to_BTC(STRC) tells you the BTC futures short ratio needed to neutralize BTC exposure
- The ratio Beta_to_BTC/Beta_to_MSTR tells you how much STRC's exposure runs through MSTR vs direct BTC

### 5.4 Rolling Correlation

```
Corr_30d(STRC, MSTR) = rolling_correlation(STRC_returns, MSTR_returns, window=30)
Corr_30d(STRC, BTC)  = rolling_correlation(STRC_returns, BTC_returns, window=30)
Corr_90d(STRC, MSTR) = rolling_correlation(STRC_returns, MSTR_returns, window=90)
Corr_90d(STRC, BTC)  = rolling_correlation(STRC_returns, BTC_returns, window=90)
```

**Key signal:** Correlation breakdown (STRC-MSTR or STRC-BTC correlation dropping sharply) is an early warning indicator that the rate reset mechanism is under stress and par stability may be at risk.

### 5.5 Implied Volatility (MSTR Proxy)

MSTR options trade on standard exchanges. At-the-money implied vol on MSTR options provides a forward-looking volatility estimate that feeds into hedge cost calculations. Source: FMP options endpoint.

```
MSTR_IV_30d = ATM_IV from nearest-to-30-days expiry options on MSTR
MSTR_IV_60d = ATM_IV from nearest-to-60-days expiry options on MSTR
```

### 5.6 Hedge Ratio Construction

For a $1M long STRC position, target delta-neutral hedge:

**MSTR short hedge:**
```
MSTR_Hedge_Notional = STRC_Position_Value × Beta_to_MSTR(STRC, 30d)
MSTR_Shares_Short   = MSTR_Hedge_Notional / MSTR_Price
Hedge_Cost_Annual   = MSTR_Shares_Short × MSTR_Borrow_Rate × MSTR_Price
Net_Hedged_Yield    = STRC_Effective_Yield - Hedge_Cost_Annual / STRC_Position_Value
```

**BTC futures hedge:**
```
-- CME Bitcoin futures: 1 contract = 5 BTC
-- CME Micro Bitcoin futures (MBT): 1 contract = 0.1 BTC (use for smaller positions)
BTC_Hedge_Notional  = STRC_Position_Value × Beta_to_BTC(STRC, 30d)
BTC_Contracts_Short = BTC_Hedge_Notional / (BTC_Price × 5)   -- for standard CME BTC contracts
                    = BTC_Hedge_Notional / (BTC_Price × 0.1)  -- for CME Micro (MBT)
Basis_Risk          = |Beta_to_BTC - Beta_to_MSTR × Beta_MSTR_to_BTC|
```

---

## 6. Yield Strategies — Position Modes

The dashboard must support real-time risk monitoring and position management across three distinct modes simultaneously.

### 6.1 Mode 1: Long STRC (Unhedged)

**Target investor:** Income-focused, comfortable with indirect BTC and mNAV exposure.

**Key metrics to display:**
- Effective current yield = (Annual_Dividend_Rate × $100) / Current_STRC_Price
- Par premium/discount in bps = (STRC_Price - $100) / $100 × 10,000
- Monthly income per $1M position = $1,000,000 × Annual_Rate / 12
- YTD income received (cumulative)
- BTC coverage ratio (downside protection gauge)
- USD Reserve coverage months (dividend sustainability gauge)
- Next rate announcement date and estimated direction

**Position signals:**
- 🟢 Buy signal: Price < $98 (>200bps discount to par) + BTC coverage > 3.0x
- 🟡 Hold signal: Price $98–102
- 🔴 Trim signal: Price > $104 (>400bps premium) — yield compression risk

### 6.2 Mode 2: Hedged Long STRC

**Target investor:** Wants the yield but wants to neutralize BTC/MSTR equity volatility, locking in a spread over risk-free.

**Hedge construction:** MSTR short (primary) or BTC perpetual futures short (secondary/complement).

**Key metrics to display:**
- Gross yield (STRC effective yield)
- Hedge cost (annualized borrow rate on MSTR short, or futures roll cost for BTC)
- Net hedged yield = Gross yield − Hedge cost
- Hedge ratio (current Beta_to_MSTR, 30d and 90d)
- Hedge P&L (unrealized gain/loss on MSTR short vs unrealized on STRC long)
- Net position delta to BTC (residual exposure after hedge)
- Correlation between STRC and MSTR (hedge effectiveness gauge)
- Rebalance trigger: flag when Beta_to_MSTR 30d deviates >15% from hedge ratio set at entry

**Spread targets:**
- Target net yield: SOFR + 250–300bps (approximately 6.5–7.3% today at SOFR 4.3%)
- Alert if net yield drops below SOFR + 150bps — hedge too expensive or yield too compressed

### 6.3 Mode 3: Leveraged Tranche Product (See Section 7)

Dashboard panels for Mode 3 are defined in Section 7.4.

---

## 7. Leveraged Tranche Product Specification

### 7.1 Product Overview

A structured product that pools STRC holdings and issues two tranches of participation rights:

- **Senior Tranche ("Stretch Senior" / SRS):** Fixed 7–8% yield (target: 7.5%), protected by junior subordination. Lower risk, lower return. Target investor: income-focused, credit-oriented.
- **Junior Tranche ("Stretch Junior" / SRJ):** Residual yield after senior is paid. Higher leveraged return, bears first-loss risk. Target investor: yield-seeking, sophisticated, understands leverage mechanics.

STRC is the underlying collateral. The product does not itself issue new STRC — it creates a contractual allocation of STRC cash flows between two investor classes.

### 7.2 Three Leverage Configurations

**Configuration A — 2:1 (Conservative)**

| Parameter | Value |
|---|---|
| Senior allocation | 50% of pool |
| Junior allocation | 50% of pool |
| Senior target yield | 7.5% fixed |
| Senior annual cost on 50% | 3.75% of pool |
| Residual to junior (at 11.25% STRC rate) | 11.25% − 3.75% = 7.50% of pool |
| Junior yield on junior capital (50% of pool) | 7.50% / 50% = **15.0%** |
| Excess spread (buffer above senior) | 11.25% − 7.50% = 3.75% of pool |
| Rate at which STRC yield = senior cost | 7.50% / (pool size) × (1/50%) = 3.75% |
| STRC rate floor before senior impaired | **3.75%** (well above SOFR floor) |

**Configuration B — 3:1 (Moderate)**

| Parameter | Value |
|---|---|
| Senior allocation | 67% of pool |
| Junior allocation | 33% of pool |
| Senior target yield | 7.5% fixed |
| Senior annual cost on 67% | 5.025% of pool |
| Residual to junior (at 11.25% STRC rate) | 11.25% − 5.025% = 6.225% of pool |
| Junior yield on junior capital (33% of pool) | 6.225% / 33% = **18.9%** |
| Excess spread | 6.225% of pool |
| STRC rate floor before senior impaired | **5.025%** (close to SOFR floor — tight) |

**Configuration C — 4:1 (Aggressive)**

| Parameter | Value |
|---|---|
| Senior allocation | 75% of pool |
| Junior allocation | 25% of pool |
| Senior target yield | 7.5% fixed |
| Senior annual cost on 75% | 5.625% of pool |
| Residual to junior (at 11.25% STRC rate) | 11.25% − 5.625% = 5.625% of pool |
| Junior yield on junior capital (25% of pool) | 5.625% / 25% = **22.5%** |
| Excess spread | 5.625% of pool |
| STRC rate floor before senior impaired | **5.625%** (above SOFR floor — tight) |

**Note on Configuration C:** At 4:1 leverage, the STRC rate floor before senior impairment (5.625%) is above today's SOFR floor (4.3%). This means that if STRC's rate were cut aggressively to the SOFR floor, senior holders could theoretically be impaired. Configuration C is only appropriate when STRC rate has substantial cushion above 5.625%. Dashboard should flag this risk dynamically.

### 7.3 Coverage Tests (Covenant-Style)

Three tests must pass at all times. Breach of any test triggers a cash trap or event of default.

**Test 1 — Senior Coverage Ratio (SCR):**
```
SCR = (STRC_Annual_Rate × Pool_Notional) / (Senior_Target_Yield × Senior_Notional)
SCR must be ≥ 1.25x (covenant) / ≥ 1.10x (cash trap trigger) / < 1.0x (EOD)
```

At current 11.25% STRC rate:
- Config A: SCR = (11.25% × 1.0) / (7.5% × 0.50) = 11.25% / 3.75% = **3.0x** ✅
- Config B: SCR = (11.25% × 1.0) / (7.5% × 0.67) = 11.25% / 5.025% = **2.24x** ✅
- Config C: SCR = (11.25% × 1.0) / (7.5% × 0.75) = 11.25% / 5.625% = **2.0x** ✅

**Test 2 — Excess Spread Test (EST):**
```
EST = STRC_Annual_Rate - Senior_Cost_Rate_on_Pool
EST must be ≥ 2.00% (covenant) / ≥ 1.00% (cash trap) / < 0% (EOD)
```

- Config A: 11.25% − 3.75% = **7.50%** ✅
- Config B: 11.25% − 5.025% = **6.225%** ✅
- Config C: 11.25% − 5.625% = **5.625%** ✅

**Test 3 — STRC Rate Floor Buffer (RFB):**
```
RFB = STRC_Current_Rate - STRC_Rate_Floor_Before_Senior_Impairment
RFB must be ≥ 3.00% (covenant) / ≥ 1.50% (watch) / < 0% (senior at risk)
```

- Config A: 11.25% − 3.75% = **7.50%** ✅
- Config B: 11.25% − 5.025% = **6.225%** ✅
- Config C: 11.25% − 5.625% = **5.625%** ✅

**Dynamic monitoring:** All three tests should be recalculated in real-time whenever STRC rate changes or a new rate announcement is made.

### 7.4 NAV Per Unit Calculation

```
Pool_NAV = STRC_Market_Price × STRC_Shares_in_Pool + Accrued_Income_Receivable

Senior_NAV_Per_Unit = min(Senior_Target_Par, Pool_NAV × Senior_Allocation_Pct / Senior_Units)
Junior_NAV_Per_Unit = max(0, Pool_NAV - Senior_Total_NAV) / Junior_Units
```

### 7.5 Mode 3 Dashboard Panels

- SCR gauge (real-time, all three configs)
- Excess spread chart (historical + current)
- Rate floor buffer chart (with STRC rate history overlay)
- Junior yield at current STRC rate (all three configs)
- Junior yield sensitivity table (STRC rate from 7% to 14% in 25bps steps)
- Coverage test status (pass/fail/watch for each of 3 tests × 3 configs)
- Pool NAV and per-unit NAV (senior and junior)
- Monthly income allocation (senior vs junior split)

---

## 8. Complete Metric Dictionary

All metrics, their formulas, data sources, update frequencies, and dashboard tiers.

### Tier 1 — Real-Time (≤ 1 minute polling)

| Metric | Formula | Source | Update |
|---|---|---|---|
| STRC_Price | Last trade | FMP WebSocket or REST | 1 min |
| STRC_Par_Spread_bps | (STRC_Price − 100) / 100 × 10000 | Derived | 1 min |
| STRC_Effective_Yield | `(rate_pct / strc_price) * 100` — note: rate_pct stored as 11.25 (not 0.1125); result is a percentage e.g. 11.84% | Derived | 1 min |
| MSTR_Price | Last trade | FMP | 1 min |
| BTC_Price | Last trade | CoinGecko or Coinbase | 1 min |
| mNAV | MSTR_MarketCap / BTC_NAV | Derived | 1 min |
| mNAV_Regime | Classify per 3.2 thresholds | Derived | 1 min |
| STRF_Price | Last trade | FMP | 1 min |
| STRK_Price | Last trade | FMP | 1 min |
| STRD_Price | Last trade | FMP | 1 min |

### Tier 2 — Daily

| Metric | Formula | Source | Update |
|---|---|---|---|
| BTC_Holdings | From latest 8-K (or estimate) | EDGAR + estimator | Daily |
| BTC_NAV | BTC_Holdings × BTC_Price | Derived | Daily |
| BTC_Coverage_Ratio | BTC_NAV / Total_Senior_Claims | Derived | Daily |
| STRC_Impairment_BTC_Price | Total_Senior_Claims / BTC_Holdings | Derived | Daily |
| USD_Reserve | From latest 8-K | EDGAR | Per 8-K |
| USD_Reserve_Coverage_Months | USD_Reserve / (Annual_Obligations/12) | Derived | Per 8-K |
| Total_Annual_Obligations | Sum of all dividend + interest | EDGAR + derived | Per 8-K |
| STRC_ATM_Remaining | ATM_Authorized − ATM_Deployed | EDGAR | Per 8-K |
| MSTR_ATM_Remaining | From latest ATM update filings | EDGAR | Per 8-K |
| Vol_30d_STRC | σ_30d of STRC returns | Derived | Daily |
| Vol_90d_STRC | σ_90d of STRC returns | Derived | Daily |
| Vol_30d_STRF | σ_30d of STRF returns | Derived | Daily |
| Vol_90d_STRF | σ_90d of STRF returns | Derived | Daily |
| Vol_30d_STRK | σ_30d of STRK returns | Derived | Daily |
| Vol_90d_STRK | σ_90d of STRK returns | Derived | Daily |
| Vol_30d_STRD | σ_30d of STRD returns | Derived | Daily |
| Vol_90d_STRD | σ_90d of STRD returns | Derived | Daily |
| Vol_30d_MSTR | σ_30d of MSTR returns | Derived | Daily |
| Vol_90d_MSTR | σ_90d of MSTR returns | Derived | Daily |
| Vol_30d_BTC | σ_30d of BTC returns | Derived | Daily |
| Beta_STRC_to_BTC_30d | Cov(STRC,BTC)/Var(BTC), 30d | Derived | Daily |
| Beta_STRC_to_BTC_90d | Same, 90-day window | Derived | Daily |
| Beta_STRC_to_MSTR_30d | Cov(STRC,MSTR)/Var(MSTR), 30d | Derived | Daily |
| Beta_STRC_to_MSTR_90d | Same, 90-day window | Derived | Daily |
| Beta_STRF_to_BTC_30d | Cov(STRF,BTC)/Var(BTC), 30d | Derived | Daily |
| Beta_STRF_to_MSTR_30d | Cov(STRF,MSTR)/Var(MSTR), 30d | Derived | Daily |
| Beta_STRK_to_BTC_30d | Cov(STRK,BTC)/Var(BTC), 30d | Derived | Daily |
| Beta_STRK_to_MSTR_30d | Cov(STRK,MSTR)/Var(MSTR), 30d | Derived | Daily |
| Beta_STRD_to_BTC_30d | Cov(STRD,BTC)/Var(BTC), 30d | Derived | Daily |
| Beta_STRD_to_MSTR_30d | Cov(STRD,MSTR)/Var(MSTR), 30d | Derived | Daily |
| Corr_STRC_MSTR_30d | Rolling correlation, 30d | Derived | Daily |
| Corr_STRC_MSTR_90d | Rolling correlation, 90d | Derived | Daily |
| Corr_STRC_BTC_30d | Rolling correlation, 30d | Derived | Daily |
| Corr_STRC_BTC_90d | Rolling correlation, 90d | Derived | Daily |
| Vol_Ratio_STRC | σ_30d / σ_90d — stress regime signal; flag when > 1.5 | Derived | Daily |
| MSTR_IV_30d | ATM implied vol, nearest-to-30-days expiry options on MSTR | FMP options | Daily |
| MSTR_IV_60d | ATM implied vol, nearest-to-60-days expiry options on MSTR | FMP options | Daily |

### Tier 3 — Monthly / Per Rate Announcement

| Metric | Formula | Source | Update |
|---|---|---|---|
| STRC_Current_Rate | Declared monthly rate | Strategy press release / 8-K | Monthly |
| STRC_Rate_History | Array of {date, rate} | EDGAR + manual seed | Monthly |
| SOFR_1M | 1-Month Term SOFR | CME Group | Daily |
| SOFR_Forward_1M | SR1 futures implied rate in 1 month | CME / FMP | Daily |
| SOFR_Forward_3M | SR1 futures implied rate in 3 months | CME / FMP | Daily |
| SOFR_Forward_6M | SR1 futures implied rate in 6 months | CME / FMP | Daily |
| Max_Rate_Reduction_Next_Period | 25bps + SOFR_decline_in_current_period | Derived | Monthly |
| Min_Rate_Next_Period | max(SOFR, Current_Rate − Max_Reduction) | Derived | Monthly |
| Days_To_Next_Rate_Announcement | Calc from calendar | Derived | Daily |

### Tier 4 — Stress / Scenario (On-demand or Weekly)

| Metric | Formula | Source | Update |
|---|---|---|---|
| BTC_Coverage_At_Minus_30pct | BTC_NAV×0.7 / Total_Senior_Claims | Derived | Daily |
| BTC_Coverage_At_Minus_50pct | BTC_NAV×0.5 / Total_Senior_Claims | Derived | Daily |
| BTC_Coverage_At_Minus_70pct | BTC_NAV×0.3 / Total_Senior_Claims | Derived | Daily |
| mNAV_Break_BTC_Price | BTC price at which mNAV = 1.0x | Derived | Daily |
| mNAV_Stress_BTC_Minus_30pct | mNAV if BTC fell 30% holding MSTR cap | Derived | Daily |
| STRC_Recovery_Curve | Array of {BTC_price, recovery_rate} | Derived | Daily |
| Rate_To_Par_Path | Rate path at 25bps/mo until par equilibrium | Derived | Daily |

### Tier 5 — Tranche Product (Real-Time When Position Active)

| Metric | Config | Formula | Update |
|---|---|---|---|
| SCR_ConfigA/B/C | Each | (STRC_Rate × Pool) / (7.5% × Senior_Pct) | 1 min |
| EST_ConfigA/B/C | Each | STRC_Rate − Senior_Cost_Rate_on_Pool | 1 min |
| RFB_ConfigA/B/C | Each | STRC_Rate − Rate_Floor_Before_Impairment | 1 min |
| Junior_Yield_ConfigA/B/C | Each | Residual_Rate / Junior_Pct | 1 min |
| Coverage_Test_Status | Each | Pass/Watch/Cash_Trap/EOD | 1 min |
| Pool_NAV | — | STRC_Price × Shares + Accrued | 1 min |
| Senior_NAV_Per_Unit | — | See 7.4 | 1 min |
| Junior_NAV_Per_Unit | — | See 7.4 | 1 min |

---

## 9. Data Source Map

### 9.1 FMP (Financial Modeling Prep) — Paid API

Base URL: `https://financialmodelingprep.com/api/v3/`  
Auth: `?apikey=${FMP_API_KEY}` appended to all requests.

| Data | Endpoint | Notes |
|---|---|---|
| STRC quote (real-time) | `/quote/STRC` | Price, volume, change. Note: FMP REST polling at 1-min interval is sufficient — FMP WebSocket is available on higher-tier plans but REST polling is adequate for preferred stocks with lower tick frequency |
| STRF quote | `/quote/STRF` | |
| STRK quote | `/quote/STRK` | |
| STRD quote | `/quote/STRD` | |
| MSTR quote | `/quote/MSTR` | |
| Historical prices (all) | `/historical-price-full/{ticker}` | Add `?from=2025-07-29` for STRC |
| MSTR shares outstanding | `/shares_float/MSTR` | For mNAV diluted share calc |
| MSTR options chain | `/options/{MSTR}` | For implied vol — filter for ATM strikes near 30d and 60d expiry |
| Company financials (MSTR) | `/income-statement/MSTR?limit=4` | Annual obligations |
| Balance sheet (MSTR) | `/balance-sheet-statement/MSTR?limit=4` | Preferred stock outstanding |
| SR1 futures (SOFR 1M) | `/historical-price-full/SR1` | For SOFR forward curve — fallback if FRED TERMSFR1M is stale |

### 9.2 CoinGecko — Free API

Base URL: `https://api.coingecko.com/api/v3/`

| Data | Endpoint |
|---|---|
| BTC price (USD) | `/simple/price?ids=bitcoin&vs_currencies=usd` |
| BTC historical | `/coins/bitcoin/market_chart?vs_currency=usd&days=365` |

Rate limit: 30 calls/minute on free tier. Cache aggressively (≥60s for price, ≥1hr for historical).

### 9.3 FRED API — Free (SOFR, preferred over CME scraping)

Base URL: `https://api.stlouisfed.org/fred/series/observations`  
Auth: `&api_key=${FRED_API_KEY}&file_type=json` (free registration at fred.stlouisfed.org)

**⚠️ Important: use the correct SOFR series. These are NOT interchangeable:**

| Series ID | What it is | Use for |
|---|---|---|
| `SOFR` | Daily overnight SOFR rate | Reference / cross-check only |
| `SOFR30DAYAVG` | 30-day compounded SOFR average | NOT the rate used in STRC CoD |
| `TERMSFR1M` | **1-Month Term SOFR (CME Group Benchmark Administration)** | ✅ **This is the correct rate** — cited verbatim in the STRC Certificate of Designations |

The Certificate of Designations Section 1 defines "Monthly SOFR Per Annum" as **One-Month Term SOFR** published by CME Group Benchmark Administration (CMEGB). Do not confuse this with BSBY (Bloomberg Short-Term Bank Yield Index) — that is a different rate published by Bloomberg. `SOFR30DAYAVG` is also different (backward-looking compounded average) and will produce incorrect rate floor calculations if substituted.

**FRED endpoint for 1-Month Term SOFR:**
```
https://api.stlouisfed.org/fred/series/observations?series_id=TERMSFR1M&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=5
```
Note: FRED series ID is `TERMSFR1M` — all caps, no mixed case. Verify at fred.stlouisfed.org if the endpoint returns 404 (series IDs occasionally change).

**Fallback — direct CME scrape:** If FRED's TERMSFR1M lags or is unavailable:
`https://www.cmegroup.com/market-data/cme-group-benchmark-administration/term-sofr.html`
Parse the daily rate from the table. This is the authoritative source per the CoD.

### 9.4 SEC EDGAR — Free

Base URL: `https://data.sec.gov/`

| Data | Endpoint | Notes |
|---|---|---|
| MSTR 8-K filings list | `/submissions/CIK0001050446.json` | CIK for MicroStrategy |
| Specific filing | `https://www.sec.gov/Archives/edgar/data/1050446/{accession}/{file}` | Parse HTML/XBRL |
| Full-text search | `https://efts.sec.gov/LATEST/search-index?q="bitcoin"&dateRange=custom&startdt={date}&forms=8-K&entity=microstrategy` | Find BTC/ATM updates |

**Key 8-K items to parse:**
- Item 8.01: BTC holdings updates (weekly filing cadence)
- Item 1.01: Material agreement updates (ATM program changes)
- Exhibits: ATM program prospectus supplements with share counts

### 9.5 Strategy.com — Live Dashboard (Scraping or Manual)

URL: `https://www.strategy.com` publishes live mNAV, Enterprise Value, BTC NAV, and BTC Holdings.  
This can serve as a sanity check / cross-reference against our own derived mNAV calculation.

### 9.6 Rate History Seed Data

STRC rate history must be manually seeded from launch (July 2025) to present, then automated forward.

**⚠️ Claude Code: Do not seed this table manually from the data below. See Appendix A for the mandatory reconstruction sequence.** The correct workflow is: run `scripts/backfill/rate-history-reconstruction.ts` first (pulls from EDGAR and verifies against press releases), then use Appendix A's reference table only as a cross-check.

Known confirmed sources for reconstruction:
- Strategy press releases: businesswire.com/news/home/strategy
- EDGAR 8-K filings (CIK 0001050446): full-text search for STRC rate language

---

## 10. Estimation Models

### 10.1 ATM Share Issuance Estimator (MSTR and Preferreds)

**Problem:** ATM issuance for MSTR and all preferreds is only disclosed in 8-K filings, which lag by up to 5 business days.

**Estimation approach for MSTR:**

```
Step 1: Get base shares from most recent 8-K.
        shares_base = shares_outstanding_from_last_8K
        
Step 2: Estimate daily ATM issuance using volume proxy.
        daily_issuance_estimate = MSTR_daily_volume × ATM_participation_rate
        
        ATM_participation_rate: calibrate from historical data.
        Method: for each filing that disclosed new shares, compute:
          actual_rate = (new_shares - prior_shares) / sum(daily_volumes_in_interval)
        Historical range: 2-6% of daily volume. Use rolling 30-day average of confirmed rates.
        
Step 3: Compute estimated shares outstanding.
        estimated_shares = shares_base + sum(daily_issuance_estimates since last 8-K)
        
Step 4: Compute confidence band.
        low_estimate  = shares_base + sum(daily_volume × 2%)
        high_estimate = shares_base + sum(daily_volume × 6%)
        confidence_decay = min(1.0, days_since_last_8K / 7)  -- full uncertainty after 7 days
        
Step 5: On 8-K reconciliation, compute realized_rate for the period.
        Update the rolling calibration model.
```

**Estimation approach for preferred ATMs (STRC, STRF, STRK, STRD):**

Preferred ATM estimation is simpler than MSTR because preferred prices are relatively stable near par ($100), making dollar volume a more reliable proxy than share volume.

```
Step 1: Get confirmed stated_amount_deployed from most recent 8-K for each ticker.
        strc_deployed_base = stated_amount_from_last_8K   -- in dollars

Step 2: Estimate daily issuance using price × volume proxy.
        -- Preferred volume is lower and more episodic than MSTR
        -- Use 3-day rolling average volume to smooth gaps
        daily_preferred_volume_avg_3d = mean(volume[-3:]) for each preferred ticker
        
        -- Participation rate for preferreds is higher than MSTR (fewer competing sellers)
        -- Historical range: 10-30% of daily volume
        preferred_participation_rate = 0.20  -- use 20% as default; calibrate per 8-K
        
        daily_stated_amount_est = daily_preferred_volume_avg_3d 
                                  × preferred_participation_rate 
                                  × current_price  -- stated amount ≈ price × shares

Step 3: Compute estimated total deployed.
        strc_deployed_est = strc_deployed_base + sum(daily_stated_amount_est since last 8-K)
        strc_atm_remaining_est = strc_atm_authorized - strc_deployed_est

Step 4: Confidence decay same as MSTR (7-day full uncertainty window).

Step 5: On 8-K reconciliation, compute realized participation rate and update calibration.
```

**Display:** Show mNAV as a range (mNAV_low, mNAV_point, mNAV_high) when confidence_decay > 0.3.

### 10.2 Interim BTC Holdings Estimator

**Problem:** BTC purchases are disclosed in 8-Ks but may lag actual purchases by a few days.

**Estimation approach:**

```
Step 1: Get confirmed BTC from most recent 8-K.
        btc_confirmed = btc_holdings_from_last_8K
        last_confirmed_date = 8K_filing_date

Step 2: Estimate ATM proceeds since last BTC 8-K.
        est_mstr_proceeds = sum(est_MSTR_daily_issuance × MSTR_price) since last_confirmed_date
        est_strc_proceeds = sum(est_STRC_daily_issuance × STRC_price) since last_confirmed_date
        est_pref_proceeds = sum(est_STRF_daily + est_STRK_daily + est_STRD_daily) since last_confirmed_date
        total_est_proceeds = est_mstr_proceeds + est_pref_proceeds

Step 3: Apply regime-adjusted BTC conversion rate.
        if mNAV < 2.5x (tactical):
          btc_conversion_rate = 0.50   -- proceeds go to dividends/reserve first
        else:
          btc_conversion_rate = 0.90   -- most proceeds into BTC
        
        est_btc_added = (total_est_proceeds × btc_conversion_rate) / BTC_price

Step 4: Compute estimated holdings.
        est_btc_holdings = btc_confirmed + est_btc_added
        
Step 5: Confidence flag.
        Display as "~{est_btc_holdings}" with "est." badge when unconfirmed.
        Confidence decays after 5 business days without new 8-K.
```

### 10.3 SOFR Forward Rate Model

**Input:** SR1 (1-Month SOFR futures) contract prices from CME, available via FMP futures endpoint or direct CME API.

```
SOFR_implied_rate(month_n) = 100 - SR1_futures_price(expiry_n)

For each monthly period T = 1 through 12:
  sofr_forward[T] = SOFR_implied_rate(month_T) / 100

Minimum STRC rate in period T:
  rate_floor[T] = max(sofr_forward[T], rate_current - T × 0.0025)

Maximum rate reduction by month T (from current rate):
  max_reduction[T] = T × 0.0025 + sum(max(0, sofr_decline) for each period)
```

**Output:** Chart showing current rate, minimum possible rate trajectory (red band), and SOFR forward curve (blue line) over 12-month horizon.

### 10.4 mNAV Estimator (Real-Time)

```
mNAV_realtime = (MSTR_Price × estimated_shares_outstanding) / BTC_NAV

where:
  estimated_shares_outstanding = from Model 10.1
  BTC_NAV = est_btc_holdings (from 10.2) × BTC_Price_live

Confidence: compound confidence of share estimate and BTC estimate.
Display: point estimate + uncertainty band when confidence < 0.85.
```

---

## 11. Neon PostgreSQL Schema

### 11.1 Connection Configuration

```
Production:  NEON_DATABASE_URL (pooled connection — use for all Vercel serverless functions)
Direct:      NEON_DATABASE_DIRECT_URL (direct connection — use for Drizzle migrations only)
```

Both strings stored as Vercel environment variables. Never hardcode.

### 11.2 Tables

```sql
-- Price history for all tracked instruments
CREATE TABLE price_history (
  id              BIGSERIAL PRIMARY KEY,
  ticker          VARCHAR(10) NOT NULL,
  ts              TIMESTAMPTZ NOT NULL,
  price           NUMERIC(18, 6) NOT NULL,
  volume          NUMERIC(20, 2),
  source          VARCHAR(20) NOT NULL, -- 'fmp', 'coingecko', 'derived'
  is_eod          BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_price_history_ticker_ts ON price_history(ticker, ts DESC);
CREATE UNIQUE INDEX idx_price_history_ticker_ts_source ON price_history(ticker, ts, source);

-- STRC dividend rate history
CREATE TABLE strc_rate_history (
  id              BIGSERIAL PRIMARY KEY,
  effective_date  DATE NOT NULL,
  rate_pct        NUMERIC(6, 4) NOT NULL, -- stored as e.g. 11.25 for 11.25%
  announced_date  DATE,
  is_confirmed    BOOLEAN DEFAULT FALSE,  -- FALSE = estimated/interpolated; TRUE = verified from primary source
  source          VARCHAR(200),           -- press release URL or 8-K accession number
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_strc_rate_history_date ON strc_rate_history(effective_date);

-- SOFR rate history
CREATE TABLE sofr_history (
  id              BIGSERIAL PRIMARY KEY,
  date            DATE NOT NULL UNIQUE,
  sofr_1m_pct     NUMERIC(6, 4) NOT NULL,
  source          VARCHAR(50) DEFAULT 'fred',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- BTC holdings snapshots (confirmed and estimated)
CREATE TABLE btc_holdings (
  id              BIGSERIAL PRIMARY KEY,
  report_date     DATE NOT NULL,
  btc_count       NUMERIC(14, 3) NOT NULL,
  avg_cost_usd    NUMERIC(14, 2),
  total_cost_usd  NUMERIC(20, 2),
  is_estimated    BOOLEAN DEFAULT FALSE,
  confidence      NUMERIC(4, 3) DEFAULT 1.0, -- 0.0 to 1.0
  source          VARCHAR(200), -- 8-K accession number or 'estimated'
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_btc_holdings_date ON btc_holdings(report_date);

-- Capital structure snapshots (updated per 8-K)
CREATE TABLE capital_structure_snapshots (
  id                        BIGSERIAL PRIMARY KEY,
  snapshot_date             DATE NOT NULL,
  convert_notional_usd      NUMERIC(20, 2),
  convert_avg_maturity_yrs  NUMERIC(5, 2),
  strf_outstanding_usd      NUMERIC(20, 2),
  strc_outstanding_usd      NUMERIC(20, 2),
  strk_outstanding_usd      NUMERIC(20, 2),
  strd_outstanding_usd      NUMERIC(20, 2),
  usd_reserve_usd           NUMERIC(20, 2),
  mstr_shares_outstanding   BIGINT,
  strc_atm_authorized_usd   NUMERIC(20, 2),
  strc_atm_deployed_usd     NUMERIC(20, 2),
  mstr_atm_authorized_usd   NUMERIC(20, 2),   -- MSTR common equity ATM program size
  mstr_atm_deployed_usd     NUMERIC(20, 2),   -- MSTR ATM deployed to date (from 8-K)
  total_annual_obligations  NUMERIC(20, 2),
  source                    VARCHAR(200),
  is_estimated              BOOLEAN DEFAULT FALSE,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_capital_snapshot_date ON capital_structure_snapshots(snapshot_date);

-- Derived daily metrics (computed and cached)
CREATE TABLE daily_metrics (
  id                        BIGSERIAL PRIMARY KEY,
  date                      DATE NOT NULL UNIQUE,
  mnav                      NUMERIC(8, 4),
  mnav_low                  NUMERIC(8, 4),
  mnav_high                 NUMERIC(8, 4),
  mnav_regime               VARCHAR(20), -- 'aggressive','opportunistic','tactical','crisis'
  btc_coverage_ratio        NUMERIC(8, 4),
  strc_impairment_btc_price NUMERIC(14, 2),
  usd_reserve_months        NUMERIC(6, 2),
  strc_effective_yield      NUMERIC(6, 4),
  strc_par_spread_bps       NUMERIC(8, 2),
  vol_30d_strc              NUMERIC(8, 6),
  vol_90d_strc              NUMERIC(8, 6),
  vol_30d_mstr              NUMERIC(8, 6),
  vol_90d_mstr              NUMERIC(8, 6),
  vol_30d_btc               NUMERIC(8, 6),
  beta_strc_btc_30d         NUMERIC(8, 6),
  beta_strc_btc_90d         NUMERIC(8, 6),
  beta_strc_mstr_30d        NUMERIC(8, 6),
  beta_strc_mstr_90d        NUMERIC(8, 6),
  corr_strc_mstr_30d        NUMERIC(8, 6),
  corr_strc_mstr_90d        NUMERIC(8, 6),   -- 90d rolling correlation STRC-MSTR
  corr_strc_btc_30d         NUMERIC(8, 6),
  corr_strc_btc_90d         NUMERIC(8, 6),   -- 90d rolling correlation STRC-BTC
  vol_ratio_strc            NUMERIC(8, 6),   -- vol_30d / vol_90d — stress signal when > 1.5
  vol_90d_btc               NUMERIC(8, 6),
  mstr_iv_30d               NUMERIC(8, 6),
  mstr_iv_60d               NUMERIC(8, 6),
  beta_strf_btc_30d         NUMERIC(8, 6),
  beta_strf_mstr_30d        NUMERIC(8, 6),
  beta_strk_btc_30d         NUMERIC(8, 6),
  beta_strk_mstr_30d        NUMERIC(8, 6),
  beta_strd_btc_30d         NUMERIC(8, 6),
  beta_strd_mstr_30d        NUMERIC(8, 6),
  scr_config_a              NUMERIC(8, 4),
  scr_config_b              NUMERIC(8, 4),
  scr_config_c              NUMERIC(8, 4),
  est_config_a              NUMERIC(8, 4),
  est_config_b              NUMERIC(8, 4),
  est_config_c              NUMERIC(8, 4),
  rfb_config_a              NUMERIC(8, 4),
  rfb_config_b              NUMERIC(8, 4),
  rfb_config_c              NUMERIC(8, 4),
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- Accrued dividends tracking (for dynamic LP and recovery calculations)
-- Updated monthly after each payment date; tracks cumulative unpaid amounts if any
CREATE TABLE accrued_dividends (
  id                    BIGSERIAL PRIMARY KEY,
  ticker                VARCHAR(10) NOT NULL,  -- 'STRC', 'STRF', etc.
  period_end_date       DATE NOT NULL,          -- last day of the dividend period
  declared              BOOLEAN DEFAULT FALSE,
  paid                  BOOLEAN DEFAULT FALSE,
  dividend_rate_pct     NUMERIC(6, 4),          -- rate for this period
  accrued_per_share     NUMERIC(10, 6),         -- declared or accrued amount per share
  cumulative_unpaid_per_share NUMERIC(10, 6) DEFAULT 0,  -- 0 if paid, else accumulates
  payment_date          DATE,
  source                VARCHAR(200),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_accrued_dividends_ticker_period ON accrued_dividends(ticker, period_end_date);

-- MSTR shares outstanding history (needed for historical mNAV chart)
-- Populated from 8-K filings; estimated values filled by ATM estimator between filings
CREATE TABLE mstr_shares_history (
  id                    BIGSERIAL PRIMARY KEY,
  date                  DATE NOT NULL UNIQUE,
  shares_outstanding    BIGINT NOT NULL,
  is_estimated          BOOLEAN DEFAULT FALSE,
  confidence            NUMERIC(4, 3) DEFAULT 1.0,
  source                VARCHAR(200),           -- 8-K accession or 'estimated'
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_mstr_shares_date ON mstr_shares_history(date DESC);

-- ATM issuance tracking (estimated and confirmed)
  id              BIGSERIAL PRIMARY KEY,
  report_date     DATE NOT NULL,
  ticker          VARCHAR(10) NOT NULL,
  shares_issued   BIGINT,
  proceeds_usd    NUMERIC(20, 2),
  avg_price       NUMERIC(14, 4),
  is_estimated    BOOLEAN DEFAULT FALSE,
  confidence      NUMERIC(4, 3) DEFAULT 1.0,
  source          VARCHAR(200),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_atm_issuance_ticker_date ON atm_issuance(ticker, report_date DESC);

-- EDGAR 8-K filing index (for deduplication and audit trail)
CREATE TABLE edgar_filings (
  id              BIGSERIAL PRIMARY KEY,
  accession_no    VARCHAR(25) NOT NULL UNIQUE,
  filing_date     DATE NOT NULL,
  form_type       VARCHAR(10) NOT NULL,
  description     TEXT,
  processed       BOOLEAN DEFAULT FALSE,
  processing_notes TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_edgar_filings_date ON edgar_filings(filing_date DESC);

-- ATM participation rate calibration state
-- Stores the rolling estimated participation rate per ticker, updated on each 8-K reconciliation
-- Used by the ATM estimator (Section 10.1) to maintain per-ticker calibration
CREATE TABLE atm_calibration_params (
  id                        BIGSERIAL PRIMARY KEY,
  ticker                    VARCHAR(10) NOT NULL UNIQUE,
  participation_rate_low    NUMERIC(6, 4) NOT NULL,   -- lower bound of observed range (e.g. 0.02 for MSTR)
  participation_rate_high   NUMERIC(6, 4) NOT NULL,   -- upper bound (e.g. 0.06 for MSTR)
  participation_rate_current NUMERIC(6, 4) NOT NULL,  -- rolling 30-day calibrated midpoint
  sample_count              INTEGER DEFAULT 0,         -- number of 8-K intervals used in calibration
  last_calibrated_date      DATE,
  notes                     TEXT,                      -- e.g. 'default; no 8-K reconciliation yet'
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);
-- Seed defaults (overwritten as 8-K data accumulates):
-- MSTR:        low=0.02, high=0.06, current=0.04
-- STRC/STRF/STRK/STRD: low=0.10, high=0.30, current=0.20
```

### 11.3 Drizzle ORM Configuration

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.NEON_DATABASE_DIRECT_URL!,
  },
});
```

---

## 12. Pipeline Architecture

### 12.1 Vercel Cron Jobs

Define in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/prices",
      "schedule": "* * * * *"
    },
    {
      "path": "/api/cron/daily-metrics",
      "schedule": "0 1 * * *"
    },
    {
      "path": "/api/cron/sofr",
      "schedule": "0 16 * * 1-5"
    },
    {
      "path": "/api/cron/edgar-check",
      "schedule": "0 * * * *"
    }
  ]
}
```

| Cron route | Frequency | Actions |
|---|---|---|
| `/api/cron/prices` | Every 1 minute | Fetch STRC/STRF/STRK/STRD/MSTR quotes from FMP. Fetch BTC price from CoinGecko. Compute real-time mNAV. Write to `price_history`. **Guard: check if US market is open before calling FMP (Mon–Fri 09:30–16:00 ET). BTC price fetches run 24/7 regardless. Outside market hours, skip FMP calls and write last known price with `is_eod=true` flag.** |
| `/api/cron/daily-metrics` | Daily at 1am UTC | Compute all derived daily metrics (vol, beta, correlation, coverage ratios, tranche tests). Write to `daily_metrics`. |
| `/api/cron/sofr` | Weekdays at 4pm UTC (after FRED update) | Fetch latest 1-Month Term SOFR from FRED API (series: TERMSFR1M). Write to `sofr_history`. Update rate floor projections. |
| `/api/cron/edgar-check` | Hourly | Poll EDGAR submissions feed for new MSTR 8-K filings. Parse any new filing. Extract BTC holdings, ATM proceeds, share counts. Write to relevant tables. Mark filing as processed. |

**Vercel function timeout note:** Default Vercel function timeout is 10 seconds (Hobby) or 60 seconds (Pro). EDGAR parsing may exceed this. Use Vercel Pro plan. To set the timeout on a specific route in Next.js 15 App Router, add this export at the top of the route file:

```typescript
// src/app/api/cron/edgar-check/route.ts
export const maxDuration = 60; // seconds — requires Vercel Pro

export async function GET(request: Request) {
  // ... handler
}
```

For heavier historical backfill jobs, use GitHub Actions (see 12.2).

### 12.2 GitHub Actions (Heavy ETL)

`.github/workflows/backfill.yml` — run manually or on schedule for:

- Historical price backfill (pull all history from FMP for STRC since IPO date 2025-07-29)
- STRC rate history reconstruction from EDGAR
- ATM participation rate calibration (reprocess all historical 8-K filings to compute confirmed rates)
- Full EDGAR 8-K archive scan on initial setup

```yaml
name: Data Backfill
on:
  workflow_dispatch:
    inputs:
      job:
        description: 'Job to run'
        required: true
        type: choice
        options:
          - price-backfill
          - rate-history-reconstruction
          - atm-calibration
          - edgar-full-scan

jobs:
  backfill:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx ts-node scripts/backfill/${{ github.event.inputs.job }}.ts
        env:
          NEON_DATABASE_DIRECT_URL: ${{ secrets.NEON_DATABASE_DIRECT_URL }}
          FMP_API_KEY: ${{ secrets.FMP_API_KEY }}
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
          # Note: add all three secrets to GitHub repo Settings → Secrets → Actions
```

### 12.3 EDGAR 8-K Parser Logic

Target 8-K items from MicroStrategy (CIK: 0001050446):

```typescript
// Pseudocode for EDGAR parser
async function parseStrategyEightK(accessionNo: string) {
  const filing = await fetchEdgarFiling(accessionNo);
  
  // Pattern: "XX,XXX bitcoin" or "XXX,XXX BTC"
  const btcMatch = filing.text.match(/(\d{1,3}(?:,\d{3})*)\s*(?:bitcoin|BTC)/gi);
  
  // Pattern: ATM proceeds table (look for dollar amounts near "ATM" or "at-the-market")
  const atmMatch = filing.text.match(/\$[\d,.]+ (?:million|billion).*(?:ATM|at-the-market)/gi);
  
  // Pattern: shares issued table
  const sharesMatch = filing.text.match(/(\d{1,3}(?:,\d{3})*)\s*shares.*(?:Class A|common)/gi);
  
  // Pattern: STRC rate announcement
  // "dividend rate.*(\d+\.\d+)%.*STRC" or "STRC.*(\d+\.\d+)%"
  const rateMatch = filing.text.match(/STRC.*?(\d+\.\d+)%|(\d+\.\d+)%.*?STRC/gi);
  
  // Pattern: USD Reserve
  const reserveMatch = filing.text.match(/\$[\d.]+\s*billion.*(?:USD Reserve|reserve)/gi);
  
  return { btc, atm_proceeds, shares_issued, strc_rate, usd_reserve };
}
```

---

## 13. Tech Stack and Deployment Specification

### 13.1 Application Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js | 15 (App Router) | Use server components for data fetching |
| Language | TypeScript | 5.x | Strict mode enabled |
| Styling | Tailwind CSS | 3.x | Core utilities only (no JIT compiler assumption) |
| ORM | Drizzle ORM | Latest | Use pooled connection in API routes |
| Database | Neon PostgreSQL | Serverless | US East (Ohio) — same region as Vercel default |
| Charts | Recharts or Chart.js | Latest | Recharts preferred for React integration |
| Deployment | Vercel | Pro plan | Required for 60s function timeout and cron |
| Version control | GitHub | — | Main branch = production |
| Domain | Cloudflare | — | DNS management |
| Market data | FMP (Financial Modeling Prep) | v3 | Paid plan required |
| Crypto prices | CoinGecko | Free tier | Cache aggressively |
| SOFR data | FRED API | Free | Federal Reserve Economic Data |
| BTC/ATM data | SEC EDGAR | Free | No API key required |

### 13.2 Repository Structure

```
strc-platform/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Dashboard home
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── cron/
│   │       │   ├── prices/route.ts
│   │       │   ├── daily-metrics/route.ts
│   │       │   ├── sofr/route.ts
│   │       │   └── edgar-check/route.ts
│   │       └── data/
│   │           ├── snapshot/route.ts   # Current state for dashboard
│   │           ├── history/route.ts    # Time series for charts
│   │           └── tranche/route.ts    # Tranche product metrics
│   ├── db/
│   │   ├── schema.ts                   # Drizzle schema (all tables above)
│   │   ├── client.ts                   # Neon client setup (pooled + direct)
│   │   └── queries/
│   │       ├── prices.ts
│   │       ├── metrics.ts
│   │       └── capital.ts
│   ├── lib/
│   │   ├── estimators/
│   │   │   ├── atm-share-estimator.ts
│   │   │   ├── btc-holdings-estimator.ts
│   │   │   └── sofr-forward-model.ts
│   │   ├── calculators/
│   │   │   ├── mnav.ts
│   │   │   ├── coverage-ratios.ts
│   │   │   ├── volatility.ts
│   │   │   ├── beta.ts
│   │   │   └── tranche-metrics.ts
│   │   ├── parsers/
│   │   │   └── edgar-8k-parser.ts
│   │   └── utils/
│   │       ├── market-hours.ts          # isMarketOpen(): boolean — used by prices cron
│   │       └── numeric.ts               # rate_pct helpers, safe division, bps conversion
│   └── components/
│       ├── dashboard/
│       └── charts/
├── scripts/
│   └── backfill/
│       ├── price-backfill.ts
│       ├── rate-history-reconstruction.ts
│       ├── atm-calibration.ts
│       └── edgar-full-scan.ts
├── drizzle/                            # Migration files
├── .github/
│   └── workflows/
│       └── backfill.yml
├── vercel.json                         # Cron definitions
├── drizzle.config.ts
├── package.json
└── .env.local                          # Local dev only — never commit
```

### 13.3 Environment Variables

```bash
# .env.local (local dev) and Vercel dashboard (production)

# Database
NEON_DATABASE_URL=postgresql://user:pass@host/db?sslmode=require&pgbouncer=true
NEON_DATABASE_DIRECT_URL=postgresql://user:pass@host/db?sslmode=require

# Market data APIs
FMP_API_KEY=your_fmp_key_here
FRED_API_KEY=your_fred_key_here
COINGECKO_API_KEY=                      # Optional — free tier works without key

# Security
CRON_SECRET=random_secret_for_cron_auth  # Validate in all cron routes

# Application
NEXT_PUBLIC_APP_ENV=production
```

### 13.4 Neon Client Setup

```typescript
// src/db/client.ts
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool as PgPool } from 'pg';
import ws from 'ws';

// Required for Neon serverless in Node.js environments (Vercel functions)
neonConfig.webSocketConstructor = ws;

// Pooled connection — use in ALL API routes, server components, and cron handlers
// This uses Neon's HTTP/WebSocket transport optimised for serverless (no persistent connections)
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
export const db = drizzle(pool);

// Direct connection — use ONLY in long-running scripts (GitHub Actions backfills)
// NOT for Vercel functions (exceeds connection limits under load)
// In backfill scripts: import { directDb } from '@/db/client'
const pgPool = new PgPool({ connectionString: process.env.NEON_DATABASE_DIRECT_URL });
export const directDb = drizzlePg(pgPool);
```

### 13.5 Vercel Deployment

1. Connect GitHub repo to Vercel
2. Set all environment variables in Vercel dashboard (Settings → Environment Variables)
3. Set `NEON_DATABASE_URL` and `NEON_DATABASE_DIRECT_URL` as separate variables
4. Enable Vercel Pro plan for 60-second function timeout and cron support
5. In `vercel.json`, add cron definitions (see Section 12.1)
6. Set Cloudflare DNS A/CNAME records to Vercel nameservers
7. Run initial database migration: `npx drizzle-kit push`
8. Run historical backfill via GitHub Actions before first deploy

### 13.6 Rate Limiting and Caching Strategy

| Source | Rate Limit | Caching Strategy |
|---|---|---|
| FMP | Varies by plan (250-750 req/min typical) | Cache quotes 30s in memory, EOD history 24hrs in DB |
| CoinGecko | 30 req/min (free) | Cache BTC price 60s, history 1hr |
| FRED | 120 req/min | Cache SOFR 24hrs |
| EDGAR | ~10 req/sec polite | Cache filing list 1hr, full filings indefinitely once parsed |

Use Vercel KV or in-memory Map for sub-minute caching in serverless functions where DB writes would be excessive.

---

## Appendix A — STRC Rate History (Seed Data)

### ⚠️ Claude Code Execution Instruction — Read Before Seeding

**Do NOT seed the `strc_rate_history` table directly from the table below without first running the reconstruction script.** The rate entries marked "Estimated" between July 2025 and November 2025 are interpolated from context and have not been verified against primary sources. Seeding unverified data will corrupt the rate history chart and all downstream rate floor calculations.

**Mandatory sequence before any DB seed of `strc_rate_history`:**

```
Step 1: Run the backfill script first:
        npx ts-node scripts/backfill/rate-history-reconstruction.ts

        This script will:
        a) Pull all MSTR 8-K filings from EDGAR since 2025-07-29
           using CIK 0001050446 via https://data.sec.gov/submissions/CIK0001050446.json
        b) Full-text search each filing for STRC rate announcements
           using patterns: /STRC.*?(\d+\.\d+)%|(\d+\.\d+)%.*?STRC/gi
           and:            /monthly.*?dividend.*?rate.*?(\d+\.\d+)/gi
        c) Build a verified {effective_date, rate_pct, source} array
           from confirmed primary source data only
        d) Print a reconciliation report comparing confirmed rates
           against the estimated rates in Appendix A
        e) Write ONLY confirmed entries to strc_rate_history

Step 2: After the script completes, check the reconciliation report.
        For any month where no 8-K rate announcement was found,
        the script will flag the gap. For flagged gaps:
        a) Check Strategy press releases on businesswire.com
           searching: site:businesswire.com "STRC" "dividend rate"
        b) Manually insert verified rates with source URL noted
        c) Leave genuinely unconfirmed months NULL rather than
           inserting estimated values — the chart handles NULL gaps.

Step 3: Only after Steps 1-2 are complete, use the table below
        as a REFERENCE CHECK against what the script produced.
        If a confirmed script result differs from this table,
        trust the primary source (EDGAR/press release) over this table.
```

**Partially estimated reference table** (do not seed directly — for cross-reference only after script runs):

| Effective Date | Rate (%) | Status | Source |
|---|---|---|---|
| 2025-07-29 | 9.00 | ✅ Confirmed | IPO / Certificate of Designations |
| 2025-09-01 | 9.25 | ⚠️ Estimated | Verify via EDGAR 8-K |
| 2025-10-01 | 9.75 | ⚠️ Estimated | Verify via EDGAR 8-K |
| 2025-11-01 | 10.50 | ✅ Confirmed | Q3 2025 earnings release (Oct 30 2025) |
| 2025-12-01 | 11.00 | ⚠️ Estimated | Verify via EDGAR 8-K |
| 2026-01-01 | 11.25 | ✅ Confirmed | Q4 2025 earnings release (Feb 5 2026) |
| 2026-02-01 | 11.25 | ✅ Confirmed | Q4 2025 earnings release (Feb 5 2026) |

**Known confirmed data points for script validation:** The script should find at minimum the four confirmed entries above. If it does not find rate announcements for 2025-11-01 (10.50%) and 2026-01-01 (11.25%), the EDGAR parser regex needs tuning — do not proceed to seed until these two confirmed points are recovered by the script.

---

## Appendix B — Key Formulas Reference Card

```
-- All rates stored and expressed as percentage points (e.g. 11.25, not 0.1125)
-- unless explicitly noted as decimal

mNAV                = MSTR_MarketCap / (BTC_Holdings × BTC_Price)
                      [Software_Business_Value ~$100M omitted — negligible vs $52B+ BTC_NAV]
BTC_Coverage        = (BTC_Holdings × BTC_Price) / (Convert_Notional + STRF + STRC + Accrued)
STRC_Impairment_BTC = Total_Senior_Claims / BTC_Holdings
Effective_Yield_pct = rate_pct / STRC_Price × 100
                      [e.g. rate_pct=11.25, price=95.00 → yield=11.84%]
USD_Coverage_Months = USD_Reserve / (Annual_Obligations / 12)
Min_Rate_Next_Month = max(SOFR_pct, rate_pct - 0.25)
                      [subtract 0.25 percentage points, not 0.25%; e.g. 11.25 - 0.25 = 11.00]
Vol_30d             = std(log_returns, 30d) × sqrt(252)
Beta_to_X           = Cov(STRC_returns, X_returns) / Var(X_returns)
SCR                 = (STRC_rate_pct × Pool) / (Senior_target_pct × Senior_Notional)
                      [e.g. (11.25 × Pool) / (7.5 × 0.67 × Pool) = 2.24x for Config B]
Excess_Spread       = STRC_rate_pct - (Senior_target_pct × Senior_Pct_of_Pool)
Junior_Yield        = Excess_Spread / Junior_Pct_of_Pool
```

---

*End of Phase 1 Document — STRC Intelligence Platform*  
*Next: Phase 2 — Dashboard Wireframe and UI Specification*
