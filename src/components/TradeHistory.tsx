import React, { useEffect, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { FaSpinner } from "react-icons/fa";
import supabase from "../utils/supabase";

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
  const [modalSellDate, setModalSellDate] = useState<string>("");
  const [modalSellPrice, setModalSellPrice] = useState<number | undefined>(
    undefined
  );
  const [modalSellQuantity, setModalSellQuantity] = useState<
    number | undefined
  >(undefined);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [modalWithdrawalTradeIndex, setModalWithdrawalTradeIndex] = useState<
    number | null
  >(null);
  const [modalWithdrawalAmount, setModalWithdrawalAmount] = useState<number>(0);
  const [latestUpdatedSeedDate, setLatestUpdatedSeedDate] =
    useState<string>("");
  const [manualFixInfo, setManualFixInfo] = useState<{ [key: string]: number }>(
    {}
  );
  const [seedUpdateDates, setSeedUpdateDates] = useState<string[]>([]);

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

      if (initialTrades && initialTrades.length > 0) {
        console.log("DB에 존재하는 Trade 내역을 사용합니다.");
        newTrades = [...initialTrades];

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
            const yesterdayStr = new Date(
              new Date().setDate(new Date().getDate() - 1)
            )
              .toISOString()
              .split("T")[0];

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

        // 마지막 시드 업데이트 이후의 거래 내역을 기준으로 currentSeed 설정
        if (latestUpdatedSeedDate) {
          const latestSeedUpdateIndex = newTrades.findIndex(
            (trade) => trade.buyDate === latestUpdatedSeedDate
          );
          if (
            latestSeedUpdateIndex !== -1 &&
            latestSeedUpdateIndex < newTrades.length - 1
          ) {
            // 마지막 시드 업데이트 이후의 거래만 고려하여 blockCount 재계산
            blockCount = (newTrades.length - (latestSeedUpdateIndex + 1)) % 10;
            console.log("마지막 시드 업데이트 이후 blockCount:", blockCount);
          }
        }

        setTrades(initialTrades);

        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().split("T")[0];
        const existingYesterdayTrade = initialTrades.find(
          (trade) =>
            new Date(trade.buyDate).toISOString().split("T")[0] ===
              yesterdayStr && trade.targetSellPrice > 0
        );

        if (existingYesterdayTrade) {
          console.log("계산된 yesterdaySell:", existingYesterdayTrade);
          onUpdateYesterdaySell?.(existingYesterdayTrade);
        } else if (closingPrices.length > 0) {
          const yesterdayClosing = closingPrices.find(
            (priceEntry) =>
              new Date(priceEntry.date).toISOString().split("T")[0] ===
              yesterdayStr
          );
          if (yesterdayClosing) {
            const currentPrice = parseFloat(yesterdayClosing.price);
            const mode =
              sortedModes.length > 0
                ? findModeForDateNoWait(yesterdayStr, sortedModes)
                : "safe";
            const buyPercent =
              mode === "safe"
                ? settings.safeBuyPercent
                : settings.aggressiveBuyPercent;
            const sellPercent =
              mode === "safe"
                ? settings.safeSellPercent
                : settings.aggressiveSellPercent;
            const daysUntilSell =
              mode === "safe"
                ? settings.safeMaxDays
                : settings.aggressiveMaxDays;
            const targetBuyPrice = currentPrice * (1 + buyPercent / 100);
            const actualBuyPrice = currentPrice;
            const quantity = Math.floor(
              currentSeed / settings.seedDivision / targetBuyPrice
            );
            const targetSellPrice = actualBuyPrice * (1 + sellPercent / 100);
            const withdrawalFromManualFix =
              manualFixInfo[yesterdayStr] ?? settings.withdrawalAmount;

            const newYesterdayTrade: Trade = {
              tradeIndex,
              buyDate: yesterdayStr,
              mode,
              targetBuyPrice,
              actualBuyPrice,
              quantity,
              targetSellPrice,
              daysUntilSell,
              seedForDay: currentSeed,
              dailyProfit: 0,
              withdrawalAmount: withdrawalFromManualFix,
              actualwithdrawalAmount: withdrawalFromManualFix,
            };
            console.log("생성된 어제 트레이드:", newYesterdayTrade);
            onUpdateYesterdaySell?.(newYesterdayTrade);
            newTrades.push(newYesterdayTrade);
            setTrades(newTrades);
            onTradesUpdate?.(newTrades);
            await supabase.from("dynamicwave").upsert({
              user_id: userId,
              settings: { ...settings },
              tradehistory: newTrades,
              manualFixInfo,
            });
            tradeIndex++;
            blockCount++;

            // 블록 카운트가 10이 되면 시드 업데이트
            if (blockCount === 10) {
              console.log(
                "어제 거래 추가 후 blockCount가 10이 되어 시드 업데이트 실행"
              );
              currentSeed = await updateSeedForTrades(
                newTrades,
                currentSeed,
                newYesterdayTrade.buyDate
              );
              blockCount = 0;
            }
          } else {
            console.warn("어제 종가가 존재하지 않습니다.");
          }
        }
      }

      for (let index = 0; index < closingPrices.length; index++) {
        const priceEntry = closingPrices[index];
        const rawBuyDateObj = new Date(priceEntry.date);
        if (rawBuyDateObj < startDateObj) continue;

        const buyDateStr = rawBuyDateObj.toISOString().split("T")[0];

        // 금요일인지 확인
        const isWeekend = rawBuyDateObj.getDay() === 5; // 5는 금요일

        // 해당 날짜의 모든 기존 트레이드 찾기
        const existingTrades = newTrades.filter(
          (t) => t.buyDate === buyDateStr
        );

        // 이미 해당 날짜에 트레이드가 있으면 스킵
        if (existingTrades.length > 0) {
          console.log(
            `${buyDateStr}에 이미 ${existingTrades.length}개의 트레이드가 존재합니다. 스킵합니다.`
          );
          if (isWeekend) {
            console.log(
              `${buyDateStr}는 금요일입니다. 중복 생성 방지를 위해 추가 검증을 수행합니다.`
            );
          }
          continue;
        }

        // 금요일인 경우 추가 로깅
        if (isWeekend) {
          console.log(
            `${buyDateStr}는 금요일입니다. 새로운 트레이드를 생성합니다.`
          );
        }

        const mode =
          sortedModes.length > 0
            ? findModeForDateNoWait(buyDateStr, sortedModes)
            : "safe";
        const currentPrice = parseFloat(priceEntry.price);
        const previousClosePrice =
          index > 0 ? parseFloat(closingPrices[index - 1].price) : currentPrice;
        const buyPercent =
          mode === "safe"
            ? settings.safeBuyPercent
            : settings.aggressiveBuyPercent;
        const sellPercent =
          mode === "safe"
            ? settings.safeSellPercent
            : settings.aggressiveSellPercent;
        const targetBuyPrice = previousClosePrice * (1 + buyPercent / 100);
        const actualBuyPrice =
          currentPrice <= targetBuyPrice ? currentPrice : 0;
        const quantity = actualBuyPrice
          ? Math.floor(
              currentSeed / (settings.seedDivision || 1) / targetBuyPrice
            )
          : 0;
        const targetSellPrice = actualBuyPrice * (1 + sellPercent / 100);
        const daysUntilSell =
          mode === "safe" ? settings.safeMaxDays : settings.aggressiveMaxDays;
        const withdrawalFromManualFix =
          manualFixInfo[buyDateStr] ?? settings.withdrawalAmount;

        const trade: Trade = {
          tradeIndex,
          buyDate: buyDateStr,
          mode,
          targetBuyPrice,
          actualBuyPrice,
          quantity,
          targetSellPrice,
          seedForDay: currentSeed,
          dailyProfit: 0,
          daysUntilSell,
          withdrawalAmount: withdrawalFromManualFix,
          actualwithdrawalAmount: withdrawalFromManualFix,
        };

        for (let i = index + 1; i < closingPrices.length; i++) {
          const futurePrice = parseFloat(closingPrices[i].price);
          if (futurePrice >= trade.targetSellPrice && trade.quantity > 0) {
            trade.sellDate = closingPrices[i].date;
            trade.actualSellPrice = futurePrice;
            trade.sellQuantity = trade.quantity;
            trade.profit =
              (futurePrice - trade.actualBuyPrice) * trade.quantity;
            trade.sellDate = adjustSellDate(trade.sellDate!);
            dailyProfitMap[trade.sellDate] = dailyProfitMap[trade.sellDate] || {
              totalProfit: 0,
              tradeIndex: 0,
            };
            dailyProfitMap[trade.sellDate].totalProfit += trade.profit || 0;
            dailyProfitMap[trade.sellDate].tradeIndex = trade.tradeIndex;
            break;
          }
        }
        trade.dailyProfit = dailyProfitMap[trade.buyDate]?.totalProfit || 0;

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
              }
            }
          }
        }

        newTrades.push(trade);
        tradeIndex++;
        blockCount++;

        console.log(
          `거래 추가 후 blockCount: ${blockCount}, 날짜: ${buyDateStr}`
        );
        if (blockCount === 10) {
          console.log(`10거래일 완료, 시드 업데이트 실행: ${buyDateStr}`);
          currentSeed = await updateSeedForTrades(
            newTrades,
            currentSeed,
            trade.buyDate
          );
          blockCount = 0;
        }
      }

      if (JSON.stringify(newTrades) !== JSON.stringify(trades)) {
        setTrades(newTrades);
        onTradesUpdate?.(newTrades);
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
        // 오늘 날짜
        const today = new Date();

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

          // 매수일로부터 오늘까지의 일수 계산
          const buyDate = new Date(newTrades[i].buyDate);
          const diffDays = Math.floor(
            (today.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          // 모드에 따른 최대 보유일
          const maxDays =
            newTrades[i].mode === "safe"
              ? settings.safeMaxDays
              : settings.aggressiveMaxDays;

          // 남은 날짜 계산
          newTrades[i].daysUntilSell = maxDays - diffDays;

          // 남은 날짜가 -1 이하인 경우 (보유 기간 초과)
          if (newTrades[i].daysUntilSell < 0) {
            // 매도일 계산 (매수일 + 최대 보유일)
            const sellDate = new Date(buyDate);
            sellDate.setDate(sellDate.getDate() + maxDays);
            const sellDateStr = sellDate.toISOString().split("T")[0];

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
    // 최근 10거래일만 계산에 포함 (이전 거래일의 출금액은 계산에 포함하지 않음)
    const blockTrades = trades.slice(-10);

    // 최근 10거래일의 일일 수익 합계
    const totalDailyProfit = blockTrades.reduce(
      (sum, trade) => sum + (trade.dailyProfit || 0),
      0
    );

    // 최근 10거래일의 출금액 합계
    const withdrawal = blockTrades.reduce(
      (sum, trade) => sum + (trade.actualwithdrawalAmount || 0),
      0
    );

    // 수익/손실에 따른 복리 계산
    const compoundedProfit =
      totalDailyProfit >= 0
        ? totalDailyProfit * (settings.profitCompounding / 100)
        : totalDailyProfit * (settings.lossCompounding / 100);

    // 새로운 시드 = 이전 시드 + 복리 수익 - 출금액
    const newSeed = previousSeed + compoundedProfit - withdrawal;

    console.log("computeUpdatedSeed:", {
      previousSeed,
      totalDailyProfit,
      compoundedProfit,
      withdrawal,
      newSeed,
      blockTradesDates: blockTrades.map((t) => t.buyDate), // 디버깅용: 계산에 포함된 거래일 확인
    });

    return newSeed;
  };

  const checkAndUpdateSeed = async (
    calculatedSeed: number,
    tradesToUpdate: Trade[],
    tradeDate: string
  ) => {
    const recordDate = tradeDate;
    console.log(
      `시드 업데이트 시작 - 날짜: ${recordDate}, 계산된 시드: ${calculatedSeed}`
    );

    try {
      const { data: dbData, error } = await supabase
        .from("dynamicwave")
        .select("updatedSeed, settings")
        .eq("user_id", userId)
        .single();

      if (error) {
        console.error("Seed update fetch error:", error);
        return calculatedSeed;
      }

      const updatedSeedRecords: { date: string; value: number }[] =
        Array.isArray(dbData?.updatedSeed) ? dbData.updatedSeed : [];

      // 이미 같은 날짜에 업데이트된 기록이 있는지 확인
      const existingRecordIndex = updatedSeedRecords.findIndex(
        (record) => record.date === recordDate
      );

      if (existingRecordIndex === -1) {
        // 새 기록 추가
        updatedSeedRecords.push({ date: recordDate, value: calculatedSeed });
        console.log(`새 시드 기록 추가: ${recordDate}, ${calculatedSeed}`);
      } else {
        // 기존 기록 업데이트
        updatedSeedRecords[existingRecordIndex].value = calculatedSeed;
        console.log(
          `기존 시드 기록 업데이트: ${recordDate}, ${calculatedSeed}`
        );
      }

      // 시드 기록을 날짜순으로 정렬
      updatedSeedRecords.sort((a, b) => a.date.localeCompare(b.date));

      // 설정에 현재 투자금 업데이트
      const updatedSettings: Settings = {
        ...dbData?.settings,
        currentInvestment: calculatedSeed,
      };

      // DB 업데이트
      const { error: upsertError } = await supabase.from("dynamicwave").upsert({
        user_id: userId,
        settings: updatedSettings,
        tradehistory: tradesToUpdate,
        updatedSeed: updatedSeedRecords,
        manualFixInfo,
      });

      if (upsertError) {
        console.error("시드 업데이트 저장 오류:", upsertError);
        return calculatedSeed;
      }

      console.log(
        `시드 업데이트 완료 - 날짜: ${recordDate}, 값: ${calculatedSeed}`
      );

      // 상태 업데이트
      setLatestUpdatedSeedDate(recordDate);

      // seedUpdateDates 상태 업데이트
      setSeedUpdateDates((prev) => {
        const newDates = [...prev];
        if (!newDates.includes(recordDate)) {
          newDates.push(recordDate);
          // 날짜순 정렬
          newDates.sort((a, b) => a.localeCompare(b));
        }
        return newDates;
      });

      onSeedUpdate?.(calculatedSeed);

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
    console.log(
      `updateSeedForTrades 호출 - 날짜: ${tradeDate}, 현재 시드: ${currentSeed}`
    );
    const newSeed = computeUpdatedSeed(trades, currentSeed);
    const updatedSeed = await checkAndUpdateSeed(newSeed, trades, tradeDate);
    return updatedSeed;
  };

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

    if (modalSellPrice !== undefined && modalSellQuantity !== undefined) {
      updatedTrade.profit =
        (modalSellPrice - updatedTrade.actualBuyPrice) * modalSellQuantity;
      const dailyTradeIndex = newTrades.findIndex(
        (t) => t.buyDate === modalSellDate
      );
      if (dailyTradeIndex !== -1) {
        newTrades[dailyTradeIndex].dailyProfit =
          (newTrades[dailyTradeIndex].dailyProfit || 0) + updatedTrade.profit;
      } else {
        updatedTrade.dailyProfit = updatedTrade.profit;
      }
    }

    newTrades[index] = updatedTrade;
    setTrades(newTrades);
    await onSellInfoUpdate(updatedTrade.tradeIndex, {
      sellDate: modalSellDate,
      sellPrice: modalSellPrice,
      sellQuantity: modalSellQuantity,
    });
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

          // 모든 시드 업데이트 날짜를 배열로 저장
          const updateDates = sorted.map(
            (item: { date: string; value: number }) => item.date
          );
          setSeedUpdateDates(updateDates);

          // 가장 최근 시드 업데이트 날짜 설정
          const latestDate = sorted[sorted.length - 1].date;
          console.log(
            `최신 시드 업데이트 날짜: ${latestDate}, 값: ${
              sorted[sorted.length - 1].value
            }`
          );
          setLatestUpdatedSeedDate(latestDate);
        } else {
          console.log("시드 업데이트 기록이 없습니다.");
          setSeedUpdateDates([]);
        }
      } catch (error) {
        console.error("시드 업데이트 날짜 조회 중 예외 발생:", error);
      }
    }

    fetchSeedUpdateDates();
  }, [userId]);

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
    if (modalWithdrawalTradeIndex === null) return;
    const trade = trades[modalWithdrawalTradeIndex];
    const updatedTrades = trades.map((t) =>
      t.tradeIndex === trade.tradeIndex
        ? {
            ...t,
            withdrawalAmount: modalWithdrawalAmount,
            actualwithdrawalAmount: modalWithdrawalAmount,
            manualFixedWithdrawal: modalWithdrawalAmount,
          }
        : t
    );
    const key = trade.buyDate;
    const updatedManualFixInfo = {
      ...manualFixInfo,
      [key]: modalWithdrawalAmount,
    };

    try {
      // 기존 데이터를 가져옵니다.
      const { data: existingData, error: fetchError } = await supabase
        .from("dynamicwave")
        .select("settings")
        .eq("user_id", userId)
        .maybeSingle();

      if (fetchError) {
        console.error("기존 데이터 가져오기 실패:", fetchError);
        return;
      }

      // 기존 settings가 있으면 사용하고, 없으면 기본값으로 빈 객체를 설정합니다.
      const currentSettings = existingData?.settings || {};

      // 업데이트 시 settings를 포함합니다.
      const { error } = await supabase.from("dynamicwave").upsert({
        user_id: userId,
        settings: currentSettings, // 기존 settings 유지
        tradehistory: updatedTrades,
        manualFixInfo: updatedManualFixInfo,
      });

      if (error) {
        console.error("출금액 업데이트 실패:", error);
      } else {
        console.log("출금액 업데이트 성공:", modalWithdrawalAmount);
        setManualFixInfo(updatedManualFixInfo); // 상태 업데이트로 화면 반영
        setTrades(updatedTrades); // 상태 업데이트로 화면 반영
      }
    } catch (error) {
      console.error("출금액 업데이트 예외 발생:", error);
    }
    setIsWithdrawalModalOpen(false); // 모달 닫기
  };

  const openWithdrawalModal = (index: number) => {
    const trade = trades[index];
    setModalWithdrawalTradeIndex(index);
    setModalWithdrawalAmount(trade.withdrawalAmount ?? 0);
    setIsWithdrawalModalOpen(true);
  };

  return (
    <div className="bg-gray-800 p-4 rounded">
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
          <table className="w-full">
            <thead>
              <tr>
                <th>매수 날짜</th>
                <th>모드</th>
                <th>매수 목표가</th>
                <th>실제 매수가</th>
                <th>수량</th>
                <th>매도 목표가</th>
                <th>매도 날짜</th>
                <th>실제 매도가</th>
                <th>매도 수량</th>
                <th>남은 수량</th>
                <th>수익금</th>
                <th>남은 날짜</th>
                <th>당일손익</th>
                <th>출금액</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, index) => (
                <tr key={index}>
                  <td className="text-center">
                    {new Date(trade.buyDate).toLocaleDateString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </td>
                  <td className="text-center">
                    {trade.mode === "safe" ? (
                      <span style={{ color: "green" }}>안전</span>
                    ) : (
                      <span style={{ color: "red" }}>공세</span>
                    )}
                  </td>
                  <td className="text-center">
                    {trade.targetBuyPrice.toFixed(2)}
                  </td>
                  <td className="text-center">
                    {trade.actualBuyPrice.toFixed(2)}
                  </td>
                  <td className="text-center">{trade.quantity}</td>
                  <td className="text-center">
                    {trade.targetSellPrice.toFixed(2)}
                  </td>
                  <td
                    className="text-center cursor-pointer"
                    onClick={() => openSellModal(index)}
                  >
                    {trade.actualBuyPrice > 0
                      ? trade.sellDate
                        ? new Date(trade.sellDate).toLocaleDateString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                          })
                        : "-"
                      : "-"}
                  </td>
                  <td
                    className="text-center cursor-pointer"
                    onClick={() => openSellModal(index)}
                  >
                    {trade.actualBuyPrice > 0
                      ? trade.actualSellPrice !== undefined
                        ? trade.actualSellPrice.toFixed(2)
                        : "-"
                      : "-"}
                  </td>
                  <td
                    className="text-center cursor-pointer"
                    onClick={() => openSellModal(index)}
                  >
                    {trade.actualBuyPrice > 0
                      ? typeof trade.sellQuantity === "number"
                        ? trade.sellQuantity
                        : "-"
                      : "-"}
                  </td>
                  <td className="text-center">
                    {trade.actualBuyPrice > 0
                      ? trade.quantity - (trade.sellQuantity || 0)
                      : "-"}
                  </td>
                  <td className="text-center">
                    {trade.actualBuyPrice > 0
                      ? trade.profit?.toFixed(2) || 0
                      : "-"}
                  </td>
                  <td className="text-center">
                    {trade.quantity - (trade.sellQuantity || 0) > 0
                      ? trade.daysUntilSell
                      : "-"}
                  </td>
                  <td className="text-center">
                    {trade.dailyProfit?.toFixed(2)}
                  </td>
                  <td className="text-center">
                    {trade.buyDate ? (
                      latestUpdatedSeedDate &&
                      new Date(trade.buyDate) >
                        new Date(latestUpdatedSeedDate) ? (
                        // 1. 마지막 시드 업데이트 이후의 거래일: 빨간색 + 클릭 가능 (수정 가능)
                        <span
                          className="cursor-pointer text-red-500"
                          onClick={() => openWithdrawalModal(index)}
                        >
                          {trade.manualFixedWithdrawal !== undefined
                            ? trade.manualFixedWithdrawal
                            : "0(예정)"}
                        </span>
                      ) : seedUpdateDates.includes(trade.buyDate) ? (
                        // 2. 시드 업데이트가 발생한 날짜: 빨간색 (수정 불가)
                        <span className="text-red-500">
                          {trade.actualwithdrawalAmount ?? 0}
                        </span>
                      ) : (
                        // 3. 그 외 모든 날짜: 흰색 (수정 불가)
                        <span>{trade.actualwithdrawalAmount ?? 0}</span>
                      )
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                  setModalSellDate(date ? date.toISOString().split("T")[0] : "")
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
                onChange={(e) => setModalSellPrice(parseFloat(e.target.value))}
                className="border border-gray-600 p-1 rounded w-full bg-gray-700 text-white"
              />
            </div>
            <div className="mb-2">
              <label className="block mb-1 text-white">매도 수량</label>
              <input
                type="number"
                value={modalSellQuantity !== undefined ? modalSellQuantity : ""}
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
  );
};

export default TradeHistory;
