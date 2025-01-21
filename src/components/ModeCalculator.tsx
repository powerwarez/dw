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
  try {
    const response = await fetch(
      "https://rsi-api-powerwarezs-projects.vercel.app/"
    );
    const data = await response.json();

    if (!data.success) {
      throw new Error("Failed to fetch RSI values");
    }
    const rsiValues = data.data;
    // 가장 최근 두 개의 값
    const qqqRsiLateLate = rsiValues[rsiValues.length - 2].rsi;
    const qqqRsiLate = rsiValues[rsiValues.length - 1].rsi;

    const mode = thisWeekMode(qqqRsiLate, qqqRsiLateLate);
    if (mode !== "previous") {
      return mode;
    }
    return "safe"; // 기본 모드
  } catch (error) {
    console.error("Error fetching RSI values:", error);
    return "safe"; // 기본값으로 "safe" 반환
  }
}
