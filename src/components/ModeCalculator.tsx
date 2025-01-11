// import { createClient } from "@supabase/supabase-js";

// const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
// const supabaseKey = process.env.REACT_APP_SUPABASE_API_KEY;
// const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchYahooData(ticker: string): Promise<number[]> {
  const response = await fetch(
    `/api/v8/finance/chart/${ticker}?interval=1d&range=1y`
  );
  const data = await response.json();

  if (data.chart.error) {
    throw new Error("Failed to fetch stock data");
  }

  const closePrices = data.chart.result[0].indicators.quote[0].close;
  return calculateRSI(closePrices);
}

function calculateRSI(prices: number[], period: number = 14): number[] {
  let gains = 0;
  let losses = 0;
  const rsi: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }

    if (i >= period) {
      const avgGain = gains / period;
      const avgLoss = losses / period;
      const rs = avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));

      const firstChange = prices[i - period + 1] - prices[i - period];
      if (firstChange > 0) {
        gains -= firstChange;
      } else {
        losses += firstChange;
      }
    }
  }

  return rsi;
}

function thisWeekMode(
  qqqRsiLate: number,
  qqqRsiLateLate: number
): "safe" | "aggressive" | "previous" {
  const qqqUp = qqqRsiLateLate < qqqRsiLate;

  if (qqqRsiLateLate > 65 && !qqqUp) return "safe";
  if (qqqRsiLateLate > 40 && qqqRsiLateLate < 50 && !qqqUp) return "safe";
  if (qqqRsiLateLate >= 50 && qqqRsiLate < 50) return "safe";

  if (qqqRsiLateLate <= 50 && qqqRsiLate > 50) return "aggressive";
  if (qqqRsiLateLate > 50 && qqqRsiLateLate < 60 && qqqUp) return "aggressive";
  if (qqqRsiLateLate <= 35 && qqqUp) return "aggressive";

  return "previous";
}

export async function calculateMode(): Promise<"safe" | "aggressive"> {
  const rsiValues = await fetchYahooData("QQQ");

  if (rsiValues.length < 2) {
    throw new Error("Not enough RSI data");
  }

  const qqqRsiLateLate = rsiValues[rsiValues.length - 2];
  const qqqRsiLate = rsiValues[rsiValues.length - 1];

  const mode = thisWeekMode(qqqRsiLate, qqqRsiLateLate);

  if (mode !== "previous") {
    return mode;
  }

  return "safe"; // 기본 모드
}

// 테스트용 코드
calculateMode()
  .then((mode) => console.log("Calculated Mode:", mode))
  .catch((error) => console.error("Error calculating mode:", error));
