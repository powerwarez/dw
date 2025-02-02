import React, { useEffect, useState } from "react";

interface Calculation {
  targetPrice: number;
  buyAmount: number;
  reservationPeriod: number;
}

interface Settings {
  safeMaxDays: number;
  aggressiveMaxDays: number;
  safeBuyPercent: number;
  aggressiveBuyPercent: number;
  seedDivision: number;
}

interface Trade {
  targetSellPrice: number;
  quantity: number;
  sellQuantity?: number;
  daysUntilSell: number;
  actualBuyPrice?: number;
  buyDate: string;
  mode: string;
}

interface PriceEntry {
  price: string;
  date: string;
}

interface TradeCalculatorProps {
  calculation: Calculation;
  initialInvestment: number;
  currentSeed: number;
  onCalculate: (initialInvestment: number, currentSeed: number) => void;
  mode: "safe" | "aggressive";
  settings: Settings;
  trades?: Trade[];
  yesterdaySell?: Trade;
  closingPrices: PriceEntry[];
  zeroDayTrades?: Trade[];
}

// 거래일 계산을 위한 유틸리티 함수들
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

export const isHoliday = (date: Date): boolean => {
  const year = date.getFullYear();
  const holidays = getUSHolidays(year);
  return holidays.some(
    (holiday) =>
      holiday.getFullYear() === date.getFullYear() &&
      holiday.getMonth() === date.getMonth() &&
      holiday.getDate() === date.getDate()
  );
};

const TradeCalculator: React.FC<TradeCalculatorProps> = ({
  // calculation,
  initialInvestment,
  currentSeed,
  // onCalculate,
  mode,
  settings,
  // trades = [],
  yesterdaySell,
  closingPrices,
  zeroDayTrades,
}) => {
  const [targetBuyPrice, setTargetBuyPrice] = useState<number>(0);
  const [buyQuantity, setBuyQuantity] = useState<number>(0);

  useEffect(() => {
    if (closingPrices.length > 0) {
      // 전일 종가 찾기
      const previousClosePrice = parseFloat(
        closingPrices[closingPrices.length - 1].price
      );

      // 매수가 계산
      const buyPercent =
        mode === "safe"
          ? settings.safeBuyPercent
          : settings.aggressiveBuyPercent;
      const calculatedTargetBuyPrice =
        previousClosePrice * (1 + buyPercent / 100);
      const calculatedBuyQuantity = Math.floor(
        currentSeed / settings.seedDivision / calculatedTargetBuyPrice
      );

      // 상태 업데이트
      setTargetBuyPrice(calculatedTargetBuyPrice);
      setBuyQuantity(calculatedBuyQuantity);
    }
  }, [closingPrices, currentSeed, mode, settings]);

  const profitRate =
    ((currentSeed - initialInvestment) / initialInvestment) * 100;

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
          <div className="bg-gray-700 p-4 rounded flex justify-around">
            <div className="flex flex-col items-center mx-2 mb-4">
              <h3 className="text-lg mb-2">매수가</h3>
              <p className="text-xl font-bold text-red-400">
                ${targetBuyPrice.toFixed(2)}
              </p>
            </div>
            <div className="flex flex-col items-center mx-2 mb-4">
              <h3 className="text-lg mb-2">수량</h3>
              <p className="text-xl font-bold text-red-400">{buyQuantity}주</p>
            </div>
          </div>
        </div>
        <div>
          <h2 className="text-xl mb-4">오늘의 매도</h2>
          <div className="bg-gray-700 p-4 rounded flex justify-around">
            {yesterdaySell && (
              <div className="flex flex-col items-center mx-2 mb-4">
                <h3 className="text-lg mb-2">매도가</h3>
                <p className="text-xl font-bold text-blue-400">
                  ${yesterdaySell.targetSellPrice?.toFixed(2)}
                </p>
                <h3 className="text-lg mb-2">수량</h3>
                <p className="text-xl font-bold text-blue-400">
                  {yesterdaySell.quantity}주
                </p>
                <h3 className="text-lg mb-2">기간</h3>
                <p className="text-xl font-bold text-blue-400">
                  ~
                  {new Date(
                    new Date().setDate(
                      new Date().getDate() + yesterdaySell.daysUntilSell
                    )
                  ).toLocaleDateString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                  })}
                </p>
              </div>
            )}
            {zeroDayTrades && zeroDayTrades.length > 0 && (
              <div>
                {zeroDayTrades.map((trade, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col items-center mx-2 mb-4"
                  >
                    <h3 className="text-lg mb-2">매도가</h3>
                    <p className="text-xl font-bold text-blue-400">
                      {trade.targetSellPrice?.toFixed(2)}
                    </p>
                    <h3 className="text-lg mb-2">수량</h3>
                    <p className="text-xl font-bold text-blue-400">
                      {trade.quantity}주
                    </p>
                    <h3 className="text-lg mb-2">기간</h3>
                    <p className="text-xl font-bold text-blue-400">MOC</p>
                  </div>
                ))}
              </div>
            )}
            {!yesterdaySell &&
              (!zeroDayTrades || zeroDayTrades.length === 0) && (
                <div className="text-center text-white p-4">
                  <p>오늘 매도는 없습니다</p>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradeCalculator;
