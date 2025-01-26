interface ModeCalculatorProps {
  date: string; // YYYY-MM-DD 형식의 날짜
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

async function fetchRSIData() {
  const response = await fetch(
    "https://rsi-api-powerwarezs-projects.vercel.app/"
  );
  const data = await response.json();

  if (!data.success) {
    throw new Error("Failed to fetch RSI values");
  }

  return data.data;
}

export async function calculateModeForDate(
  date: string
): Promise<"safe" | "aggressive"> {
  try {
    const rsiData = await fetchRSIData();

    // 날짜를 기준으로 이전 주와 이전 전주의 RSI를 찾습니다.
    const targetDate = new Date(date);
    const rsiEntries = rsiData.map((entry: { date: string; rsi: number }) => ({
      date: new Date(entry.date),
      rsi: entry.rsi,
    }));

    // 날짜를 기준으로 정렬
    rsiEntries.sort((a, b) => a.date.getTime() - b.date.getTime());

    // 해당 날짜 이전의 두 개의 RSI 값을 찾습니다.
    const index = rsiEntries.findIndex((entry) => entry.date >= targetDate);

    let qqqRsiLateLate: number;
    let qqqRsiLate: number;

    if (index === -1) {
      // targetDate 이후의 날짜가 없을 때, 마지막 두 개의 항목 사용
      qqqRsiLateLate = rsiEntries[rsiEntries.length - 2].rsi;
      qqqRsiLate = rsiEntries[rsiEntries.length - 1].rsi;
    } else {
      qqqRsiLateLate = rsiEntries[index - 2].rsi;
      qqqRsiLate = rsiEntries[index - 1].rsi;
    }

    const mode = thisWeekMode(qqqRsiLate, qqqRsiLateLate);
    if (mode !== "previous") {
      return mode;
    }
    return "safe"; // 기본 모드
  } catch (error) {
    console.error("Error calculating mode for date:", date, error);
    return "safe"; // 기본값으로 "safe" 반환
  }
}
