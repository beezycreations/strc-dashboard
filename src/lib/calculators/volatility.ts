/**
 * Volatility, Beta, and Correlation calculations
 * Source: Phase 1 Section 5
 */

/** Compute log returns from price array */
export function logReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return returns;
}

/** Standard deviation */
export function std(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Annualized realized volatility */
export function realizedVol(prices: number[], window: number): number {
  const returns = logReturns(prices.slice(-window - 1));
  return std(returns) * Math.sqrt(252);
}

/** Covariance of two return series */
export function cov(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const xSlice = x.slice(-n);
  const ySlice = y.slice(-n);
  const xMean = xSlice.reduce((a, b) => a + b, 0) / n;
  const yMean = ySlice.reduce((a, b) => a + b, 0) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (xSlice[i] - xMean) * (ySlice[i] - yMean);
  }
  return sum / (n - 1);
}

/** Variance */
export function variance(x: number[]): number {
  return cov(x, x);
}

/** Beta = Cov(X, Y) / Var(Y) */
export function beta(xPrices: number[], yPrices: number[], window: number): number {
  const xRet = logReturns(xPrices.slice(-window - 1));
  const yRet = logReturns(yPrices.slice(-window - 1));
  const v = variance(yRet);
  if (v === 0) return 0;
  return cov(xRet, yRet) / v;
}

/** Pearson correlation */
export function correlation(xPrices: number[], yPrices: number[], window: number): number {
  const xRet = logReturns(xPrices.slice(-window - 1));
  const yRet = logReturns(yPrices.slice(-window - 1));
  const xStd = std(xRet);
  const yStd = std(yRet);
  if (xStd === 0 || yStd === 0) return 0;
  return cov(xRet, yRet) / (xStd * yStd);
}

/** IV percentile rank (0-100) */
export function ivPercentile(history: number[], current: number): number {
  const valid = history.filter((v) => v != null && !isNaN(v));
  if (valid.length === 0) return 50;
  const below = valid.filter((v) => v < current).length;
  return (below / valid.length) * 100;
}

/** Vol signal based on ratio */
export function volSignal(volRatio: number): "normal" | "watch" | "stress" {
  if (volRatio > 1.5) return "stress";
  if (volRatio > 1.2) return "watch";
  return "normal";
}
