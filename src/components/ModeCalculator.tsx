// import { createClient } from "@supabase/supabase-js";
import { calculateRSI } from "../utils/calculateRSI";

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
  //console.log("rsiValues", rsiValues);
  if (rsiValues.length < 2) {
    throw new Error("Not enough RSI data");
  }

  const qqqRsiLateLate = rsiValues[rsiValues.length - 2];
  const qqqRsiLate = rsiValues[rsiValues.length - 1];

  const mode = thisWeekMode(qqqRsiLate, qqqRsiLateLate);
  // console.log("qqqRsiLateLate", qqqRsiLateLate);
  // console.log("qqqRsiLate", qqqRsiLate);
  if (mode !== "previous") {
    return mode;
  }

  return "safe"; // 기본 모드
}

// 테스트용 코드
calculateMode()
  .then((mode) => console.log("Calculated Mode:", mode))
  .catch((error) => console.error("Error calculating mode:", error));
