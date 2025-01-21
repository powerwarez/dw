export function calculateRSI(prices: number[], window: number = 14): number[] {
  const rsi: number[] = [];
  const deltas: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  // Calculate deltas and separate gains/losses
  for (let i = 1; i < prices.length; i++) {
    const delta = prices[i] - prices[i - 1];
    deltas.push(delta);
    gains.push(delta > 0 ? delta : 0);
    losses.push(delta < 0 ? -delta : 0);
  }

  // Calculate initial SMA for gains and losses
  let avgGain = 0;
  let avgLoss = 0;
  const initialWindow = Math.min(window, deltas.length);

  for (let i = 0; i < initialWindow; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }

  avgGain = avgGain / window;
  avgLoss = avgLoss / window;

  // First RSI value
  let rs = avgLoss === 0 ? (avgGain === 0 ? 0 : 100) : avgGain / avgLoss;
  rsi.push(100 - 100 / (1 + rs));

  // Calculate subsequent values using Wilder's smoothing
  for (let i = window; i < deltas.length; i++) {
    // Wilder's smoothing formula
    avgGain = (avgGain * (window - 1) + gains[i]) / window;
    avgLoss = (avgLoss * (window - 1) + losses[i]) / window;

    rs = avgLoss === 0 ? (avgGain === 0 ? 0 : 100) : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }

  // Fill initial values with NaN
  const padding = new Array(window).fill(NaN);
  const result = [...padding, ...rsi];

  if (result.length > prices.length) {
    result.splice(0, result.length - prices.length);
  }
  console.log(result);
  return result;
}
