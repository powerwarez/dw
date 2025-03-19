import React, { useEffect, useState } from "react";
import supabase from "../utils/supabase";

interface Settings {
  safeMaxDays: number;
  aggressiveMaxDays: number;
  safeBuyPercent: number;
  aggressiveBuyPercent: number;
  seedDivision: number;
  currentInvestment: number;
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
  initialInvestment: number;
  mode: "safe" | "aggressive";
  settings: Settings;
  userId: string; // 추가: 동파 데이터 조회를 위한 사용자 ID
  yesterdaySell?: Trade;
  closingPrices: PriceEntry[];
  zeroDayTrades?: Trade[];
  seedUpdateTrigger?: number; // 추가: 시드 업데이트 트리거
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
  initialInvestment,
  mode,
  settings,
  userId,
  yesterdaySell,
  closingPrices,
  zeroDayTrades,
  seedUpdateTrigger,
}) => {
  const [targetBuyPrice, setTargetBuyPrice] = useState<number>(0);
  const [buyQuantity, setBuyQuantity] = useState<number>(0);
  const [isMobile, setIsMobile] = useState(false);

  // dynamicwave 테이블의 updatedSeed 컬럼 데이터를 조회하여 최신 seed 값을 설정합니다.
  const [latestSeed, setLatestSeed] = useState<number>(
    settings.currentInvestment
  );

  // 화면 크기 감지
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    // 초기 로드 시 체크
    checkIfMobile();

    // 리사이즈 이벤트 리스너 추가
    window.addEventListener("resize", checkIfMobile);

    // 컴포넌트 언마운트 시 이벤트 리스너 제거
    return () => {
      window.removeEventListener("resize", checkIfMobile);
    };
  }, []);

  useEffect(() => {
    async function fetchLatestSeed() {
      if (!userId) return;
      console.log("TradeCalculator: 최신 시드 값 조회 중...");
      const { data, error } = await supabase
        .from("dynamicwave")
        .select("updatedSeed")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.error("Error fetching updatedSeed from dynamicwave:", error);
        return;
      }
      if (data?.updatedSeed) {
        // updatedSeed가 배열 형태(예: [{ date: "2025-01-16", value: 78681.93 }, ...])라면
        if (Array.isArray(data.updatedSeed) && data.updatedSeed.length > 0) {
          const sorted = data.updatedSeed.sort(
            (
              a: { date: string; value: number },
              b: { date: string; value: number }
            ) => a.date.localeCompare(b.date)
          );
          const newSeedValue = sorted[sorted.length - 1].value;
          console.log(
            `TradeCalculator: 최신 시드 값 업데이트 - ${newSeedValue}`
          );
          setLatestSeed(newSeedValue);
        } else {
          setLatestSeed(data.updatedSeed);
        }
      }
    }
    fetchLatestSeed();
  }, [userId, seedUpdateTrigger]); // seedUpdateTrigger 의존성 추가

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
      
      // 시드 소진 여부 확인 (최소 1주도 매수 불가능한 경우)
      const minRequiredFund = calculatedTargetBuyPrice * 1; // 최소 1주 필요 금액
      const isSeedExhausted = latestSeed / settings.seedDivision < minRequiredFund;
      
      // 시드가 부족하면 매수 수량 0으로 설정
      const calculatedBuyQuantity = isSeedExhausted 
        ? 0 
        : Math.floor(latestSeed / settings.seedDivision / calculatedTargetBuyPrice);

      // 시드 부족 로그 출력
      if (isSeedExhausted) {
        console.log(`시드 부족으로 매수 불가 (필요 금액: ${minRequiredFund}, 가용 시드: ${latestSeed / settings.seedDivision})`);
      }

      // 상태 업데이트
      setTargetBuyPrice(calculatedTargetBuyPrice);
      setBuyQuantity(calculatedBuyQuantity);
    }
  }, [closingPrices, latestSeed, mode, settings]);

  const profitRate =
    ((latestSeed - initialInvestment) / initialInvestment) * 100;

  return (
    <div className="bg-gray-800 rounded-lg p-6 w-full">
      <style>{`
        /* 모바일 최적화를 위한 스타일 */
        @media (max-width: 768px) {
          .mobile-text-sm {
            font-size: 0.875rem !important;
          }
          .mobile-text-lg {
            font-size: 1rem !important;
          }
          .mobile-text-xl {
            font-size: 1.125rem !important;
          }
          .mobile-text-2xl {
            font-size: 1.25rem !important;
          }
          .mobile-text-3xl {
            font-size: 1.5rem !important;
          }
          .mobile-p-2 {
            padding: 0.5rem !important;
          }
          .mobile-p-3 {
            padding: 0.75rem !important;
          }
          .mobile-mb-2 {
            margin-bottom: 0.5rem !important;
          }
          .mobile-mb-3 {
            margin-bottom: 0.75rem !important;
          }
          .mobile-space-x-4 > * + * {
            margin-left: 1rem !important;
          }
        }
      `}</style>
      <h1
        className={`text-3xl font-bold text-center mb-6 bg-clip-text text-transparent bg-gradient-to-r from-pink-300 via-purple-300 to-blue-300 ${
          isMobile ? "mobile-text-xl mobile-mb-3" : ""
        }`}
      >
        기계처럼 투자해서 부자되자 동파법
      </h1>
      <div
        className={`grid ${
          isMobile ? "grid-cols-1" : "grid-cols-3"
        } gap-4 mb-6`}
      >
        <div
          className={`bg-gray-700 ${
            isMobile ? "p-3 mobile-p-3" : "p-4"
          } rounded text-center`}
        >
          <h3
            className={`${
              isMobile ? "text-base mobile-text-sm mobile-mb-2" : "text-lg mb-2"
            }`}
          >
            초기 투자금
          </h3>
          <p
            className={`${
              isMobile ? "text-lg mobile-text-lg" : "text-2xl"
            } font-bold text-yellow-400`}
          >
            ${initialInvestment.toLocaleString()}
          </p>
        </div>
        <div
          className={`bg-gray-700 ${
            isMobile ? "p-3 mobile-p-3" : "p-4"
          } rounded text-center`}
        >
          <h3
            className={`${
              isMobile ? "text-base mobile-text-sm mobile-mb-2" : "text-lg mb-2"
            }`}
          >
            현재 투자금
          </h3>
          <p
            className={`${
              isMobile ? "text-lg mobile-text-lg" : "text-2xl"
            } font-bold text-green-400`}
          >
            ${latestSeed.toLocaleString()}
          </p>
        </div>
        <div
          className={`bg-gray-700 ${
            isMobile ? "p-3 mobile-p-3" : "p-4"
          } rounded text-center`}
        >
          <h3
            className={`${
              isMobile ? "text-base mobile-text-sm mobile-mb-2" : "text-lg mb-2"
            }`}
          >
            현재 수익률
          </h3>
          <p
            className={`${
              isMobile ? "text-lg mobile-text-lg" : "text-2xl"
            } font-bold ${profitRate >= 0 ? "text-red-400" : "text-blue-400"}`}
          >
            {profitRate.toFixed(2)}%
          </p>
        </div>
      </div>
      <div className={`grid ${isMobile ? "grid-cols-1" : "grid-cols-2"} gap-4`}>
        <div>
          <h2
            className={`${
              isMobile ? "text-lg mobile-text-lg mobile-mb-2" : "text-xl mb-4"
            }`}
          >
            오늘의 매수
          </h2>
          <div
            className={`bg-gray-700 ${
              isMobile ? "p-3 mobile-p-3" : "p-4"
            } rounded flex justify-around`}
          >
            <div className="flex flex-col items-center mx-2 mb-4">
              <h3
                className={`${
                  isMobile
                    ? "text-base mobile-text-sm mobile-mb-2"
                    : "text-lg mb-2"
                }`}
              >
                매수가
              </h3>
              <p
                className={`${
                  isMobile ? "text-base mobile-text-lg" : "text-xl"
                } font-bold text-red-400`}
              >
                ${targetBuyPrice.toFixed(2)}
              </p>
            </div>
            <div className="flex flex-col items-center mx-2 mb-4">
              <h3
                className={`${
                  isMobile
                    ? "text-base mobile-text-sm mobile-mb-2"
                    : "text-lg mb-2"
                }`}
              >
                수량
              </h3>
              <p
                className={`${
                  isMobile ? "text-base mobile-text-lg" : "text-xl"
                } font-bold text-red-400`}
              >
                {buyQuantity}주
              </p>
            </div>
          </div>
        </div>
        <div>
          <h2
            className={`${
              isMobile ? "text-lg mobile-text-lg mobile-mb-2" : "text-xl mb-4"
            }`}
          >
            오늘의 매도
          </h2>
          {yesterdaySell && yesterdaySell.quantity > 0 ? (
            <div
              className={`bg-gray-700 ${
                isMobile ? "p-3 mobile-p-3" : "p-4"
              } rounded flex justify-around`}
            >
              <div
                className={`flex flex-row items-center ${
                  isMobile ? "space-x-4 mobile-space-x-4" : "space-x-8"
                }`}
              >
                <div className="flex flex-col items-center">
                  <h3
                    className={`${
                      isMobile
                        ? "text-base mobile-text-sm mobile-mb-2"
                        : "text-lg mb-2"
                    }`}
                  >
                    매도가
                  </h3>
                  <p
                    className={`${
                      isMobile ? "text-base mobile-text-lg" : "text-xl"
                    } font-bold text-blue-400`}
                  >
                    ${yesterdaySell.targetSellPrice?.toFixed(2)}
                  </p>
                </div>
                <div className="flex flex-col items-center">
                  <h3
                    className={`${
                      isMobile
                        ? "text-base mobile-text-sm mobile-mb-2"
                        : "text-lg mb-2"
                    }`}
                  >
                    수량
                  </h3>
                  <p
                    className={`${
                      isMobile ? "text-base mobile-text-lg" : "text-xl"
                    } font-bold text-blue-400`}
                  >
                    {yesterdaySell.quantity}주
                  </p>
                </div>
                <div className="flex flex-col items-center">
                  <h3
                    className={`${
                      isMobile
                        ? "text-base mobile-text-sm mobile-mb-2"
                        : "text-lg mb-2"
                    }`}
                  >
                    기간
                  </h3>
                  <p
                    className={`${
                      isMobile ? "text-base mobile-text-lg" : "text-xl"
                    } font-bold text-blue-400`}
                  >
                    ~
                    {new Date(
                      new Date().setDate(
                        new Date().getDate() + yesterdaySell.daysUntilSell + 1
                      )
                    ).toLocaleDateString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {zeroDayTrades &&
          zeroDayTrades.length > 0 &&
          zeroDayTrades.some((trade) => trade.quantity > 0) ? (
            <div
              className={`bg-gray-700 ${
                isMobile ? "p-3 mobile-p-3" : "p-4"
              } rounded flex justify-around`}
            >
              {zeroDayTrades
                .filter((trade) => trade.quantity > 0)
                .map((trade, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-row items-center ${
                      isMobile ? "space-x-4 mobile-space-x-4" : "space-x-8"
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <h3
                        className={`${
                          isMobile
                            ? "text-base mobile-text-sm mobile-mb-2"
                            : "text-lg mb-2"
                        }`}
                      >
                        수량
                      </h3>
                      <p
                        className={`${
                          isMobile ? "text-base mobile-text-lg" : "text-xl"
                        } font-bold text-blue-400`}
                      >
                        {trade.quantity}주
                      </p>
                    </div>
                    <div className="flex flex-col items-center">
                      <h3
                        className={`${
                          isMobile
                            ? "text-base mobile-text-sm mobile-mb-2"
                            : "text-lg mb-2"
                        }`}
                      >
                        기간
                      </h3>
                      <p
                        className={`${
                          isMobile ? "text-base mobile-text-lg" : "text-xl"
                        } font-bold text-blue-400`}
                      >
                        MOC
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          ) : null}
          {(!yesterdaySell || yesterdaySell.quantity <= 0) &&
            (!zeroDayTrades ||
              zeroDayTrades.length === 0 ||
              !zeroDayTrades.some((trade) => trade.quantity > 0)) && (
              <div className="text-center text-white p-4">
                <p className={isMobile ? "mobile-text-sm" : ""}>
                  오늘 매도는 없습니다
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default TradeCalculator;
