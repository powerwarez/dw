import React, { useEffect } from "react";

interface Calculation {
  targetPrice: number;
  buyAmount: number;
  reservationPeriod: number;
}

interface Settings {
  safeMaxDays: number;
  aggressiveMaxDays: number;
  // 다른 설정 필드들...
}

interface TradeCalculatorProps {
  calculation: Calculation;
  initialInvestment: number;
  currentSeed: number;
  onCalculate: (initialInvestment: number, currentSeed: number) => void;
  mode: "safe" | "aggressive";
  settings: Settings;
}

// 거래일 계산을 위한 유틸리티 함수들
const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6; // 0은 일요일, 6은 토요일
};

const getNthDayOfWeek = (
  year: number,
  month: number,
  dayOfWeek: number,
  n: number
): Date => {
  const date = new Date(year, month, 1);
  const add = (dayOfWeek - date.getDay() + 7) % 7;
  date.setDate(1 + add + (n - 1) * 7);
  return date;
};

const getLastDayOfWeek = (
  year: number,
  month: number,
  dayOfWeek: number
): Date => {
  const date = new Date(year, month + 1, 0);
  const sub = (date.getDay() - dayOfWeek + 7) % 7;
  date.setDate(date.getDate() - sub);
  return date;
};

const getUSHolidays = (year: number): Date[] => {
  const holidays = [];

  // 새해
  holidays.push(new Date(year, 0, 1));

  // 마틴 루터 킹 주니어의 날 (1월 셋째 월요일)
  holidays.push(getNthDayOfWeek(year, 0, 1, 3));

  // 대통령의 날 (2월 셋째 월요일)
  holidays.push(getNthDayOfWeek(year, 1, 1, 3));

  // 메모리얼 데이 (5월 마지막 월요일)
  holidays.push(getLastDayOfWeek(year, 4, 1));

  // 독립기념일
  holidays.push(new Date(year, 6, 4));

  // 노동절 (9월 첫째 월요일)
  holidays.push(getNthDayOfWeek(year, 8, 1, 1));

  // 추수감사절 (11월 넷째 목요일)
  holidays.push(getNthDayOfWeek(year, 10, 4, 4));

  // 크리스마스
  holidays.push(new Date(year, 11, 25));

  // 주말에 해당하는 공휴일 조정
  return holidays.map((holiday) => {
    const day = holiday.getDay();
    if (day === 6) {
      // 토요일이면 금요일로 조정
      holiday.setDate(holiday.getDate() - 1);
    } else if (day === 0) {
      // 일요일이면 월요일로 조정
      holiday.setDate(holiday.getDate() + 1);
    }
    return holiday;
  });
};

const isHoliday = (date: Date): boolean => {
  const year = date.getFullYear();
  const holidays = getUSHolidays(year);
  return holidays.some(
    (holiday) =>
      holiday.getFullYear() === date.getFullYear() &&
      holiday.getMonth() === date.getMonth() &&
      holiday.getDate() === date.getDate()
  );
};

const addTradingDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  let tradingDays = 0;

  while (tradingDays < days) {
    result.setDate(result.getDate() + 1);
    if (!isWeekend(result) && !isHoliday(result)) {
      tradingDays++;
    }
  }

  return result;
};

const TradeCalculator: React.FC<TradeCalculatorProps> = ({
  calculation,
  initialInvestment,
  currentSeed,
  onCalculate,
  mode,
  settings,
}) => {
  useEffect(() => {
    onCalculate(initialInvestment, currentSeed);
  }, [initialInvestment, currentSeed, onCalculate]);

  const profitRate =
    ((currentSeed - initialInvestment) / initialInvestment) * 100;

  // 거래일 기준으로 예약 기간 계산
  const reservationPeriod =
    mode === "safe" ? settings.safeMaxDays : settings.aggressiveMaxDays;
  const reservationEndDate = addTradingDays(new Date(), reservationPeriod);

  return (
    <div className="bg-gray-800 rounded-lg p-6 w-full">
      <h1 className="text-3xl font-bold text-center mb-6 bg-clip-text text-transparent bg-gradient-to-r from-pink-300 via-purple-300 to-blue-300">
        기계처럼 투자해서 부자되자 동파법
      </h1>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-700 p-4 rounded">
          <h3 className="text-lg mb-2">초기 투자금</h3>
          <p className="text-2xl font-bold text-yellow-400">
            ${initialInvestment.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-700 p-4 rounded">
          <h3 className="text-lg mb-2">현재 투자금</h3>
          <p className="text-2xl font-bold text-green-400">
            ${currentSeed.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-700 p-4 rounded">
          <h3 className="text-lg mb-2">현재 수익률</h3>
          <p
            className={`text-2xl font-bold ${
              profitRate >= 0 ? "text-red-400" : "text-blue-400"
            }`}
          >
            {profitRate.toFixed(2)}%
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="text-xl mb-4">오늘의 매수</h2>
          <div className="bg-gray-700 p-4 rounded">
            <h3 className="text-lg mb-2">목표 매수가</h3>
            <p className="text-2xl font-bold text-red-400">
              ${calculation.targetPrice.toFixed(2)}
            </p>
          </div>
          <div className="bg-gray-700 p-4 rounded">
            <h3 className="text-lg mb-2">매수 수량</h3>
            <p className="text-2xl font-bold text-red-400">
              {calculation.buyAmount}주
            </p>
          </div>
        </div>
        <div>
          <h2 className="text-xl mb-4">오늘의 MOC 매도</h2>
          <div className="bg-gray-700 p-4 rounded flex justify-between">
            <div>
              <h3 className="text-lg mb-2">목표 매도가</h3>
              <p className="text-2xl font-bold text-blue-400">
                ${calculation.targetPrice.toFixed(2)}
              </p>
            </div>
            <div>
              <h3 className="text-lg mb-2">매도 수량</h3>
              <p className="text-2xl font-bold text-blue-400">
                {calculation.buyAmount}주
              </p>
            </div>
            <div>
              <h3 className="text-lg mb-2">예약 기간</h3>
              <p className="text-2xl font-bold text-blue-400">
                {reservationEndDate.toLocaleDateString("ko-KR", {
                  year: "2-digit",
                  month: "2-digit",
                  day: "2-digit",
                })}{" "}
                까지
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradeCalculator;
