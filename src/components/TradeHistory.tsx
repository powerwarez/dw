import React, { useEffect, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { FaSpinner } from "react-icons/fa";
import supabase from "../utils/supabase";
import {
  formatDateToString,
  getTradingDaysBetween,
  addTradingDays,
  isTradingDay,
} from "../utils/dateUtils";

export interface PriceEntry {
  date: string;
  price: string;
}

export interface Settings {
  startDate: string;
  safeBuyPercent: number;
  safeSellPercent: number;
  seedDivision: number;
  safeMaxDays: number;
  profitCompounding: number;
  lossCompounding: number;
  aggressiveBuyPercent: number;
  aggressiveSellPercent: number;
  aggressiveMaxDays: number;
  withdrawalAmount: number;
  currentInvestment: number;
  manualFixInfo?: { [tradeId: string]: number };
  seedUpdates?: { [date: string]: number };
}

interface ModeItem {
  date: string;
  mode: "safe" | "aggressive";
}

export interface Trade {
  tradeIndex: number;
  buyDate: string;
  mode: string;
  targetBuyPrice: number;
  actualBuyPrice: number;
  quantity: number;
  targetSellPrice: number;
  sellDate?: string;
  actualSellPrice?: number;
  sellQuantity?: number;
  profit?: number;
  daysUntilSell: number;
  seedForDay: number;
  dailyProfit?: number;
  withdrawalAmount?: number;
  actualwithdrawalAmount?: number;
  manualFixedWithdrawal?: number;
}

export interface TradeHistoryProps {
  closingPrices: PriceEntry[];
  settings: Settings;
  onUpdateYesterdaySell: (sell: Trade) => void;
  onTradesUpdate?: (trades: Trade[]) => void;
  onZeroDayTradesUpdate?: (trades: Trade[]) => void;
  userId: string;
  modes?: ModeItem[];
  initialTrades?: Trade[];
  onSellInfoUpdate: (
    tradeIndex: number,
    updates: { sellQuantity?: number; sellPrice?: number; sellDate?: string }
  ) => Promise<void>;
  onSeedUpdate?: (newSeed: number) => void;
}

const TradeHistory: React.FC<TradeHistoryProps> = ({
  closingPrices,
  settings,
  onUpdateYesterdaySell,
  onTradesUpdate,
  onZeroDayTradesUpdate,
  userId,
  modes,
  initialTrades = [],
  onSellInfoUpdate,
  onSeedUpdate,
}) => {
  const [isModeLoading, setIsModeLoading] = useState(false);
  const [trades, setTrades] = useState<Trade[]>(initialTrades);
  const [cachedModes, setCachedModes] = useState<ModeItem[] | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTradeIndex, setModalTradeIndex] = useState<number | null>(null);
  const [modalSellDate, setModalSellDate] = useState("");
  const [modalSellPrice, setModalSellPrice] = useState<number>(0);
  const [modalSellQuantity, setModalSellQuantity] = useState<number>(0);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [modalWithdrawalAmount, setModalWithdrawalAmount] = useState<number>(0);
  const [latestUpdatedSeedDate, setLatestUpdatedSeedDate] =
    useState<string>("");
  const [manualFixInfo, setManualFixInfo] = useState<{ [key: string]: number }>(
    {}
  );
  const [seedUpdateDates, setSeedUpdateDates] = useState<
    { date: string; value: number }[]
  >([]);
  // 아코디언 상태 추가
  const [isTableCollapsed, setIsTableCollapsed] = useState<boolean>(false);
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const dailyProfitMap: {
    [date: string]: { totalProfit: number; tradeIndex: number };
  } = {};

  async function waitForModes(
    initModes: ModeItem[] | null
  ): Promise<ModeItem[] | null> {
    if (cachedModes && cachedModes.length > 0) return cachedModes;
    setIsModeLoading(true);
    while (!initModes || initModes.length === 0)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsModeLoading(false);
    setCachedModes(initModes);
    return initModes;
  }

  function findModeForDateNoWait(
    targetDateStr: string,
    sortedModes: ModeItem[]
  ): "safe" | "aggressive" {
    let decidedMode: "safe" | "aggressive" = "safe";
    for (let i = 0; i < sortedModes.length; i++) {
      const modeStartTime = new Date(sortedModes[i].date).getTime();
      const modeEffectiveTime = modeStartTime + 24 * 60 * 60 * 1000;
      const targetTime = new Date(targetDateStr).getTime();
      if (modeEffectiveTime <= targetTime) decidedMode = sortedModes[i].mode;
      else break;
    }
    return decidedMode;
  }

  // 새로운 함수: 날짜에 대한 거래가 없는 경우에만 생성
  const createTradeIfNotExists = (
    date: string,
    existingTrades: Trade[],
    closingPrices: PriceEntry[],
    sortedModes: ModeItem[],
    currentSeed: number,
    settings: Settings,
    manualFixInfo: { [key: string]: number },
    tradeIndex: number
  ): Trade | null => {
    console.log(
      `createTradeIfNotExists 호출 - 날짜: ${date}, 현재 시드: ${currentSeed}, tradeIndex: ${tradeIndex}`
    );

    // 이미 해당 날짜에 거래가 있는지 확인
    const existingTradesForDate = existingTrades.filter(
      (trade) => trade.buyDate === date
    );

    if (existingTradesForDate.length > 0) {
      console.log(
        `${date} 날짜에 이미 ${existingTradesForDate.length}개의 거래가 존재합니다. 새 거래를 생성하지 않습니다.`
      );

      // 해당 날짜의 가장 최근 거래 반환
      const latestTrade = existingTradesForDate.reduce((latest, trade) =>
        trade.tradeIndex > latest.tradeIndex ? trade : latest
      );
      console.log(
        `${date} 날짜의 가장 최근 거래 반환 (tradeIndex: ${latestTrade.tradeIndex})`
      );
      return latestTrade;
    }

    // 해당 날짜의 종가 데이터 가져오기
    const priceEntry = closingPrices.find((price) => price.date === date);
    if (!priceEntry) {
      console.log(`${date} 날짜에 대한 종가 데이터가 없습니다.`);
      return null;
    }
    console.log(`${date} 날짜의 종가 데이터: ${priceEntry.price}`);

    // 현재 종가로 이전 트레이드들 중 매도 조건을 충족하는 트레이드들 매도 처리
    const currentPrice = parseFloat(priceEntry.price);
    console.log(`${date} 날짜의 현재 가격: ${currentPrice}`);

    // 이전 트레이드들 중 매도 조건을 충족하는 트레이드들 매도 처리
    const hasSoldTrades = processSellConditionsForExistingTrades(
      existingTrades,
      date,
      currentPrice
    );
    console.log(
      `${date} 날짜에 매도된 트레이드 여부: ${hasSoldTrades ? "있음" : "없음"}`
    );

    // 전날 종가 가져오기
    const priceIndex = closingPrices.findIndex((price) => price.date === date);
    const previousClosePrice =
      priceIndex > 0
        ? parseFloat(closingPrices[priceIndex - 1].price)
        : parseFloat(priceEntry.price);
    console.log(`${date} 날짜의 전날 종가: ${previousClosePrice}`);

    // 모드 결정
    const mode =
      sortedModes.length > 0
        ? findModeForDateNoWait(date, sortedModes)
        : "safe";
    console.log(`${date} 날짜의 모드: ${mode}`);

    // 모드에 따른 설정 가져오기
    const buyPercent =
      mode === "safe" ? settings.safeBuyPercent : settings.aggressiveBuyPercent;
    console.log(`${date} 날짜의 매수 퍼센트: ${buyPercent}%`);

    const sellPercent =
      mode === "safe"
        ? settings.safeSellPercent
        : settings.aggressiveSellPercent;
    console.log(`${date} 날짜의 매도 퍼센트: ${sellPercent}%`);

    const daysUntilSell =
      mode === "safe" ? settings.safeMaxDays : settings.aggressiveMaxDays;
    console.log(`${date} 날짜의 최대 보유일: ${daysUntilSell}일`);

    // 거래 상세 계산
    const targetBuyPrice = previousClosePrice * (1 + buyPercent / 100);
    console.log(`${date} 날짜의 매수 목표가: ${targetBuyPrice}`);

    const actualBuyPrice = currentPrice <= targetBuyPrice ? currentPrice : 0;
    console.log(
      `${date} 날짜의 실제 매수가: ${actualBuyPrice} (${
        currentPrice <= targetBuyPrice ? "매수 조건 충족" : "매수 조건 미충족"
      })`
    );

    // 1회분 매수에 필요한 금액 계산
    const minRequiredFund = targetBuyPrice * 1; // 최소 1주 매수 가능한지 확인
    const isSeedExhausted =
      currentSeed / (settings.seedDivision || 1) < minRequiredFund;

    // 시드가 부족하거나 1주도 살 수 없는 경우 매수 불가
    const quantity =
      actualBuyPrice && !isSeedExhausted
        ? Math.floor(
            currentSeed / (settings.seedDivision || 1) / targetBuyPrice
          )
        : 0;

    if (isSeedExhausted && actualBuyPrice) {
      console.log(
        `${date} 날짜에 시드 부족으로 매수 불가 (필요 금액: ${minRequiredFund}, 가용 시드: ${
          currentSeed / (settings.seedDivision || 1)
        })`
      );
    }

    console.log(
      `${date} 날짜의 매수 수량: ${quantity} (시드: ${currentSeed}, 시드 분할: ${
        settings.seedDivision || 1
      })`
    );

    const targetSellPrice = actualBuyPrice * (1 + sellPercent / 100);
    console.log(`${date} 날짜의 매도 목표가: ${targetSellPrice}`);

    const withdrawalFromManualFix =
      manualFixInfo[date] ?? settings.withdrawalAmount;
    console.log(
      `${date} 날짜의 출금액: ${withdrawalFromManualFix} (수동 설정: ${
        manualFixInfo[date] !== undefined
      }, 기본값: ${settings.withdrawalAmount})`
    );

    // 해당 날짜에 매도된 다른 트레이드들의 수익 합계 계산
    const tradesWithSellDateMatchingBuyDate = existingTrades.filter(
      (trade) => trade.sellDate === date && trade.profit !== undefined
    );

    let dailyProfitFromSells = 0;
    if (tradesWithSellDateMatchingBuyDate.length > 0) {
      dailyProfitFromSells = tradesWithSellDateMatchingBuyDate.reduce(
        (sum, trade) => sum + (trade.profit || 0),
        0
      );
      console.log(
        `${date} 날짜에 매도된 다른 트레이드들의 수익 합계: ${dailyProfitFromSells} (${tradesWithSellDateMatchingBuyDate.length}개 트레이드)`
      );
      console.log(
        `매도된 트레이드 목록:`,
        tradesWithSellDateMatchingBuyDate.map((t) => ({
          tradeIndex: t.tradeIndex,
          buyDate: t.buyDate,
          sellDate: t.sellDate,
          profit: t.profit,
        }))
      );
    }

    // 새 거래 생성
    const newTrade: Trade = {
      tradeIndex,
      buyDate: date,
      mode,
      targetBuyPrice,
      actualBuyPrice,
      quantity,
      targetSellPrice,
      daysUntilSell,
      seedForDay: currentSeed,
      dailyProfit: dailyProfitFromSells, // 해당 날짜에 매도된 다른 트레이드들의 수익 합계로 초기화
      withdrawalAmount: withdrawalFromManualFix,
      actualwithdrawalAmount: withdrawalFromManualFix,
    };

    console.log(`${date} 날짜에 새로운 트레이드 생성:`, newTrade);
    return newTrade;
  };

  // 이전 트레이드들 중 매도 조건을 충족하는 트레이드들 매도 처리 함수
  const processSellConditionsForExistingTrades = (
    trades: Trade[],
    sellDate: string,
    currentPrice: number
  ) => {
    console.log(
      `${sellDate} 날짜의 종가(${currentPrice})로 매도 조건 검사 시작`
    );

    // 매도되지 않은 트레이드들 중 매도 조건을 충족하는 트레이드들 찾기
    const tradesToSell = trades.filter(
      (trade) =>
        // 매도되지 않은 트레이드
        !trade.sellDate &&
        // 수량이 있는 트레이드
        trade.quantity > 0 &&
        // 매수가가 있는 트레이드
        trade.actualBuyPrice > 0 &&
        // 매도 목표가가 있는 트레이드
        trade.targetSellPrice > 0 &&
        // 현재 가격이 매도 목표가 이상인 트레이드
        currentPrice >= trade.targetSellPrice
    );

    if (tradesToSell.length === 0) {
      console.log(
        `${sellDate} 날짜에 매도 조건을 충족하는 트레이드가 없습니다.`
      );
      return false; // 매도된 트레이드가 없음을 반환
    }

    console.log(
      `${sellDate} 날짜에 매도 조건을 충족하는 트레이드 수: ${tradesToSell.length}`
    );

    // 매도된 트레이드들의 총 수익
    let totalProfitFromSells = 0;

    // 매도 조건을 충족하는 트레이드들 매도 처리
    tradesToSell.forEach((trade) => {
      console.log(
        `트레이드 #${trade.tradeIndex} 매도 처리 (매수일: ${trade.buyDate}, 목표 매도가: ${trade.targetSellPrice}, 현재가: ${currentPrice})`
      );

      // 매도 정보 설정
      trade.sellDate = sellDate;
      trade.actualSellPrice = currentPrice;
      trade.sellQuantity = trade.quantity;
      trade.profit = (currentPrice - trade.actualBuyPrice) * trade.quantity;

      // 총 수익에 추가
      totalProfitFromSells += trade.profit || 0;

      console.log(
        `트레이드 #${
          trade.tradeIndex
        } 매도 완료 - 매도가: ${currentPrice}, 수익: ${trade.profit} (${
          trade.profit > 0 ? "이익" : "손실"
        })`
      );
    });

    // 해당 매도일의 일일 수익에 추가 (음수 수익도 반영)
    const dailyTrade = trades.find((t) => t.buyDate === sellDate);
    if (dailyTrade) {
      dailyTrade.dailyProfit =
        (dailyTrade.dailyProfit || 0) + totalProfitFromSells;
      console.log(
        `${sellDate} 날짜의 일일 수익 업데이트: ${
          dailyTrade.dailyProfit
        } (매도 수익 추가: ${totalProfitFromSells}, ${
          totalProfitFromSells > 0 ? "이익" : "손실"
        })`
      );
    } else {
      console.log(
        `${sellDate} 날짜의 트레이드가 아직 없습니다. 이 날짜의 트레이드가 생성될 때 매도 수익(${totalProfitFromSells}, ${
          totalProfitFromSells > 0 ? "이익" : "손실"
        })이 반영될 것입니다.`
      );

      // 이 날짜의 트레이드가 나중에 생성될 때 사용할 수 있도록 dailyProfitMap에 저장
      dailyProfitMap[sellDate] = dailyProfitMap[sellDate] || {
        totalProfit: 0,
        tradeIndex: 0,
      };
      dailyProfitMap[sellDate].totalProfit += totalProfitFromSells;
      console.log(
        `dailyProfitMap에 ${sellDate} 날짜의 매도 수익 ${totalProfitFromSells} (${
          totalProfitFromSells > 0 ? "이익" : "손실"
        }) 저장됨`
      );
    }

    return true; // 매도된 트레이드가 있음을 반환
  };

  // 모든 트레이드를 검사하여 매도일과 일치하는 트레이드의 dailyProfit 업데이트
  const updateDailyProfitsForAllTrades = (trades: Trade[]) => {
    console.log("모든 트레이드의 dailyProfit 업데이트 시작");

    // 매도일별로 수익 합계 계산
    const sellDateProfits: Record<string, number> = {};

    // 매도된 모든 트레이드를 순회하며 매도일별 수익 합계 계산
    trades.forEach((trade) => {
      if (trade.sellDate && trade.profit !== undefined) {
        sellDateProfits[trade.sellDate] =
          (sellDateProfits[trade.sellDate] || 0) + trade.profit;
      }
    });

    console.log("매도일별 수익 합계:", sellDateProfits);

    // 모든 트레이드를 순회하며 매도일과 일치하는 트레이드의 dailyProfit 업데이트
    trades.forEach((trade) => {
      const sellDateProfit = sellDateProfits[trade.buyDate] || 0;
      // 수익이 양수인 경우만 처리하는 조건 제거 (음수 수익도 반영)
      if (sellDateProfit !== 0) {
        // 이미 dailyProfit이 있는 경우 매도 수익이 포함되어 있는지 확인
        const currentDailyProfit = trade.dailyProfit || 0;

        // 매도 수익이 이미 포함되어 있지 않다고 가정하고 업데이트
        trade.dailyProfit = currentDailyProfit + sellDateProfit;
        console.log(
          `트레이드 #${trade.tradeIndex} (${
            trade.buyDate
          }) dailyProfit 업데이트: ${currentDailyProfit} -> ${
            trade.dailyProfit
          } (${sellDateProfit > 0 ? "이익" : "손실"})`
        );

        // 매도일별 수익을 0으로 설정하여 중복 계산 방지
        sellDateProfits[trade.buyDate] = 0;
      }
    });

    console.log("모든 트레이드의 dailyProfit 업데이트 완료");
  };

  // 중복 계산 방지를 위해 dailyProfit을 초기화하고 다시 계산하는 함수
  const recalculateDailyProfits = (trades: Trade[]) => {
    console.log("모든 트레이드의 dailyProfit 초기화 및 재계산 시작");

    // 1. 모든 트레이드의 dailyProfit 초기화
    trades.forEach((trade) => {
      trade.dailyProfit = 0;
    });

    // 2. 매도일별로 수익 합계 계산
    const sellDateProfits: Record<string, number> = {};

    // 매도된 모든 트레이드를 순회하며 매도일별 수익 합계 계산
    trades.forEach((trade) => {
      if (trade.sellDate && trade.profit !== undefined) {
        sellDateProfits[trade.sellDate] =
          (sellDateProfits[trade.sellDate] || 0) + trade.profit;
      }
    });

    console.log("매도일별 수익 합계 (재계산):", sellDateProfits);

    // 3. 모든 트레이드를 순회하며 매도일과 일치하는 트레이드의 dailyProfit 설정
    trades.forEach((trade) => {
      const sellDateProfit = sellDateProfits[trade.buyDate] || 0;
      // 수익이 양수인 경우만 처리하는 조건 제거 (음수 수익도 반영)
      if (sellDateProfit !== 0) {
        trade.dailyProfit = sellDateProfit;
        console.log(
          `트레이드 #${trade.tradeIndex} (${trade.buyDate}) dailyProfit 설정: ${
            trade.dailyProfit
          } (${sellDateProfit > 0 ? "이익" : "손실"})`
        );

        // 매도일별 수익을 0으로 설정하여 중복 계산 방지
        sellDateProfits[trade.buyDate] = 0;
      }
    });

    console.log("모든 트레이드의 dailyProfit 재계산 완료");
    return trades;
  };

  // 정렬 함수 추가 - 재사용을 위한 유틸리티 함수
  const sortTradesByBuyDate = (trades: Trade[]): Trade[] => {
    return [...trades].sort((a, b) => {
      // buyDate 기준으로 정렬 (날짜순)
      return new Date(a.buyDate).getTime() - new Date(b.buyDate).getTime();
    });
  };

  useEffect(() => {
    const fetchTrades = async () => {
      let newTrades: Trade[] = [];
      const finalModes = await waitForModes(modes || null);
      const sortedModes = finalModes
        ? [...finalModes].sort((a, b) => a.date.localeCompare(b.date))
        : [];
      const startDateObj = new Date(settings.startDate);
      let currentSeed = settings.currentInvestment;
      let tradeIndex =
        (initialTrades.length > 0
          ? initialTrades[initialTrades.length - 1]?.tradeIndex || 0
          : 0) + 1;
      let blockCount = 0;

      // 마지막 시드 업데이트 날짜 이후 거래 수 계산
      const fetchSeedUpdateDates = async () => {
        if (!userId) return;
        try {
          const { data, error } = await supabase
            .from("dynamicwave")
            .select("updatedSeed")
            .eq("user_id", userId)
            .maybeSingle();

          if (error) {
            console.error("Error fetching updatedSeed:", error);
            return;
          }

          if (
            data?.updatedSeed &&
            Array.isArray(data.updatedSeed) &&
            data.updatedSeed.length > 0
          ) {
            // 날짜순으로 정렬
            const sorted = data.updatedSeed.sort(
              (
                a: { date: string; value: number },
                b: { date: string; value: number }
              ) => a.date.localeCompare(b.date)
            );

            // 가장 최근 시드 업데이트 날짜
            const latestUpdateDate = sorted[sorted.length - 1].date;
            console.log(`최근 시드 업데이트 날짜: ${latestUpdateDate}`);

            // 마지막 시드 업데이트 이후 거래 수 계산
            if (initialTrades && initialTrades.length > 0) {
              const tradesAfterLastUpdate = initialTrades.filter(
                (trade) => trade.buyDate > latestUpdateDate
              );
              blockCount = tradesAfterLastUpdate.length;
              console.log(
                `마지막 시드 업데이트(${latestUpdateDate}) 이후 거래 수: ${blockCount}, blockCount: ${blockCount}`
              );
            }
          }
        } catch (error) {
          console.error("시드 업데이트 날짜 조회 중 오류:", error);
        }
      };

      // 시드 업데이트 날짜 초기화 확인
      await initializeUpdatedSeedIfNeeded();
      // 마지막 시드 업데이트 이후 거래 수 계산
      await fetchSeedUpdateDates();

      if (initialTrades && initialTrades.length > 0) {
        console.log("DB에 존재하는 Trade 내역을 사용합니다.");

        // 중복 트레이드 제거 로직 추가
        const uniqueTrades: Trade[] = [];
        const tradeDateMap: Record<string, Trade[]> = {};

        // 날짜별로 트레이드 그룹화
        initialTrades.forEach((trade) => {
          if (!tradeDateMap[trade.buyDate]) {
            tradeDateMap[trade.buyDate] = [];
          }
          tradeDateMap[trade.buyDate].push(trade);
        });

        // 각 날짜에 대해 중복 트레이드 처리
        Object.entries(tradeDateMap).forEach(([date, trades]) => {
          if (trades.length > 1) {
            console.log(
              `중복 감지: ${date}에 ${trades.length}개의 트레이드가 있습니다. 중복 제거를 시도합니다.`
            );

            // 유효한 트레이드 선택 (수량이 0이 아닌 트레이드 우선)
            const validTrades = trades.filter((t) => t.quantity > 0);
            if (validTrades.length > 0) {
              // 수량이 있는 트레이드 중 가장 높은 인덱스를 가진 것 선택
              const selectedTrade = validTrades.reduce((prev, current) =>
                prev.tradeIndex > current.tradeIndex ? prev : current
              );
              console.log(
                `${date}에 대해 선택된 트레이드: 인덱스=${selectedTrade.tradeIndex}, 모드=${selectedTrade.mode}, 수량=${selectedTrade.quantity}`
              );
              uniqueTrades.push(selectedTrade);
            } else {
              // 모든 트레이드의 수량이 0인 경우, 가장 높은 인덱스를 가진 것 선택
              const selectedTrade = trades.reduce((prev, current) =>
                prev.tradeIndex > current.tradeIndex ? prev : current
              );
              console.log(
                `${date}에 대해 선택된 트레이드(모두 수량 0): 인덱스=${selectedTrade.tradeIndex}`
              );
              uniqueTrades.push(selectedTrade);
            }
          } else {
            // 중복이 없는 경우 그대로 추가
            uniqueTrades.push(trades[0]);
          }
        });

        // 중복 제거 결과 로깅
        console.log(
          `중복 제거 전 트레이드 수: ${initialTrades.length}, 중복 제거 후: ${uniqueTrades.length}`
        );

        // 중복이 제거된 트레이드로 업데이트
        if (initialTrades.length !== uniqueTrades.length) {
          console.log(
            "중복 트레이드가 감지되어 제거되었습니다. DB를 업데이트합니다."
          );

          // 정렬된 트레이드 배열 생성 - 날짜 기준으로 정렬
          const sortedUniqueTrades = sortTradesByBuyDate(uniqueTrades);

          // 중복 계산 방지를 위해 dailyProfit 재계산
          const recalculatedTrades =
            recalculateDailyProfits(sortedUniqueTrades);

          // DB 업데이트
          try {
            await supabase.from("dynamicwave").upsert({
              user_id: userId,
              settings: { ...settings },
              tradehistory: recalculatedTrades,
              manualFixInfo,
            });
            console.log("중복 제거된 트레이드로 DB 업데이트 완료");

            // 중복 제거된 트레이드 사용
            newTrades = recalculatedTrades;
          } catch (error) {
            console.error("중복 제거 후 DB 업데이트 실패:", error);
            // 실패 시 원래 트레이드를 날짜순으로 정렬하여 사용
            newTrades = [...initialTrades].sort(
              (a, b) =>
                new Date(a.buyDate).getTime() - new Date(b.buyDate).getTime()
            );
            // 중복 계산 방지를 위해 dailyProfit 재계산
            newTrades = recalculateDailyProfits(newTrades);
          }
        } else {
          // 중복이 없더라도 날짜순으로 정렬
          newTrades = sortTradesByBuyDate(initialTrades);
          // 중복 계산 방지를 위해 dailyProfit 재계산
          newTrades = recalculateDailyProfits(newTrades);
        }

        // 남은 날짜가 0이거나 -1인 거래 처리
        const updatedTrades = newTrades.map((trade) => {
          // 이미 매도된 거래는 건너뜀
          if (trade.sellDate || trade.sellQuantity || trade.actualSellPrice) {
            return trade;
          }

          // 남은 날짜가 0인 경우 - 오늘의 매도에 올림
          if (trade.daysUntilSell === 0) {
            console.log(
              `남은 날짜가 0인 거래 발견: ${trade.tradeIndex}, 오늘의 매도에 올립니다.`
            );
            // 여기서는 단순히 로그만 남기고 실제 처리는 onZeroDayTradesUpdate에서 수행
          }

          // 남은 날짜가 -1인 경우 - 종가에 매도된 것으로 처리
          if (trade.daysUntilSell === -1) {
            console.log(
              `남은 날짜가 -1인 거래 발견: ${trade.tradeIndex}, 종가에 매도 처리합니다.`
            );
            // 이전 거래일 계산 (현재 날짜에서 1 거래일 전)
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const yesterdayDate = new Date(today);
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);

            // 주말이나 공휴일인 경우 이전 거래일 찾기
            while (!isTradingDay(yesterdayDate)) {
              yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            }

            const yesterdayStr = formatDateToString(yesterdayDate);

            // 해당 날짜의 종가 찾기
            const closingPrice = closingPrices.find(
              (price) => price.date === yesterdayStr
            );
            if (closingPrice) {
              try {
                const sellPrice = parseFloat(closingPrice.price);
                return {
                  ...trade,
                  sellDate: yesterdayStr,
                  actualSellPrice: sellPrice,
                  sellQuantity: trade.quantity,
                  profit: (sellPrice - trade.actualBuyPrice) * trade.quantity,
                };
              } catch (error) {
                console.error("매도 처리 중 오류 발생:", error);
                return trade;
              }
            }
          }

          return trade;
        });

        // 업데이트된 거래 내역이 있으면 DB에 저장
        const hasUpdates =
          JSON.stringify(updatedTrades) !== JSON.stringify(newTrades);
        if (hasUpdates) {
          newTrades = updatedTrades;

          // 중복 계산 방지를 위해 dailyProfit 재계산
          newTrades = recalculateDailyProfits(newTrades);

          await supabase.from("dynamicwave").upsert({
            user_id: userId,
            settings: { ...settings },
            tradehistory: newTrades,
            manualFixInfo,
          });
          console.log("자동 매도 처리된 거래 내역을 DB에 저장했습니다.");
        }

        // 기존 거래 내역이 있을 때 blockCount 계산
        blockCount = newTrades.length % 10;
        console.log("기존 거래 내역 기준 blockCount:", blockCount);

        // 마지막 시드 업데이트 이후의 거래 내역을 기준으로 blockCount 설정
        if (latestUpdatedSeedDate) {
          // 마지막 시드 업데이트 날짜 이후의 거래 수 계산
          const tradesAfterLastUpdate = newTrades.filter(
            (trade) => trade.buyDate > latestUpdatedSeedDate
          );

          blockCount = tradesAfterLastUpdate.length;
          console.log(
            `마지막 시드 업데이트(${latestUpdatedSeedDate}) 이후 거래 수: ${tradesAfterLastUpdate.length}, blockCount: ${blockCount}`
          );
          console.log(
            "마지막 시드 업데이트 이후 거래 목록:",
            tradesAfterLastUpdate.map((t) => t.buyDate)
          );
        } else {
          console.log(
            `마지막 시드 업데이트 날짜가 없습니다. 전체 거래 수 기준으로 blockCount 계산: ${blockCount}`
          );
        }

        setTrades(initialTrades);

        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().split("T")[0];
        console.log(`어제 날짜: ${yesterdayStr}`);

        // 어제 날짜의 기존 거래 찾기
        const existingYesterdayTrades = newTrades.filter(
          (trade) =>
            new Date(trade.buyDate).toISOString().split("T")[0] === yesterdayStr
        );
        console.log(
          `어제 날짜의 기존 거래 수: ${existingYesterdayTrades.length}`
        );

        if (existingYesterdayTrades.length > 0) {
          // 어제 날짜에 이미 거래가 있으면 가장 최근 것 사용
          const existingYesterdayTrade = existingYesterdayTrades.reduce(
            (latest, trade) =>
              trade.tradeIndex > latest.tradeIndex ? trade : latest,
            existingYesterdayTrades[0]
          );

          console.log("계산된 yesterdaySell:", existingYesterdayTrade);
          onUpdateYesterdaySell?.(existingYesterdayTrade);
        } else if (closingPrices.length > 0) {
          // 어제 날짜에 기존 거래가 없으면 새로 생성
          console.log("어제 날짜에 기존 거래가 없어 새로 생성 시도");
          const yesterdayClosing = closingPrices.find(
            (priceEntry) =>
              new Date(priceEntry.date).toISOString().split("T")[0] ===
              yesterdayStr
          );

          if (yesterdayClosing) {
            console.log(
              `어제 종가 데이터 발견: ${yesterdayClosing.date}, 가격: ${yesterdayClosing.price}`
            );

            // 어제 종가로 이전 트레이드들 중 매도 조건을 충족하는 트레이드들 매도 처리
            const currentPrice = parseFloat(yesterdayClosing.price);
            console.log(`어제 종가: ${currentPrice}`);

            // 매도 처리 직접 수행 (createTradeIfNotExists 호출 전에)
            const hasSoldTrades = processSellConditionsForExistingTrades(
              newTrades,
              yesterdayStr,
              currentPrice
            );

            // 매도 처리 후 DB에 저장 (시드 업데이트 전에 매도 정보가 반영되도록)
            if (hasSoldTrades) {
              console.log(
                "어제 종가로 매도된 트레이드가 있어 DB에 저장합니다."
              );
              try {
                await supabase.from("dynamicwave").upsert({
                  user_id: userId,
                  settings: { ...settings },
                  tradehistory: newTrades,
                  manualFixInfo,
                });
                console.log("매도 처리된 트레이드 정보가 DB에 저장되었습니다.");
              } catch (error) {
                console.error("매도 처리 후 DB 저장 오류:", error);
              }
            }

            // 어제 날짜에 매도된 트레이드들의 수익 계산
            const soldTradesYesterday = newTrades.filter(
              (trade) =>
                trade.sellDate === yesterdayStr && trade.profit !== undefined
            );

            let yesterdayProfitFromSells = 0;
            if (soldTradesYesterday.length > 0) {
              yesterdayProfitFromSells = soldTradesYesterday.reduce(
                (sum, trade) => sum + (trade.profit || 0),
                0
              );
              console.log(
                `어제(${yesterdayStr}) 매도된 트레이드들의 수익 합계: ${yesterdayProfitFromSells} (${soldTradesYesterday.length}개 트레이드)`
              );
              console.log(
                `매도된 트레이드 목록:`,
                soldTradesYesterday.map((t) => ({
                  tradeIndex: t.tradeIndex,
                  buyDate: t.buyDate,
                  sellDate: t.sellDate,
                  profit: t.profit,
                }))
              );

              // 이미 어제 날짜의 트레이드가 있는지 확인하고 dailyProfit 업데이트
              const existingYesterdayTrade = newTrades.find(
                (t) => t.buyDate === yesterdayStr
              );
              if (existingYesterdayTrade) {
                console.log(
                  `기존 어제(${yesterdayStr}) 트레이드 발견, dailyProfit 업데이트: ${
                    existingYesterdayTrade.dailyProfit
                  } -> ${
                    (existingYesterdayTrade.dailyProfit || 0) +
                    yesterdayProfitFromSells
                  } (${yesterdayProfitFromSells > 0 ? "이익" : "손실"})`
                );
                existingYesterdayTrade.dailyProfit =
                  (existingYesterdayTrade.dailyProfit || 0) +
                  yesterdayProfitFromSells;
              }
            }

            // 어제 날짜의 종가 데이터가 있으면 새 거래 생성
            const newYesterdayTrade = createTradeIfNotExists(
              yesterdayStr,
              newTrades,
              closingPrices,
              sortedModes,
              currentSeed,
              settings,
              manualFixInfo,
              tradeIndex
            );

            if (
              newYesterdayTrade &&
              !newTrades.some((t) => t.buyDate === yesterdayStr)
            ) {
              console.log("생성된 어제 트레이드:", newYesterdayTrade);

              // 어제 매도된 트레이드들의 수익을 어제 트레이드의 dailyProfit에 추가
              if (yesterdayProfitFromSells > 0) {
                newYesterdayTrade.dailyProfit =
                  (newYesterdayTrade.dailyProfit || 0) +
                  yesterdayProfitFromSells;
                console.log(
                  `어제 트레이드의 dailyProfit 업데이트: ${newYesterdayTrade.dailyProfit}`
                );
              }

              onUpdateYesterdaySell?.(newYesterdayTrade);
              newTrades.push(newYesterdayTrade);

              // 날짜순으로 다시 정렬
              newTrades = sortTradesByBuyDate(newTrades);

              setTrades(newTrades);
              onTradesUpdate?.(newTrades);

              // 블록 카운트가 10이 되면 시드 업데이트
              blockCount++;
              console.log(`어제 거래 추가 후 blockCount: ${blockCount}`);

              if (blockCount === 10) {
                console.log(
                  "어제 거래 추가 후 blockCount가 10이 되어 시드 업데이트 실행"
                );
                try {
                  // 먼저 모든 트레이드의 dailyProfit 업데이트
                  console.log(
                    "시드 업데이트 전 모든 트레이드의 dailyProfit 업데이트"
                  );
                  updateDailyProfitsForAllTrades(newTrades);

                  // 시드 업데이트 실행
                  console.log(`시드 업데이트 전 현재 시드: ${currentSeed}`);
                  console.log(
                    `시드 업데이트에 사용될 거래 수: ${newTrades.length}`
                  );
                  console.log(
                    `시드 업데이트 날짜: ${newYesterdayTrade.buyDate}`
                  );

                  currentSeed = await updateSeedForTrades(
                    newTrades,
                    currentSeed,
                    newYesterdayTrade.buyDate
                  );
                  blockCount = 0;
                  console.log(
                    `시드 업데이트 후 blockCount 초기화: ${blockCount}`
                  );

                  // 시드 업데이트 후 DB에 저장
                  console.log(
                    `시드 업데이트 후 DB 저장 시작 (새 시드: ${currentSeed})`
                  );
                  await supabase.from("dynamicwave").upsert({
                    user_id: userId,
                    settings: { ...settings, currentInvestment: currentSeed },
                    tradehistory: newTrades,
                    manualFixInfo,
                  });
                  console.log(
                    `어제 날짜(${yesterdayStr}) 시드 업데이트 완료: ${currentSeed}`
                  );
                } catch (error) {
                  console.error(`어제 날짜 시드 업데이트 오류:`, error);
                }
              } else {
                // 시드 업데이트가 필요하지 않은 경우에도 DB에 저장
                console.log(
                  `blockCount가 10이 아니므로 시드 업데이트 없이 DB 저장 (blockCount: ${blockCount})`
                );
                await supabase.from("dynamicwave").upsert({
                  user_id: userId,
                  settings: { ...settings },
                  tradehistory: newTrades,
                  manualFixInfo,
                });
              }
            } else if (newYesterdayTrade) {
              // 이미 어제 날짜의 거래가 있으면 업데이트만 수행
              console.log("기존 어제 트레이드 사용:", newYesterdayTrade);
              onUpdateYesterdaySell?.(newYesterdayTrade);
            } else {
              console.log("어제 트레이드 생성 실패 또는 이미 존재함");
            }
          } else {
            console.warn("어제 종가가 존재하지 않습니다.");
          }
        }
      }

      // 오늘 날짜에 대한 거래 생성
      const currentDateStr = new Date().toISOString().split("T")[0];
      console.log(`오늘 날짜: ${currentDateStr}`);

      // 오늘 날짜에 이미 거래가 있는지 확인
      const existingCurrentDateTrades = newTrades.filter(
        (trade) => trade.buyDate === currentDateStr
      );

      // 오늘 날짜의 종가 데이터가 있는지 확인
      const currentDatePriceEntry = closingPrices.find(
        (price) => price.date === currentDateStr
      );

      if (
        currentDatePriceEntry &&
        existingCurrentDateTrades.length === 0 &&
        sortedModes.length > 0
      ) {
        console.log("오늘 날짜에 새 거래 생성 시도");

        // 오늘 날짜에 대한 모드 찾기
        const todayMode = findModeForDateNoWait(currentDateStr, sortedModes);
        console.log(`오늘의 모드: ${todayMode}`);

        // 오늘 날짜에 대한 거래 생성
        const todayTrade = createTradeIfNotExists(
          currentDateStr,
          newTrades,
          closingPrices,
          sortedModes,
          currentSeed,
          settings,
          manualFixInfo,
          tradeIndex
        );

        if (todayTrade) {
          console.log("새 오늘 트레이드 생성:", todayTrade);

          // 오늘 매도된 트레이드들의 수익 계산
          const soldTradesToday = newTrades.filter(
            (trade) =>
              trade.sellDate === currentDateStr && trade.profit !== undefined
          );

          let todayProfitFromSells = 0;
          if (soldTradesToday.length > 0) {
            todayProfitFromSells = soldTradesToday.reduce(
              (sum, trade) => sum + (trade.profit || 0),
              0
            );
            console.log(
              `오늘(${currentDateStr}) 매도된 트레이드들의 수익 합계: ${todayProfitFromSells} (${soldTradesToday.length}개 트레이드)`
            );

            // 이미 오늘 날짜의 트레이드가 있는지 확인하고 dailyProfit 업데이트
            const existingTodayTrade = newTrades.find(
              (t) => t.buyDate === currentDateStr
            );
            if (existingTodayTrade) {
              console.log(
                `기존 오늘(${currentDateStr}) 트레이드 발견, dailyProfit 업데이트: ${
                  existingTodayTrade.dailyProfit
                } -> ${
                  (existingTodayTrade.dailyProfit || 0) + todayProfitFromSells
                }`
              );
              existingTodayTrade.dailyProfit =
                (existingTodayTrade.dailyProfit || 0) + todayProfitFromSells;
            }
          }

          // 오늘 매도된 트레이드들의 수익을 오늘 트레이드의 dailyProfit에 추가
          if (todayProfitFromSells !== 0) {
            todayTrade.dailyProfit =
              (todayTrade.dailyProfit || 0) + todayProfitFromSells;
            console.log(
              `오늘 트레이드의 dailyProfit 업데이트: ${
                todayTrade.dailyProfit
              } (${todayProfitFromSells > 0 ? "이익" : "손실"})`
            );
          }

          newTrades.push(todayTrade);
          tradeIndex++;
          blockCount++;
          console.log(`오늘 거래 추가 후 blockCount: ${blockCount}`);

          // 10거래일마다 시드 업데이트
          if (blockCount === 10) {
            console.log(`10거래일 완료, 시드 업데이트 실행: ${currentDateStr}`);
            try {
              // 먼저 모든 트레이드의 dailyProfit 업데이트
              console.log(
                "시드 업데이트 전 모든 트레이드의 dailyProfit 업데이트"
              );
              updateDailyProfitsForAllTrades(newTrades);

              console.log(`시드 업데이트 전 현재 시드: ${currentSeed}`);
              console.log(
                `시드 업데이트에 사용될 거래 수: ${newTrades.length}`
              );
              console.log(`시드 업데이트 날짜: ${currentDateStr}`);

              currentSeed = await updateSeedForTrades(
                newTrades,
                currentSeed,
                currentDateStr
              );
              blockCount = 0; // 시드 업데이트 후 blockCount 초기화
              console.log(`시드 업데이트 후 blockCount 초기화: ${blockCount}`);

              // 시드 업데이트 후 DB에 저장
              console.log(
                `시드 업데이트 후 DB 저장 시작 (새 시드: ${currentSeed})`
              );
              await supabase.from("dynamicwave").upsert({
                user_id: userId,
                settings: { ...settings, currentInvestment: currentSeed },
                tradehistory: newTrades,
                manualFixInfo,
              });
              console.log(
                `오늘 날짜(${currentDateStr}) 시드 업데이트 완료: ${currentSeed}`
              );
            } catch (error) {
              console.error(`오늘 날짜 시드 업데이트 오류:`, error);
            }
          } else {
            // 시드 업데이트가 필요하지 않은 경우에도 DB에 저장
            console.log(
              `blockCount가 10이 아니므로 시드 업데이트 없이 DB 저장 (blockCount: ${blockCount})`
            );
            await supabase.from("dynamicwave").upsert({
              user_id: userId,
              settings: { ...settings },
              tradehistory: newTrades,
              manualFixInfo,
            });
          }
        } else {
          console.log("오늘 트레이드 생성 실패");
        }
      } else if (existingCurrentDateTrades.length > 0) {
        console.log(
          `오늘(${currentDateStr}) 날짜에 이미 ${existingCurrentDateTrades.length}개의 거래가 존재합니다. 새 거래를 생성하지 않습니다.`
        );
      } else {
        console.log(
          `오늘 날짜(${currentDateStr})의 종가 데이터가 없어 트레이드를 생성할 수 없습니다.`
        );
      }

      // 과거 날짜에 대한 거래 생성
      for (let index = 0; index < closingPrices.length; index++) {
        const priceEntryForDate = closingPrices[index];
        const rawBuyDateObj = new Date(priceEntryForDate.date);
        if (rawBuyDateObj < startDateObj) continue;

        const buyDateStr = rawBuyDateObj.toISOString().split("T")[0];
        console.log(`과거 날짜 처리 중: ${buyDateStr}`);

        // 해당 날짜에 이미 거래가 있는지 확인
        const existingTradeForDate = newTrades.find(
          (trade) => trade.buyDate === buyDateStr
        );

        if (existingTradeForDate) {
          // 요일 확인
          const dayOfWeek = rawBuyDateObj.getDay();
          const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
          const dayName = dayNames[dayOfWeek];

          console.log(
            `${buyDateStr}(${dayName})에 이미 거래가 존재합니다. 스킵합니다.`
          );
          continue;
        }

        // 해당 날짜에 거래가 없으면 새로 생성
        console.log(`${buyDateStr}에 거래가 없어 새로 생성 시도`);

        // 해당 날짜의 종가로 이전 트레이드들 중 매도 조건을 충족하는 트레이드들 매도 처리
        const priceEntryForSell = closingPrices.find(
          (price) => price.date === buyDateStr
        );
        if (priceEntryForSell) {
          const currentPrice = parseFloat(priceEntryForSell.price);
          console.log(`${buyDateStr} 종가: ${currentPrice}`);

          // 매도 처리 직접 수행 (createTradeIfNotExists 호출 전에)
          const hasSoldTrades = processSellConditionsForExistingTrades(
            newTrades,
            buyDateStr,
            currentPrice
          );

          // 매도 처리 후 DB에 저장 (시드 업데이트 전에 매도 정보가 반영되도록)
          if (hasSoldTrades) {
            console.log(
              `${buyDateStr} 종가로 매도된 트레이드가 있어 DB에 저장합니다.`
            );
            try {
              await supabase.from("dynamicwave").upsert({
                user_id: userId,
                settings: { ...settings },
                tradehistory: newTrades,
                manualFixInfo,
              });
              console.log("매도 처리된 트레이드 정보가 DB에 저장되었습니다.");
            } catch (error) {
              console.error("매도 처리 후 DB 저장 오류:", error);
            }
          }
        }

        const historicalTrade = createTradeIfNotExists(
          buyDateStr,
          newTrades,
          closingPrices,
          sortedModes,
          currentSeed,
          settings,
          manualFixInfo,
          tradeIndex
        );

        if (historicalTrade) {
          console.log(
            `${buyDateStr} 날짜에 새 거래 생성 성공:`,
            historicalTrade
          );
          // 매도 정보 처리
          for (let i = index + 1; i < closingPrices.length; i++) {
            const futurePrice = parseFloat(closingPrices[i].price);
            if (
              futurePrice >= historicalTrade.targetSellPrice &&
              historicalTrade.quantity > 0
            ) {
              historicalTrade.sellDate = closingPrices[i].date;
              historicalTrade.actualSellPrice = futurePrice;
              historicalTrade.sellQuantity = historicalTrade.quantity;
              historicalTrade.profit =
                (futurePrice - historicalTrade.actualBuyPrice) *
                historicalTrade.quantity;
              historicalTrade.sellDate = adjustSellDate(
                historicalTrade.sellDate!
              );
              dailyProfitMap[historicalTrade.sellDate] = dailyProfitMap[
                historicalTrade.sellDate
              ] || {
                totalProfit: 0,
                tradeIndex: 0,
              };
              dailyProfitMap[historicalTrade.sellDate].totalProfit +=
                historicalTrade.profit || 0;
              dailyProfitMap[historicalTrade.sellDate].tradeIndex =
                historicalTrade.tradeIndex;
              console.log(
                `${buyDateStr} 거래의 매도 정보 설정: 매도일=${historicalTrade.sellDate}, 매도가=${historicalTrade.actualSellPrice}, 수익=${historicalTrade.profit}`
              );
              break;
            }
          }

          // dailyProfit은 이미 createTradeIfNotExists에서 설정되었으므로 여기서는 덮어쓰지 않음
          // 단, dailyProfitMap에 값이 있고 아직 dailyProfit이 설정되지 않은 경우에만 설정
          if (
            dailyProfitMap[historicalTrade.buyDate]?.totalProfit &&
            !historicalTrade.dailyProfit
          ) {
            historicalTrade.dailyProfit =
              dailyProfitMap[historicalTrade.buyDate]?.totalProfit || 0;
            console.log(
              `${buyDateStr} 거래의 일일 수익 설정: ${historicalTrade.dailyProfit}`
            );
          }

          // 해당 날짜에 매도된 다른 트레이드들의 수익 합계 계산은 이미 createTradeIfNotExists에서 수행됨
          // 중복 계산 방지를 위해 여기서는 추가 계산하지 않음

          // 기존 거래들의 남은 날짜 업데이트
          for (let i = 0; i < newTrades.length; i++) {
            if (!newTrades[i].sellDate) {
              const diffDays = Math.floor(
                (new Date(buyDateStr).getTime() -
                  new Date(newTrades[i].buyDate).getTime()) /
                  (1000 * 60 * 60 * 24)
              );
              const maxDays =
                newTrades[i].mode === "safe"
                  ? settings.safeMaxDays
                  : settings.aggressiveMaxDays;
              newTrades[i].daysUntilSell = maxDays - diffDays;
              if (newTrades[i].daysUntilSell < 0) {
                newTrades[i].daysUntilSell = -1;
                const buyIndex = closingPrices.findIndex(
                  (p) => p.date === newTrades[i].buyDate
                );
                const expirationIndex = buyIndex + maxDays;
                if (expirationIndex < closingPrices.length) {
                  const autoSellPrice = parseFloat(
                    closingPrices[expirationIndex].price
                  );
                  newTrades[i].sellDate = closingPrices[expirationIndex].date;
                  newTrades[i].actualSellPrice = autoSellPrice;
                  newTrades[i].sellQuantity = newTrades[i].quantity;
                  newTrades[i].profit =
                    (autoSellPrice - newTrades[i].actualBuyPrice) *
                    newTrades[i].quantity;
                  dailyProfitMap[newTrades[i].sellDate!] = dailyProfitMap[
                    newTrades[i].sellDate!
                  ] || { totalProfit: 0, tradeIndex: 0 };
                  dailyProfitMap[newTrades[i].sellDate!].totalProfit +=
                    newTrades[i].profit || 0;
                  console.log(
                    `거래 #${newTrades[i].tradeIndex}의 자동 매도 처리: 매도일=${newTrades[i].sellDate}, 매도가=${newTrades[i].actualSellPrice}, 수익=${newTrades[i].profit}`
                  );
                }
              }
            }
          }

          newTrades.push(historicalTrade);

          // 날짜순으로 다시 정렬
          newTrades = sortTradesByBuyDate(newTrades);

          tradeIndex++;
          blockCount++;

          console.log(
            `거래 추가 후 blockCount: ${blockCount}, 날짜: ${buyDateStr}, tradeIndex: ${tradeIndex}`
          );
          if (blockCount === 10) {
            console.log(`10거래일 완료, 시드 업데이트 실행: ${buyDateStr}`);
            // 과거 날짜 트레이드 생성 시 시드 업데이트는 수행하되, 출금액 수정 모달은 표시하지 않음
            try {
              // 먼저 모든 트레이드의 dailyProfit 업데이트
              console.log(
                "시드 업데이트 전 모든 트레이드의 dailyProfit 업데이트"
              );
              updateDailyProfitsForAllTrades(newTrades);

              console.log(`시드 업데이트 전 현재 시드: ${currentSeed}`);
              console.log(
                `시드 업데이트에 사용될 거래 수: ${newTrades.length}`
              );
              console.log(`시드 업데이트 날짜: ${historicalTrade.buyDate}`);

              currentSeed = await updateSeedForTrades(
                newTrades,
                currentSeed,
                historicalTrade.buyDate
              );
              blockCount = 0; // 시드 업데이트 후 blockCount 초기화
              console.log(`시드 업데이트 후 blockCount 초기화: ${blockCount}`);

              // 시드 업데이트 후 DB에 저장
              console.log(
                `시드 업데이트 후 DB 저장 시작 (새 시드: ${currentSeed})`
              );
              await supabase.from("dynamicwave").upsert({
                user_id: userId,
                settings: { ...settings, currentInvestment: currentSeed },
                tradehistory: newTrades,
                manualFixInfo,
              });
              console.log(
                `과거 날짜(${buyDateStr}) 시드 업데이트 완료: ${currentSeed}`
              );
            } catch (error) {
              console.error(`과거 날짜 시드 업데이트 오류:`, error);
            }
          } else {
            // 시드 업데이트가 필요하지 않은 경우에도 DB에 저장
            try {
              console.log(
                `blockCount가 10이 아니므로 시드 업데이트 없이 DB 저장 (blockCount: ${blockCount})`
              );
              await supabase.from("dynamicwave").upsert({
                user_id: userId,
                settings: { ...settings },
                tradehistory: newTrades,
                manualFixInfo,
              });
            } catch (error) {
              console.error(`과거 날짜 트레이드 저장 오류:`, error);
            }
          }
        } else {
          console.log(`${buyDateStr} 날짜에 새 거래 생성 실패`);
        }
      }

      if (JSON.stringify(newTrades) !== JSON.stringify(trades)) {
        // 최종적으로 날짜순으로 정렬하여 상태 업데이트
        const sortedTrades = sortTradesByBuyDate(newTrades);

        // 중복 계산 방지를 위해 dailyProfit 재계산
        const finalTrades = recalculateDailyProfits(sortedTrades);

        setTrades(finalTrades);
        onTradesUpdate?.(finalTrades);
      }
      const todayStr = new Date().toISOString().split("T")[0];
      const lastTradeSale =
        newTrades
          .filter((t) => t.buyDate === todayStr && t.targetSellPrice > 0)
          .pop() || newTrades[newTrades.length - 1];
      if (lastTradeSale) onUpdateYesterdaySell(lastTradeSale);

      const newZeroDayTrades = newTrades.filter(
        (trade) =>
          trade.daysUntilSell === 0 &&
          trade.quantity - (trade.sellQuantity || 0) !== 0
      );
      onZeroDayTradesUpdate?.(newZeroDayTrades);

      // 새로운 트레이드가 생성되면 기존 트레이드의 남은 날짜 업데이트
      const processExistingTrades = () => {
        console.log("기존 트레이드 처리 중...");
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 기존 트레이드 순회하며 남은 날짜 업데이트
        for (let i = 0; i < newTrades.length; i++) {
          // 이미 매도된 트레이드는 건너뜀
          if (
            newTrades[i].sellDate ||
            newTrades[i].sellQuantity ||
            newTrades[i].actualSellPrice
          ) {
            continue;
          }

          // 매수일로부터 오늘까지의 거래일 수 계산 (주말과 공휴일 제외)
          const buyDate = new Date(newTrades[i].buyDate);
          buyDate.setHours(0, 0, 0, 0);

          // 모드에 따른 최대 보유일
          const maxDays =
            newTrades[i].mode === "safe"
              ? settings.safeMaxDays
              : settings.aggressiveMaxDays;

          // 매수일로부터 현재까지의 거래일 수 계산
          const tradingDaysElapsed = getTradingDaysBetween(buyDate, today);

          // 남은 거래일 수 계산
          newTrades[i].daysUntilSell = maxDays - tradingDaysElapsed;

          console.log(
            `트레이드 #${newTrades[i].tradeIndex} - 매수일: ${newTrades[i].buyDate}, 최대 보유일: ${maxDays}, 경과 거래일: ${tradingDaysElapsed}, 남은 날짜: ${newTrades[i].daysUntilSell}`
          );

          // 남은 날짜가 -1 이하인 경우 (보유 기간 초과)
          if (newTrades[i].daysUntilSell < 0) {
            // 매도일 계산 (매수일 + 최대 거래일)
            const sellDate = addTradingDays(buyDate, maxDays);
            const sellDateStr = formatDateToString(sellDate);

            // 해당 날짜의 종가 찾기
            const closingPrice = closingPrices.find(
              (price) => price.date === sellDateStr
            );
            if (closingPrice && closingPrice.price) {
              try {
                // 종가에 매도 처리
                const sellPrice = parseFloat(closingPrice.price);
                if (!isNaN(sellPrice)) {
                  newTrades[i].sellDate = sellDateStr;
                  newTrades[i].actualSellPrice = sellPrice;
                  newTrades[i].sellQuantity = newTrades[i].quantity;
                  newTrades[i].profit =
                    (sellPrice - newTrades[i].actualBuyPrice) *
                    newTrades[i].quantity;
                  console.log(
                    `트레이드 #${newTrades[i].tradeIndex}를 ${sellDateStr}에 종가(${sellPrice})로 자동 매도 처리했습니다.`
                  );
                } else {
                  console.warn(`유효하지 않은 종가: ${closingPrice.price}`);
                  newTrades[i].daysUntilSell = -1;
                }
              } catch (error) {
                console.error(`종가 처리 중 오류 발생: ${error}`);
                newTrades[i].daysUntilSell = -1;
              }
            } else {
              // 종가를 찾을 수 없는 경우 남은 날짜를 -1로 설정
              newTrades[i].daysUntilSell = -1;
            }
          }
        }
      };

      // 기존 트레이드 처리
      processExistingTrades();
    };

    fetchTrades();
    // eslint-disable-next-line
  }, [closingPrices]);

  const computeUpdatedSeed = (
    trades: Trade[],
    previousSeed: number
  ): number => {
    console.log("========== computeUpdatedSeed 시작 ==========");
    console.log(`이전 시드: ${previousSeed}`);

    // 최근 10거래일만 계산에 포함 (이전 거래일의 출금액은 계산에 포함하지 않음)
    const blockTrades = trades.slice(-10);
    console.log(`계산에 포함된 거래일 수: ${blockTrades.length}`);
    console.log(
      "계산에 포함된 거래일:",
      blockTrades.map((t) => ({
        날짜: t.buyDate,
        일일수익: t.dailyProfit || 0,
        출금액: t.actualwithdrawalAmount || 0,
      }))
    );

    // 최근 10거래일의 일일 수익 합계
    const totalDailyProfit = blockTrades.reduce(
      (sum, trade) => sum + (trade.dailyProfit || 0),
      0
    );
    console.log(`최근 10거래일 일일 수익 합계: ${totalDailyProfit}`);

    // 최근 10거래일의 출금액 합계
    const withdrawal = blockTrades.reduce(
      (sum, trade) => sum + (trade.actualwithdrawalAmount || 0),
      0
    );
    console.log(`최근 10거래일 출금액 합계: ${withdrawal}`);

    // 수익/손실에 따른 복리 계산
    const profitCompoundingRate = settings.profitCompounding / 100;
    const lossCompoundingRate = settings.lossCompounding / 100;
    console.log(
      `수익 복리율: ${profitCompoundingRate}, 손실 복리율: ${lossCompoundingRate}`
    );

    const compoundedProfit =
      totalDailyProfit >= 0
        ? totalDailyProfit * profitCompoundingRate
        : totalDailyProfit * lossCompoundingRate;
    console.log(`복리 적용 수익: ${compoundedProfit}`);

    // 새로운 시드 = 이전 시드 + 복리 수익 - 출금액
    const newSeed = previousSeed + compoundedProfit - withdrawal;
    console.log(
      `새로운 시드 계산: ${previousSeed} + ${compoundedProfit} - ${withdrawal} = ${newSeed}`
    );
    console.log("========== computeUpdatedSeed 종료 ==========");

    return newSeed;
  };

  const checkAndUpdateSeed = async (
    calculatedSeed: number,
    tradesToUpdate: Trade[],
    tradeDate: string
  ) => {
    const recordDate = tradeDate;
    console.log("========== checkAndUpdateSeed 시작 ==========");
    console.log(
      `시드 업데이트 시작 - 날짜: ${recordDate}, 계산된 시드: ${calculatedSeed}`
    );

    try {
      console.log(`DB에서 기존 시드 정보 조회 중... (userId: ${userId})`);
      const { data: dbData, error } = await supabase
        .from("dynamicwave")
        .select("updatedSeed")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("기존 시드 정보 조회 오류:", error);
        return calculatedSeed;
      }

      let updatedSeedArray: { date: string; value: number }[] = [];

      if (dbData?.updatedSeed && Array.isArray(dbData.updatedSeed)) {
        updatedSeedArray = [...dbData.updatedSeed];
        console.log("기존 updatedSeed 배열:", updatedSeedArray);
      } else {
        console.log(
          "기존 updatedSeed 배열이 없거나 유효하지 않음. 새로 생성합니다."
        );
      }

      // 이미 해당 날짜의 시드 업데이트가 있는지 확인
      const existingIndex = updatedSeedArray.findIndex(
        (item) => item.date === recordDate
      );

      if (existingIndex !== -1) {
        // 이미 해당 날짜의 시드 업데이트가 있으면 업데이트
        console.log(
          `${recordDate} 날짜의 기존 시드 업데이트 발견: ${updatedSeedArray[existingIndex].value} -> ${calculatedSeed}`
        );
        updatedSeedArray[existingIndex].value = calculatedSeed;
      } else {
        // 해당 날짜의 시드 업데이트가 없으면 추가
        console.log(
          `${recordDate} 날짜의 시드 업데이트 추가: ${calculatedSeed}`
        );
        updatedSeedArray.push({
          date: recordDate,
          value: calculatedSeed,
        });
      }

      // 날짜순으로 정렬
      updatedSeedArray.sort((a, b) => a.date.localeCompare(b.date));

      // 업데이트된 시드 배열을 DB에 저장
      const { error: updateError } = await supabase
        .from("dynamicwave")
        .update({
          updatedSeed: updatedSeedArray,
          tradehistory: tradesToUpdate,
        })
        .eq("user_id", userId);

      if (updateError) {
        console.error("시드 업데이트 저장 오류:", updateError);
        return calculatedSeed;
      }

      console.log("시드 업데이트 저장 성공:", updatedSeedArray);
      setSeedUpdateDates(updatedSeedArray);

      // onSeedUpdate 콜백이 있으면 호출
      if (onSeedUpdate) {
        console.log(`onSeedUpdate 콜백 호출: ${calculatedSeed}`);
        onSeedUpdate(calculatedSeed);
      }

      return calculatedSeed;
    } catch (error) {
      console.error("시드 업데이트 중 예외 발생:", error);
      return calculatedSeed;
    }
  };

  const updateSeedForTrades = async (
    trades: Trade[],
    currentSeed: number,
    tradeDate: string
  ): Promise<number> => {
    console.log("========== updateSeedForTrades 시작 ==========");
    console.log(
      `updateSeedForTrades 호출 - 날짜: ${tradeDate}, 현재 시드: ${currentSeed}, 거래 수: ${trades.length}`
    );

    // 중복 계산 방지를 위해 dailyProfit 재계산
    const recalculatedTrades = recalculateDailyProfits(trades);

    // 현재 날짜와 트레이드 날짜 비교
    const today = new Date();
    const tradeDateObj = new Date(tradeDate);
    const diffDays = Math.floor(
      (today.getTime() - tradeDateObj.getTime()) / (1000 * 60 * 60 * 24)
    );
    console.log(`현재 날짜와의 차이: ${diffDays}일`);

    // 과거 날짜(7일 이상 지난 날짜)의 트레이드인 경우 로그 출력
    if (diffDays > 7) {
      console.log(
        `${tradeDate}는 7일 이상 지난 과거 날짜입니다. 시드 업데이트만 수행하고 출금액 수정 모달은 표시하지 않습니다.`
      );
    }

    // 데이터베이스에서 가장 최근 updatedSeed 값 가져오기
    try {
      const { data, error } = await supabase
        .from("dynamicwave")
        .select("updatedSeed")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("updatedSeed 조회 오류:", error);
        console.log("기존 currentSeed 값을 사용합니다:", currentSeed);
      } else if (
        data?.updatedSeed &&
        Array.isArray(data.updatedSeed) &&
        data.updatedSeed.length > 0
      ) {
        // 날짜순으로 정렬
        const sortedUpdatedSeed = [...data.updatedSeed].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // 가장 최근 updatedSeed 값 가져오기
        const latestSeedRecord =
          sortedUpdatedSeed[sortedUpdatedSeed.length - 1];

        // 가장 최근 updatedSeed 값이 현재 계산하려는 날짜보다 이전인 경우에만 사용
        if (new Date(latestSeedRecord.date) < tradeDateObj) {
          console.log(
            `데이터베이스의 가장 최근 updatedSeed 값을 사용합니다: ${latestSeedRecord.date}, 값: ${latestSeedRecord.value}`
          );
          currentSeed = latestSeedRecord.value;
        } else {
          console.log(
            `현재 계산하려는 날짜(${tradeDate})가 가장 최근 updatedSeed 날짜(${latestSeedRecord.date})보다 이전이므로 기존 currentSeed 값을 사용합니다: ${currentSeed}`
          );
        }
      } else {
        console.log(
          "데이터베이스에 updatedSeed 값이 없습니다. 기존 currentSeed 값을 사용합니다:",
          currentSeed
        );
      }
    } catch (error) {
      console.error("updatedSeed 조회 중 예외 발생:", error);
      console.log("기존 currentSeed 값을 사용합니다:", currentSeed);
    }

    console.log("computeUpdatedSeed 함수 호출...");
    const newSeed = computeUpdatedSeed(recalculatedTrades, currentSeed);
    console.log(`계산된 새 시드: ${newSeed}`);

    console.log("checkAndUpdateSeed 함수 호출...");
    const updatedSeed = await checkAndUpdateSeed(
      newSeed,
      recalculatedTrades,
      tradeDate
    );
    console.log(`최종 업데이트된 시드: ${updatedSeed}`);

    // 시드 업데이트 후 latestUpdatedSeedDate 상태 업데이트
    console.log(`latestUpdatedSeedDate 상태 업데이트: ${tradeDate}`);
    setLatestUpdatedSeedDate(tradeDate);

    console.log("========== updateSeedForTrades 종료 ==========");
    return updatedSeed;
  };

  // 데이터베이스에 updatedSeed 필드가 없는 경우 초기화하는 함수
  const initializeUpdatedSeedIfNeeded = async () => {
    if (!userId) return;

    try {
      // 현재 데이터 조회
      const { data, error } = await supabase
        .from("dynamicwave")
        .select("updatedSeed, settings, tradehistory")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("데이터 조회 오류:", error);
        return;
      }

      // updatedSeed가 null이면 빈 배열로 초기화
      if (!data?.updatedSeed) {
        console.log("updatedSeed 필드가 null입니다. 빈 배열로 초기화합니다.");

        const { error: updateError } = await supabase
          .from("dynamicwave")
          .update({
            updatedSeed: [],
          })
          .eq("user_id", userId);

        if (updateError) {
          console.error("updatedSeed 초기화 오류:", updateError);
        } else {
          console.log("updatedSeed 필드가 빈 배열로 초기화되었습니다.");
          setSeedUpdateDates([]);
        }
      }
    } catch (error) {
      console.error("updatedSeed 초기화 중 예외 발생:", error);
    }
  };
  useEffect(() => {
    // 컴포넌트 마운트 시 updatedSeed 필드 초기화 확인
    initializeUpdatedSeedIfNeeded();
    // eslint-disable-next-line
  }, [userId]);

  const adjustSellDate = (sellDateStr: string): string => {
    const date = new Date(sellDateStr);
    const day = date.getDay();
    if (day === 6) date.setDate(date.getDate() - 1);
    else if (day === 0) date.setDate(date.getDate() - 2);
    return date.toISOString().split("T")[0];
  };

  const openSellModal = (index: number) => {
    const trade = trades[index];
    setModalTradeIndex(index);
    setModalSellDate(trade.sellDate || "");
    setModalSellPrice(trade.actualSellPrice || 0);
    setModalSellQuantity(trade.sellQuantity || 0);
    setIsModalOpen(true);
  };

  const handleModalConfirm = async () => {
    if (modalTradeIndex === null) return;
    const index = modalTradeIndex;
    const updatedTrade = {
      ...trades[index],
      sellDate: modalSellDate,
      actualSellPrice: modalSellPrice,
      sellQuantity: modalSellQuantity,
    };
    const newTrades = [...trades];
    newTrades[index] = updatedTrade;

    // 수익 계산
    if (updatedTrade.actualSellPrice && updatedTrade.sellQuantity) {
      updatedTrade.profit =
        (updatedTrade.actualSellPrice - updatedTrade.actualBuyPrice) *
        updatedTrade.sellQuantity;
    }

    // 최종적으로 날짜순으로 정렬
    const sortedTrades = sortTradesByBuyDate(newTrades);
    setTrades(sortedTrades);
    onTradesUpdate?.(sortedTrades);

    // DB 업데이트
    try {
      setIsLoading(true);
      await onSellInfoUpdate(index, {
        sellDate: modalSellDate,
        sellPrice: modalSellPrice,
        sellQuantity: modalSellQuantity,
      });
      setIsLoading(false);
    } catch (error) {
      console.error("매도 정보 업데이트 실패:", error);
      setIsLoading(false);
    }

    setIsModalOpen(false);
  };

  useEffect(() => {
    async function fetchSeedUpdateDates() {
      if (!userId) return;

      try {
        const { data, error } = await supabase
          .from("dynamicwave")
          .select("updatedSeed")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) {
          console.error("Error fetching updatedSeed:", error);
          return;
        }

        // updatedSeed가 null인 경우 초기화
        if (!data?.updatedSeed) {
          console.log("updatedSeed가 null입니다. 초기화를 시도합니다.");
          await initializeUpdatedSeedIfNeeded();
          setSeedUpdateDates([]);
          setLatestUpdatedSeedDate("");
          return;
        }

        // updatedSeed가 존재하는 경우 처리
        if (Array.isArray(data.updatedSeed) && data.updatedSeed.length > 0) {
          // 날짜순으로 정렬
          const sorted = data.updatedSeed.sort(
            (
              a: { date: string; value: number },
              b: { date: string; value: number }
            ) => a.date.localeCompare(b.date)
          );

          // 모든 시드 업데이트 정보를 상태로 저장
          setSeedUpdateDates(sorted);

          // 가장 최근 시드 업데이트 날짜 설정
          const latestDate = sorted[sorted.length - 1].date;
          console.log(
            `최신 시드 업데이트 날짜: ${latestDate}, 값: ${
              sorted[sorted.length - 1].value
            }`
          );
          setLatestUpdatedSeedDate(latestDate);

          // 마지막 시드 업데이트 이후의 거래 수 계산
          if (trades && trades.length > 0) {
            const tradesAfterLastUpdate = trades.filter(
              (trade) => trade.buyDate > latestDate
            );
            console.log(
              `마지막 시드 업데이트(${latestDate}) 이후 거래 수: ${tradesAfterLastUpdate.length}`
            );
          }
        } else {
          console.log("updatedSeed가 비어 있습니다.");
          setSeedUpdateDates([]);
          setLatestUpdatedSeedDate("");
        }
      } catch (error) {
        console.error("Error fetching seed update dates:", error);
      }
    }

    fetchSeedUpdateDates();
  }, [userId, trades]);

  useEffect(() => {
    async function fetchManualFixInfo() {
      if (!userId) return;
      const { data, error } = await supabase
        .from("dynamicwave")
        .select("manualFixInfo")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.error("Error fetching manualFixInfo:", error);
        return;
      }
      // 데이터가 있으면 사용하고, 없으면 빈 객체로 초기화
      setManualFixInfo(data?.manualFixInfo || {});
    }
    fetchManualFixInfo();
  }, [userId]);

  const handleWithdrawalModalConfirm = async () => {
    if (modalTradeIndex === null) return;
    const index = modalTradeIndex;
    const newTrades = [...trades];
    newTrades[index] = {
      ...newTrades[index],
      manualFixedWithdrawal: modalWithdrawalAmount,
      actualwithdrawalAmount: modalWithdrawalAmount,
    };

    // 매뉴얼 수정 정보 업데이트
    const updatedManualFixInfo = {
      ...manualFixInfo,
      [newTrades[index].buyDate]: modalWithdrawalAmount,
    };
    setManualFixInfo(updatedManualFixInfo);

    // 최종적으로 날짜순으로 정렬
    const sortedTrades = sortTradesByBuyDate(newTrades);
    setTrades(sortedTrades);
    onTradesUpdate?.(sortedTrades);

    // DB 업데이트
    try {
      setIsLoading(true);
      await supabase.from("dynamicwave").upsert({
        user_id: userId,
        settings: { ...settings },
        tradehistory: sortedTrades,
        manualFixInfo: updatedManualFixInfo,
      });
      setIsLoading(false);
    } catch (error) {
      console.error("출금액 수정 업데이트 실패:", error);
      setIsLoading(false);
    }

    setIsWithdrawalModalOpen(false);
  };

  const openWithdrawalModal = (index: number) => {
    const trade = trades[index];
    setModalTradeIndex(index);
    setModalWithdrawalAmount(
      trade.manualFixedWithdrawal ||
        trade.actualwithdrawalAmount ||
        trade.withdrawalAmount ||
        settings.withdrawalAmount
    );
    setIsWithdrawalModalOpen(true);
  };

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

  return (
    <div className="p-4">
      {isLoading && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
          <div className="text-white flex flex-col items-center">
            <FaSpinner className="animate-spin text-4xl mb-2" />
            <span>처리 중...</span>
          </div>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-xl mb-4">거래 내역</h2>
        <div className="bg-gray-700 p-4 rounded">
          {trades.length === 0 ? (
            isModeLoading ? (
              <div className="text-center text-white p-4">
                <FaSpinner className="animate-spin w-8 h-8 mx-auto" />
              </div>
            ) : (
              <p>거래 내역이 없습니다.</p>
            )
          ) : (
            <div className="relative overflow-x-auto">
              {/* 아코디언 토글 버튼 */}
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold">거래 내역</h3>
                <button
                  onClick={() => setIsTableCollapsed(!isTableCollapsed)}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                >
                  {isTableCollapsed ? "모든 내역 보기" : "마지막 행만 보기"}
                </button>
              </div>

              {/* 테이블 컨테이너에 스타일 적용 */}
              <div
                className={`overflow-x-auto relative ${
                  !isMobile ? "max-h-[500px]" : ""
                }`}
              >
                <style>{`
                  .bg-gray-750 {
                    background-color: #2d3748;
                  }
                  
                  /* 모바일 최적화를 위한 스타일 */
                  @media (max-width: 768px) {
                    .mobile-hidden {
                      display: none;
                    }
                    
                    .mobile-compact th,
                    .mobile-compact td {
                      padding: 4px !important;
                      font-size: 0.8rem !important;
                    }
                    
                    /* 모바일에서 표시되는 열의 너비 조정 */
                    .mobile-date-col {
                      width: 15% !important;
                    }
                    
                    .mobile-mode-col {
                      width: 10% !important;
                    }
                    
                    .mobile-price-col {
                      width: 20% !important;
                    }
                    
                    .mobile-profit-col {
                      width: 20% !important;
                    }
                    
                    .mobile-daily-col {
                      width: 15% !important;
                    }
                    
                    .mobile-withdrawal-col {
                      width: 20% !important;
                    }
                  }
                  
                  /* 테이블 최소 너비 설정 */
                  .trade-table {
                    min-width: 1000px;
                  }
                  
                  /* 모바일에서 테이블 너비 조정 */
                  @media (max-width: 768px) {
                    .trade-table.mobile-compact {
                      min-width: 100% !important;
                    }
                  }
                `}</style>

                {/* 모바일 뷰 토글 버튼 */}
                <div className="mb-2 md:hidden">
                  <div className="flex flex-col space-y-2">
                    <button
                      onClick={() => setShowAllColumns(!showAllColumns)}
                      className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
                    >
                      {showAllColumns ? "간략히 보기" : "모든 열 보기"}
                    </button>
                    <button
                      onClick={() => setShowAllTrades(!showAllTrades)}
                      className="px-3 py-1 bg-green-500 text-white rounded text-sm"
                    >
                      {showAllTrades ? "최근 10개만 보기" : "모든 거래 보기"}
                    </button>
                  </div>
                </div>

                <table
                  className={`w-full trade-table ${
                    !showAllColumns ? "mobile-compact" : ""
                  }`}
                >
                  {/* 고정된 헤더를 위한 스타일 적용 */}
                  <thead className="sticky top-0 bg-gray-800 z-10">
                    <tr>
                      <th className="px-2 py-3 border-b border-gray-600 mobile-date-col">
                        매수 날짜
                      </th>
                      <th className="px-2 py-3 border-b border-gray-600 mobile-mode-col">
                        모드
                      </th>
                      <th
                        className={`px-2 py-3 border-b border-gray-600 ${
                          !showAllColumns ? "mobile-hidden" : ""
                        }`}
                      >
                        매수 목표가
                      </th>
                      <th className="px-2 py-3 border-b border-gray-600 mobile-price-col">
                        실제 매수가
                      </th>
                      <th
                        className={`px-2 py-3 border-b border-gray-600 ${
                          !showAllColumns ? "mobile-hidden" : ""
                        }`}
                      >
                        수량
                      </th>
                      <th
                        className={`px-2 py-3 border-b border-gray-600 ${
                          !showAllColumns ? "mobile-hidden" : ""
                        }`}
                      >
                        매도 목표가
                      </th>
                      <th
                        className={`px-2 py-3 border-b border-gray-600 ${
                          !showAllColumns ? "mobile-hidden" : ""
                        }`}
                      >
                        매도 날짜
                      </th>
                      <th className="px-2 py-3 border-b border-gray-600">
                        실제 매도가
                      </th>
                      <th
                        className={`px-2 py-3 border-b border-gray-600 ${
                          !showAllColumns ? "mobile-hidden" : ""
                        }`}
                      >
                        매도 수량
                      </th>
                      <th
                        className={`px-2 py-3 border-b border-gray-600 ${
                          !showAllColumns ? "mobile-hidden" : ""
                        }`}
                      >
                        남은 수량
                      </th>
                      <th className="px-2 py-3 border-b border-gray-600 mobile-profit-col">
                        수익금
                      </th>
                      <th
                        className={`px-2 py-3 border-b border-gray-600 ${
                          !showAllColumns ? "mobile-hidden" : ""
                        }`}
                      >
                        남은 날짜
                      </th>
                      <th className="px-2 py-3 border-b border-gray-600 mobile-daily-col">
                        당일손익
                      </th>
                      <th className="px-2 py-3 border-b border-gray-600 mobile-withdrawal-col">
                        출금액
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 아코디언 기능 적용 - 마지막 행만 표시하거나 모든 행 표시 */}
                    {(isTableCollapsed
                      ? [trades[trades.length - 1]]
                      : isMobile && !showAllTrades
                      ? trades.slice(-10)
                      : trades
                    ).map((trade, index) => {
                      // 시드 업데이트 날짜인지 확인
                      const isSeedUpdateDate = seedUpdateDates.some(
                        (item) => item.date === trade.buyDate
                      );
                      // 마지막 시드 업데이트 이후의 거래인지 확인
                      const isAfterLastUpdate =
                        latestUpdatedSeedDate &&
                        new Date(trade.buyDate) >
                          new Date(latestUpdatedSeedDate);

                      // 홀수행/짝수행 배경색 구분을 위한 클래스 추가
                      const rowClass =
                        index % 2 === 0 ? "bg-gray-700" : "bg-gray-750";

                      // 시드 업데이트 날짜인 경우 하이라이트
                      const seedUpdateClass = isSeedUpdateDate
                        ? "bg-blue-900"
                        : "";

                      // 마지막 시드 업데이트 이후의 거래인 경우 하이라이트
                      const afterUpdateClass = isAfterLastUpdate
                        ? "border-l-4 border-green-500"
                        : "";

                      return (
                        <tr
                          key={trade.tradeIndex}
                          className={`${rowClass} ${seedUpdateClass} ${afterUpdateClass} hover:bg-gray-600`}
                        >
                          <td className="px-2 py-2 border-b border-gray-600">
                            {/* 날짜 형식 변경: YYYY-MM-DD -> MM.DD. */}
                            {trade.buyDate
                              ? new Date(trade.buyDate)
                                  .toLocaleDateString("ko-KR", {
                                    month: "2-digit",
                                    day: "2-digit",
                                  })
                                  .replace(/\. /g, ".")
                              : "-"}
                          </td>
                          <td className="px-2 py-2 border-b border-gray-600">
                            <span
                              className={`px-2 py-1 rounded ${
                                trade.mode === "safe"
                                  ? "bg-green-500"
                                  : "bg-red-500"
                              }`}
                            >
                              {/* 모드 표시 변경: aggressive -> 공, safe -> 안 */}
                              {trade.mode === "safe" ? "안" : "공"}
                            </span>
                          </td>
                          <td
                            className={`px-2 py-2 border-b border-gray-600 ${
                              !showAllColumns ? "mobile-hidden" : ""
                            }`}
                          >
                            ${trade.targetBuyPrice.toFixed(2)}
                          </td>
                          <td className="px-2 py-2 border-b border-gray-600">
                            ${trade.actualBuyPrice.toFixed(2)}
                          </td>
                          <td
                            className={`px-2 py-2 border-b border-gray-600 ${
                              !showAllColumns ? "mobile-hidden" : ""
                            }`}
                          >
                            {trade.quantity}
                          </td>
                          <td
                            className={`px-2 py-2 border-b border-gray-600 ${
                              !showAllColumns ? "mobile-hidden" : ""
                            }`}
                          >
                            ${trade.targetSellPrice.toFixed(2)}
                          </td>
                          <td
                            className={`px-2 py-2 border-b border-gray-600 ${
                              !showAllColumns ? "mobile-hidden" : ""
                            }`}
                          >
                            {trade.sellDate
                              ? new Date(trade.sellDate)
                                  .toLocaleDateString("ko-KR", {
                                    month: "2-digit",
                                    day: "2-digit",
                                  })
                                  .replace(/\. /g, ".")
                              : "-"}
                          </td>
                          <td
                            className="px-2 py-2 border-b border-gray-600 cursor-pointer mobile-price-col"
                            onClick={() => openSellModal(index)}
                          >
                            <div className="flex items-center space-x-2">
                              <span>
                                {trade.actualSellPrice
                                  ? `$${trade.actualSellPrice.toFixed(2)}`
                                  : "-"}
                              </span>
                            </div>
                          </td>
                          <td
                            className={`px-2 py-2 border-b border-gray-600 ${
                              !showAllColumns ? "mobile-hidden" : ""
                            }`}
                          >
                            {trade.sellQuantity || "-"}
                          </td>
                          <td
                            className={`px-2 py-2 border-b border-gray-600 ${
                              !showAllColumns ? "mobile-hidden" : ""
                            }`}
                          >
                            {trade.quantity - (trade.sellQuantity || 0)}
                          </td>
                          <td className="px-2 py-2 border-b border-gray-600 mobile-profit-col">
                            {trade.profit !== undefined
                              ? `$${trade.profit.toFixed(2)}`
                              : "-"}
                          </td>
                          <td
                            className={`px-2 py-2 border-b border-gray-600 ${
                              !showAllColumns ? "mobile-hidden" : ""
                            }`}
                          >
                            {trade.sellDate ? (
                              <span className="px-2 py-1 rounded bg-blue-500 text-white">
                                완
                              </span>
                            ) : trade.actualBuyPrice === 0 ? (
                              "-"
                            ) : (
                              trade.daysUntilSell
                            )}
                          </td>
                          <td className="px-2 py-2 border-b border-gray-600 mobile-daily-col">
                            {trade.dailyProfit !== undefined
                              ? `$${Math.round(trade.dailyProfit)}`
                              : "-"}
                          </td>
                          <td className="px-2 py-2 border-b border-gray-600 mobile-withdrawal-col">
                            {/* 최근 10거래일 시드 업데이트 이후 날짜의 출금액만 수정 가능 */}
                            {isAfterLastUpdate ? (
                              <span
                                className={`cursor-pointer hover:text-blue-400 ${
                                  trade.tradeIndex % 10 === 0
                                    ? "text-red-500 font-bold"
                                    : ""
                                }`}
                                onClick={() => openWithdrawalModal(index)}
                              >
                                {trade.actualwithdrawalAmount !== undefined
                                  ? `$${Math.round(
                                      trade.actualwithdrawalAmount
                                    )}`
                                  : trade.withdrawalAmount !== undefined
                                  ? `$${Math.round(trade.withdrawalAmount)}`
                                  : "-"}
                              </span>
                            ) : (
                              <span
                                className={`${
                                  trade.tradeIndex % 10 === 0
                                    ? "text-red-500 font-bold"
                                    : ""
                                }`}
                              >
                                {trade.actualwithdrawalAmount !== undefined
                                  ? `$${Math.round(
                                      trade.actualwithdrawalAmount
                                    )}`
                                  : trade.withdrawalAmount !== undefined
                                  ? `$${Math.round(trade.withdrawalAmount)}`
                                  : "-"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div
              className="absolute inset-0 bg-black opacity-50"
              onClick={() => setIsModalOpen(false)}
            ></div>
            <div className="bg-gray-800 p-4 rounded shadow-lg z-10 w-80">
              <h3 className="text-lg font-bold mb-4 text-white">
                매도 정보 수정
              </h3>
              <div className="mb-2">
                <label className="block mb-1 text-white">매도 날짜</label>
                <DatePicker
                  selected={modalSellDate ? new Date(modalSellDate) : null}
                  onChange={(date) =>
                    setModalSellDate(
                      date ? date.toISOString().split("T")[0] : ""
                    )
                  }
                  dateFormat="MM-dd"
                  className="border border-gray-600 p-1 rounded w-full bg-gray-700 text-white"
                />
              </div>
              <div className="mb-2">
                <label className="block mb-1 text-white">실제 매도가</label>
                <input
                  type="number"
                  value={modalSellPrice !== undefined ? modalSellPrice : ""}
                  onChange={(e) =>
                    setModalSellPrice(parseFloat(e.target.value))
                  }
                  className="border border-gray-600 p-1 rounded w-full bg-gray-700 text-white"
                />
              </div>
              <div className="mb-2">
                <label className="block mb-1 text-white">매도 수량</label>
                <input
                  type="number"
                  value={
                    modalSellQuantity !== undefined ? modalSellQuantity : ""
                  }
                  onChange={(e) =>
                    setModalSellQuantity(parseFloat(e.target.value))
                  }
                  className="border border-gray-600 p-1 rounded w-full bg-gray-700 text-white"
                />
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="bg-gray-600 px-3 py-1 rounded mr-2 text-white"
                >
                  취소
                </button>
                <button
                  onClick={handleModalConfirm}
                  className="bg-blue-500 text-white px-3 py-1 rounded"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}

        {isWithdrawalModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div
              className="absolute inset-0 bg-black opacity-50"
              onClick={() => setIsWithdrawalModalOpen(false)}
            ></div>
            <div className="bg-gray-800 p-4 rounded shadow-lg z-10 w-80">
              <h3 className="text-lg font-bold mb-4 text-white">출금액 수정</h3>
              <div className="mb-2">
                <label className="block mb-1 text-white">출금액</label>
                <input
                  type="number"
                  value={modalWithdrawalAmount}
                  onChange={(e) =>
                    setModalWithdrawalAmount(parseFloat(e.target.value))
                  }
                  className="border border-gray-600 p-1 rounded w-full bg-gray-700 text-white"
                />
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setIsWithdrawalModalOpen(false)}
                  className="bg-gray-600 px-3 py-1 rounded mr-2 text-white"
                >
                  취소
                </button>
                <button
                  onClick={handleWithdrawalModalConfirm}
                  className="bg-blue-500 text-white px-3 py-1 rounded"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TradeHistory;
