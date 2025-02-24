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
}) => {
  const [isModeLoading, setIsModeLoading] = useState(false);
  const [trades, setTrades] = useState<Trade[]>(initialTrades);
  const [cachedModes, setCachedModes] = useState<ModeItem[] | null>(null);

  // prop으로 받은 settings를 로컬 상태로 관리
  const [localSettings, setSettings] = useState<Settings>(settings);
  useEffect(() => {
    setSettings(settings);
  }, [settings]);

  // 새 모달 관련 상태 추가
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTradeIndex, setModalTradeIndex] = useState<number | null>(null);
  const [modalSellDate, setModalSellDate] = useState<string>("");
  const [modalSellPrice, setModalSellPrice] = useState<number | undefined>(undefined);
  const [modalSellQuantity, setModalSellQuantity] = useState<number | undefined>(undefined);

  async function waitForModes(
    initModes: ModeItem[] | null
  ): Promise<ModeItem[] | null> {
    if (cachedModes && cachedModes.length > 0) {
      return cachedModes;
    }
    setIsModeLoading(true);
    while (!initModes || initModes.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
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

      if (modeEffectiveTime <= targetTime) {
        decidedMode = sortedModes[i].mode;
      } else {
        break;
      }
    }
    return decidedMode;
  }

  useEffect(() => {
    const fetchTrades = async () => {
      if (initialTrades && initialTrades.length > 0) {
        console.log("DB에 존재하는 Trade 내역을 사용합니다.");
        setTrades(initialTrades);
       
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().split("T")[0];
        console.log("계산된 어제 날짜:", yesterdayStr);

        const existingYesterdayTrade = initialTrades.find((trade) => {
          const tradeBuyDateStr = new Date(trade.buyDate).toISOString().split("T")[0];
          return tradeBuyDateStr === yesterdayStr && trade.targetSellPrice > 0;
        });

        if (existingYesterdayTrade) {
          console.log("계산된 yesterdaySell:", existingYesterdayTrade);
          if (onUpdateYesterdaySell) {
            onUpdateYesterdaySell(existingYesterdayTrade);
          }
        } else {
          const yesterdayClosing = closingPrices.find((priceEntry) => {
            const priceDateStr = new Date(priceEntry.date).toISOString().split("T")[0];
            return priceDateStr === yesterdayStr;
          });

          if (yesterdayClosing) {
            const currentPrice = parseFloat(yesterdayClosing.price);

            const finalModes = await waitForModes(modes || null);
            const sortedModes = finalModes ? [...finalModes].sort((a, b) => a.date.localeCompare(b.date)) : [];
            const modeFromApi: "safe" | "aggressive" = sortedModes.length > 0
              ? findModeForDateNoWait(yesterdayStr, sortedModes)
              : "safe";

            const buyPercent = modeFromApi === "safe" ? settings.safeBuyPercent : settings.aggressiveBuyPercent;
            const sellPercent = modeFromApi === "safe" ? settings.safeSellPercent : settings.aggressiveSellPercent;
            const daysUntilSell = modeFromApi === "safe" ? settings.safeMaxDays : settings.aggressiveMaxDays;

            const targetBuyPrice = currentPrice * (1 + buyPercent / 100);
            const actualBuyPrice = currentPrice;
            const quantity = Math.floor(settings.currentInvestment / settings.seedDivision / targetBuyPrice);
            const targetSellPrice = actualBuyPrice * (1 + sellPercent / 100);
            const nextTradeIndex = (initialTrades[initialTrades.length - 1]?.tradeIndex || 0) + 1;

            const newYesterdayTrade: Trade = {
              tradeIndex: nextTradeIndex,
              buyDate: yesterdayStr,
              mode: modeFromApi,
              targetBuyPrice,
              actualBuyPrice,
              quantity,
              targetSellPrice,
              daysUntilSell,
              seedForDay: settings.currentInvestment,
              dailyProfit: 0,
              withdrawalAmount: settings.withdrawalAmount,
              actualwithdrawalAmount: 0,
            };
            console.log("생성된 어제 트레이드:", newYesterdayTrade);
            if (onUpdateYesterdaySell) {
              onUpdateYesterdaySell(newYesterdayTrade);
            }
            const updatedTrades = [...initialTrades, newYesterdayTrade];
            setTrades(updatedTrades);
            if (onTradesUpdate) {
              onTradesUpdate(updatedTrades);
            }
            supabase
              .from("dynamicwave")
              .upsert({ user_id: userId, settings: { ...settings }, tradehistory: updatedTrades })
              .then(() => console.log("새 어제 트레이드가 DB에 추가되었습니다."));
          } else {
            console.warn("어제 종가가 존재하지 않습니다. 어제 트레이드를 생성할 수 없습니다.");
          }
        }

        const startDateStr = settings.startDate;
        const startDateObj = new Date(startDateStr);
        let updatedSeed = settings.currentInvestment;
        let tradeIndex = 2;

        const newTrades: Trade[] = [];
        const dailyProfitMap: {
          [date: string]: { totalProfit: number; tradeIndex: number };
        } = {};

        const finalModes = await waitForModes(modes || null);
        const sortedModes = finalModes
          ? [...finalModes].sort((a, b) => a.date.localeCompare(b.date))
          : [];

        for (let index = 0; index < closingPrices.length; index++) {
          const priceEntry = closingPrices[index];
          const rawBuyDateObj = new Date(priceEntry.date);
          if (rawBuyDateObj < startDateObj) {
            continue;
          }

          const buyDateStr = rawBuyDateObj.toISOString().split("T")[0];
          console.log(`[DEBUG]${buyDateStr} 트레이드 생성 시작`);

          const decidedMode: "safe" | "aggressive" = findModeForDateNoWait(
            buyDateStr,
            sortedModes
          );
          const mode = decidedMode;

          const currentPrice = parseFloat(priceEntry.price);
          const previousClosePrice =
            index > 0 ? parseFloat(closingPrices[index - 1].price) : currentPrice;

          const buyPercent =
            mode === "safe"
              ? settings.safeBuyPercent
              : settings.aggressiveBuyPercent;
          const targetBuyPrice = previousClosePrice * (1 + buyPercent / 100);
          let actualBuyPrice = 0;
          if (currentPrice <= targetBuyPrice) {
            actualBuyPrice = currentPrice;
          }
          console.log(
            `[DEBUG] Trade 생성: buyDate=${buyDateStr}, previousClosePrice=${previousClosePrice}, currentPrice=${currentPrice}, targetBuyPrice=${targetBuyPrice}, actualBuyPrice=${actualBuyPrice}`
          );

          const quantity = actualBuyPrice
            ? Math.floor(
                updatedSeed / (settings.seedDivision || 1) / targetBuyPrice
              )
            : 0;

          const trade: Trade = {
            tradeIndex: tradeIndex,
            buyDate: buyDateStr,
            mode,
            targetBuyPrice,
            actualBuyPrice,
            quantity,
            targetSellPrice: 0,
            seedForDay: updatedSeed,
            dailyProfit: 0,
            daysUntilSell: 0,
            withdrawalAmount: settings.withdrawalAmount,
            actualwithdrawalAmount: 0,
          };

          const sellPercent =
            mode === "safe"
              ? settings.safeSellPercent
              : settings.aggressiveSellPercent;
          trade.targetSellPrice = actualBuyPrice * (1 + sellPercent / 100);
          console.log(
            `[DEBUG] Trade Sell: mode=${mode}, sellPercent=${sellPercent}, targetSellPrice=${trade.targetSellPrice}`
          );

          for (let i = index + 1; i < closingPrices.length; i++) {
            const futurePriceEntry = closingPrices[i];
            const futurePrice = parseFloat(futurePriceEntry.price);

            if (futurePrice >= trade.targetSellPrice && trade.quantity > 0) {
              const futureSellDateObj = new Date(futurePriceEntry.date);
              const futureSellDateStr = futureSellDateObj.toISOString().split("T")[0];

              trade.sellDate = futureSellDateStr;
              trade.actualSellPrice = futurePrice;
              trade.sellQuantity = trade.quantity;
              trade.profit =
                ((futurePrice - trade.actualBuyPrice) * trade.quantity);

              // 매도 날짜 조정: 토/일/월이면 자동으로 지난 금요일 날짜로 조정
              trade.sellDate = adjustSellDate(trade.sellDate!);

              if (!dailyProfitMap[trade.sellDate]) {
                dailyProfitMap[trade.sellDate] = {
                  totalProfit: 0,
                  tradeIndex: 0,
                };
              }
              dailyProfitMap[trade.sellDate].totalProfit += trade.profit || 0;
              dailyProfitMap[trade.sellDate].tradeIndex =
                trade.tradeIndex || 0;

              console.log(
                `[DEBUG] 매도일: ${trade.sellDate}, 매도가: ${trade.actualSellPrice}, targetSellPrice: ${trade.targetSellPrice}, dailyProfitMap[${trade.sellDate}] = ${dailyProfitMap[trade.sellDate].totalProfit}`
              );
              break;
            }
          }
          trade.dailyProfit = dailyProfitMap[trade.buyDate]?.totalProfit || 0;

          const currentTradeMaxDays =
            trade.mode === "safe"
              ? settings.safeMaxDays
              : settings.aggressiveMaxDays;
          trade.daysUntilSell = currentTradeMaxDays;

          const currentTradeBuyDate = new Date(buyDateStr);
          for (let i = 0; i < newTrades.length; i++) {
            if (!newTrades[i].sellDate) {
              const previousTradeBuyDate = new Date(newTrades[i].buyDate);
              const diffDays = Math.floor(
                (currentTradeBuyDate.getTime() - previousTradeBuyDate.getTime()) /
                  (1000 * 60 * 60 * 24)
              );
              const previousTradeMaxDays =
                newTrades[i].mode === "safe"
                  ? settings.safeMaxDays
                  : settings.aggressiveMaxDays;
              newTrades[i].daysUntilSell = previousTradeMaxDays - diffDays;
              if (newTrades[i].daysUntilSell < 0) {
                newTrades[i].daysUntilSell = -1;
                const tradeBuyDateStr = newTrades[i].buyDate;
                const buyIndex = closingPrices.findIndex(
                  (priceEntry) => priceEntry.date === tradeBuyDateStr
                );
                const tradeMaxDays =
                  newTrades[i].mode === "safe"
                    ? settings.safeMaxDays
                    : settings.aggressiveMaxDays;
                if (buyIndex !== -1) {
                  const expirationIndex = buyIndex + tradeMaxDays;
                  if (expirationIndex < closingPrices.length) {
                    const expirationDateStr = closingPrices[expirationIndex].date;
                    const autoSellIndex = expirationIndex;
                    if (autoSellIndex < closingPrices.length) {
                      const autoSellPriceEntry = closingPrices[autoSellIndex];
                      const autoSellPrice = parseFloat(autoSellPriceEntry.price);
                      newTrades[i].sellDate = autoSellPriceEntry.date;
                      newTrades[i].actualSellPrice = autoSellPrice;
                      newTrades[i].sellQuantity = newTrades[i].quantity;
                      newTrades[i].profit =
                        ((autoSellPrice - newTrades[i].actualBuyPrice) *
                        newTrades[i].quantity);
                      // 매도 날짜 조정: 매도일이 토/일/월이면 금요일 날짜로 조정
                      newTrades[i].sellDate = adjustSellDate(newTrades[i].sellDate!);
                      const sellDate = newTrades[i].sellDate!;
                      if (!dailyProfitMap[sellDate]) {
                        dailyProfitMap[sellDate] = {
                          totalProfit: 0,
                          tradeIndex: newTrades[i].tradeIndex || 0,
                        };
                      }
                      dailyProfitMap[sellDate].totalProfit += newTrades[i].profit || 0;
                      console.log(
                        `[DEBUG] 자동 매도 처리: ${newTrades[i].buyDate} 거래를 ${autoSellPriceEntry.date}의 종가 ${autoSellPrice}로 매도 처리되었으며, 해당 날짜의 dailyProfit에 profit이 누적되었습니다.`
                      );
                    } else {
                      console.warn(
                        `[WARN] ${newTrades[i].buyDate} 거래에 대한 자동 매도 처리 실패: 만료일(${expirationDateStr})에 해당하는 거래일을 찾을 수 없음`
                      );
                    }
                  } else {
                    console.warn(
                      `[WARN] ${newTrades[i].buyDate} 거래에 대한 자동 매도 처리 실패: 만료일 계산을 위해 충분한 거래일이 없음`
                    );
                  }
                } else {
                  console.warn(
                    `[WARN] ${newTrades[i].buyDate}에 해당하는 closing price entry를 찾을 수 없음`
                  );
                }
              }
            }
          }

          if ((newTrades.length + 1) % 10 === 0) {
            // 이번 거래를 포함하여 10거래 블록을 완성
            const blockTrades = newTrades.slice(-9).concat(trade);
            updatedSeed = calculateUpdatedSeed(updatedSeed, blockTrades, trade);
            trade.seedForDay = updatedSeed;
            newTrades.push(trade);
            // 블록이 완성될 때마다 DB에 시드 업데이트 기록을 누적 저장
            await checkAndUpdateSeed(updatedSeed, newTrades, trade.buyDate);
          } else {
            newTrades.push(trade);
          }
          tradeIndex++;
        }

        if (JSON.stringify(newTrades) !== JSON.stringify(trades)) {
          setTrades(newTrades);
          if (onTradesUpdate) {
            onTradesUpdate(newTrades);
          }
        }

        if (updatedSeed !== localSettings.currentInvestment) {
          const latestTradeDate = newTrades[newTrades.length - 1].buyDate;
          await checkAndUpdateSeed(updatedSeed, newTrades, latestTradeDate);
        }

        // 오늘 매도의 두 유형:
        // 1. 오늘 마지막으로 매수한 트레이드의 매도 (없으면 마지막 거래를 사용)
        const todayStr = new Date().toISOString().split("T")[0];
        let lastTradeSale = newTrades.filter(
          (trade) => trade.buyDate === todayStr && trade.targetSellPrice > 0
        ).pop();
        if (!lastTradeSale && newTrades.length > 0) {
          lastTradeSale = newTrades[newTrades.length - 1];
        }
        console.log("오늘의 마지막 매수 트레이드의 매도:", lastTradeSale);
        if (lastTradeSale) {
          onUpdateYesterdaySell(lastTradeSale);
        }

        // 2. 남은일수가 0인 트레이드의 매도
        const newZeroDayTrades = newTrades.filter(
          (trade) =>
            trade.daysUntilSell === 0 &&
            trade.quantity - (trade.sellQuantity || 0) !== 0
        );
        console.log("Zero Day Trades (before sending):", newZeroDayTrades);
        if (onZeroDayTradesUpdate) {
          onZeroDayTradesUpdate(newZeroDayTrades);
        }
      } else {
        const startDateStr = settings.startDate;
        const startDateObj = new Date(startDateStr);
        let updatedSeed = settings.currentInvestment;
        let tradeIndex = 2;

        const newTrades: Trade[] = [];
        const dailyProfitMap: {
          [date: string]: { totalProfit: number; tradeIndex: number };
        } = {};

        const finalModes = await waitForModes(modes || null);
        const sortedModes = finalModes
          ? [...finalModes].sort((a, b) => a.date.localeCompare(b.date))
          : [];

        for (let index = 0; index < closingPrices.length; index++) {
          const priceEntry = closingPrices[index];
          const rawBuyDateObj = new Date(priceEntry.date);
          if (rawBuyDateObj < startDateObj) {
            continue;
          }

          const buyDateStr = rawBuyDateObj.toISOString().split("T")[0];
          console.log(`[DEBUG]${buyDateStr} 트레이드 생성 시작`);

          const decidedMode: "safe" | "aggressive" = findModeForDateNoWait(
            buyDateStr,
            sortedModes
          );
          const mode = decidedMode;

          const currentPrice = parseFloat(priceEntry.price);
          const previousClosePrice =
            index > 0 ? parseFloat(closingPrices[index - 1].price) : currentPrice;

          const buyPercent =
            mode === "safe"
              ? settings.safeBuyPercent
              : settings.aggressiveBuyPercent;
          const targetBuyPrice = previousClosePrice * (1 + buyPercent / 100);
          let actualBuyPrice = 0;
          if (currentPrice <= targetBuyPrice) {
            actualBuyPrice = currentPrice;
          }
          console.log(
            `[DEBUG] Trade 생성: buyDate=${buyDateStr}, previousClosePrice=${previousClosePrice}, currentPrice=${currentPrice}, targetBuyPrice=${targetBuyPrice}, actualBuyPrice=${actualBuyPrice}`
          );

          const quantity = actualBuyPrice
            ? Math.floor(
                updatedSeed / (settings.seedDivision || 1) / targetBuyPrice
              )
            : 0;

          const trade: Trade = {
            tradeIndex: tradeIndex,
            buyDate: buyDateStr,
            mode,
            targetBuyPrice,
            actualBuyPrice,
            quantity,
            targetSellPrice: 0,
            seedForDay: updatedSeed,
            dailyProfit: 0,
            daysUntilSell: 0,
            withdrawalAmount: settings.withdrawalAmount,
            actualwithdrawalAmount: 0,
          };

          const sellPercent =
            mode === "safe"
              ? settings.safeSellPercent
              : settings.aggressiveSellPercent;
          trade.targetSellPrice = actualBuyPrice * (1 + sellPercent / 100);
          console.log(
            `[DEBUG] Trade Sell: mode=${mode}, sellPercent=${sellPercent}, targetSellPrice=${trade.targetSellPrice}`
          );

          for (let i = index + 1; i < closingPrices.length; i++) {
            const futurePriceEntry = closingPrices[i];
            const futurePrice = parseFloat(futurePriceEntry.price);

            if (futurePrice >= trade.targetSellPrice && trade.quantity > 0) {
              const futureSellDateObj = new Date(futurePriceEntry.date);
              const futureSellDateStr = futureSellDateObj.toISOString().split("T")[0];

              trade.sellDate = futureSellDateStr;
              trade.actualSellPrice = futurePrice;
              trade.sellQuantity = trade.quantity;
              trade.profit =
                ((futurePrice - trade.actualBuyPrice) * trade.quantity);

              // 매도 날짜 조정: 토/일/월이면 자동으로 지난 금요일 날짜로 조정
              trade.sellDate = adjustSellDate(trade.sellDate!);

              if (!dailyProfitMap[trade.sellDate]) {
                dailyProfitMap[trade.sellDate] = {
                  totalProfit: 0,
                  tradeIndex: 0,
                };
              }
              dailyProfitMap[trade.sellDate].totalProfit += trade.profit || 0;
              dailyProfitMap[trade.sellDate].tradeIndex =
                trade.tradeIndex || 0;

              console.log(
                `[DEBUG] 매도일: ${trade.sellDate}, 매도가: ${trade.actualSellPrice}, targetSellPrice: ${trade.targetSellPrice}, dailyProfitMap[${trade.sellDate}] = ${dailyProfitMap[trade.sellDate].totalProfit}`
              );
              break;
            }
          }
          trade.dailyProfit = dailyProfitMap[trade.buyDate]?.totalProfit || 0;

          const currentTradeMaxDays =
            trade.mode === "safe"
              ? settings.safeMaxDays
              : settings.aggressiveMaxDays;
          trade.daysUntilSell = currentTradeMaxDays;

          const currentTradeBuyDate = new Date(buyDateStr);
          for (let i = 0; i < newTrades.length; i++) {
            if (!newTrades[i].sellDate) {
              const previousTradeBuyDate = new Date(newTrades[i].buyDate);
              const diffDays = Math.floor(
                (currentTradeBuyDate.getTime() - previousTradeBuyDate.getTime()) /
                  (1000 * 60 * 60 * 24)
              );
              const previousTradeMaxDays =
                newTrades[i].mode === "safe"
                  ? settings.safeMaxDays
                  : settings.aggressiveMaxDays;
              newTrades[i].daysUntilSell = previousTradeMaxDays - diffDays;
              if (newTrades[i].daysUntilSell < 0) {
                newTrades[i].daysUntilSell = -1;
                const tradeBuyDateStr = newTrades[i].buyDate;
                const buyIndex = closingPrices.findIndex(
                  (priceEntry) => priceEntry.date === tradeBuyDateStr
                );
                const tradeMaxDays =
                  newTrades[i].mode === "safe"
                    ? settings.safeMaxDays
                    : settings.aggressiveMaxDays;
                if (buyIndex !== -1) {
                  const expirationIndex = buyIndex + tradeMaxDays;
                  if (expirationIndex < closingPrices.length) {
                    const expirationDateStr = closingPrices[expirationIndex].date;
                    const autoSellIndex = expirationIndex;
                    if (autoSellIndex < closingPrices.length) {
                      const autoSellPriceEntry = closingPrices[autoSellIndex];
                      const autoSellPrice = parseFloat(autoSellPriceEntry.price);
                      newTrades[i].sellDate = autoSellPriceEntry.date;
                      newTrades[i].actualSellPrice = autoSellPrice;
                      newTrades[i].sellQuantity = newTrades[i].quantity;
                      newTrades[i].profit =
                        ((autoSellPrice - newTrades[i].actualBuyPrice) *
                        newTrades[i].quantity);
                      // 매도 날짜 조정: 매도일이 토/일/월이면 금요일 날짜로 조정
                      newTrades[i].sellDate = adjustSellDate(newTrades[i].sellDate!);
                      const sellDate = newTrades[i].sellDate!;
                      if (!dailyProfitMap[sellDate]) {
                        dailyProfitMap[sellDate] = {
                          totalProfit: 0,
                          tradeIndex: newTrades[i].tradeIndex || 0,
                        };
                      }
                      dailyProfitMap[sellDate].totalProfit += newTrades[i].profit || 0;
                      console.log(
                        `[DEBUG] 자동 매도 처리: ${newTrades[i].buyDate} 거래를 ${autoSellPriceEntry.date}의 종가 ${autoSellPrice}로 매도 처리되었으며, 해당 날짜의 dailyProfit에 profit이 누적되었습니다.`
                      );
                    } else {
                      console.warn(
                        `[WARN] ${newTrades[i].buyDate} 거래에 대한 자동 매도 처리 실패: 만료일(${expirationDateStr})에 해당하는 거래일을 찾을 수 없음`
                      );
                    }
                  } else {
                    console.warn(
                      `[WARN] ${newTrades[i].buyDate} 거래에 대한 자동 매도 처리 실패: 만료일 계산을 위해 충분한 거래일이 없음`
                    );
                  }
                } else {
                  console.warn(
                    `[WARN] ${newTrades[i].buyDate}에 해당하는 closing price entry를 찾을 수 없음`
                  );
                }
              }
            }
          }

          if ((newTrades.length + 1) % 10 === 0) {
            // 이번 거래를 포함하여 10거래 블록을 완성
            const blockTrades = newTrades.slice(-9).concat(trade);
            updatedSeed = calculateUpdatedSeed(updatedSeed, blockTrades, trade);
            trade.seedForDay = updatedSeed;
            newTrades.push(trade);
            // 블록이 완성될 때마다 DB에 시드 업데이트 기록을 누적 저장
            await checkAndUpdateSeed(updatedSeed, newTrades, trade.buyDate);
          } else {
            newTrades.push(trade);
          }
          tradeIndex++;
        }

        if (JSON.stringify(newTrades) !== JSON.stringify(trades)) {
          setTrades(newTrades);
          if (onTradesUpdate) {
            onTradesUpdate(newTrades);
          }
        }

        if (updatedSeed !== localSettings.currentInvestment) {
          const latestTradeDate = newTrades[newTrades.length - 1].buyDate;
          await checkAndUpdateSeed(updatedSeed, newTrades, latestTradeDate);
        }

        // 오늘 매도의 두 유형:
        // 1. 오늘 마지막으로 매수한 트레이드의 매도 (없으면 마지막 거래를 사용)
        const todayStr = new Date().toISOString().split("T")[0];
        let lastTradeSale = newTrades.filter(
          (trade) => trade.buyDate === todayStr && trade.targetSellPrice > 0
        ).pop();
        if (!lastTradeSale && newTrades.length > 0) {
          lastTradeSale = newTrades[newTrades.length - 1];
        }
        console.log("오늘의 마지막 매수 트레이드의 매도:", lastTradeSale);
        if (lastTradeSale) {
          onUpdateYesterdaySell(lastTradeSale);
        }

        // 2. 남은일수가 0인 트레이드의 매도
        const newZeroDayTrades = newTrades.filter(
          (trade) =>
            trade.daysUntilSell === 0 &&
            trade.quantity - (trade.sellQuantity || 0) !== 0
        );
        console.log("Zero Day Trades (before sending):", newZeroDayTrades);
        if (onZeroDayTradesUpdate) {
          onZeroDayTradesUpdate(newZeroDayTrades);
        }
      }
    };

    fetchTrades();
  }, [closingPrices, settings, modes]);

  // 새로운 함수: updatedSeed를 재계산하는 로직을 캡슐화
  const calculateUpdatedSeed = (
    currentSeed: number,
    blockTrades: Trade[],
    currentTrade: Trade
  ): number => {
    const dailyProfitSum = blockTrades.reduce(
      (sum, t) => sum + (t.dailyProfit || 0),
      0
    );
    let newSeed = currentSeed;
    if (dailyProfitSum > 0) {
      newSeed += (dailyProfitSum * settings.profitCompounding) / 100;
      console.log(
        `[시드재계산+++] dailyProfitSum: ${dailyProfitSum}, newSeed: ${newSeed}`
      );
    } else if (dailyProfitSum < 0) {
      newSeed += (dailyProfitSum * settings.lossCompounding) / 100;
      console.log(
        `[시드재계산---] dailyProfitSum: ${dailyProfitSum}, newSeed: ${newSeed}`
      );
    }
    newSeed -= currentTrade.actualwithdrawalAmount || 0;
    return newSeed;
  };

  // 새로운 함수: DB에서 seed 업데이트 기록을 가져와, 계산된 seed와 비교 후 업데이트 실행
  const checkAndUpdateSeed = async (calculatedSeed: number, tradesToUpdate: Trade[], tradeDate: string) => {
    const recordDate = tradeDate; // 시드 업데이트를 발생시킨 트레이드의 날짜를 사용합니다.
    const { data: dbData, error } = await supabase
      .from("dynamicwave")
      .select("updatedSeed, settings")
      .eq("user_id", userId)
      .single();
    if (error) {
      console.error("Seed update fetch error:", error);
      return;
    }

    // updatedSeed 열은 seed 업데이트 기록을 저장하는 배열로 가정합니다.
    let updatedSeedRecords: { date: string; value: number }[] = [];
    if (dbData.updatedSeed && Array.isArray(dbData.updatedSeed)) {
      updatedSeedRecords = dbData.updatedSeed;
    }
    // 오늘 날짜에 해당하는 seed 업데이트 기록이 이미 있는지 확인합니다.
    const recordExists = updatedSeedRecords.some((record) => record.date === recordDate);

    if (!recordExists) {
      const newRecord = { date: recordDate, value: calculatedSeed };
      updatedSeedRecords.push(newRecord);
      const updatedSettings: Settings = { ...dbData.settings, currentInvestment: calculatedSeed };
      await supabase
        .from("dynamicwave")
        .upsert({
          user_id: userId,
          settings: updatedSettings,
          tradehistory: tradesToUpdate,
          updatedSeed: updatedSeedRecords,
        });
      console.log("Seed updated in DB from TradeHistory", JSON.stringify(newRecord));
      setSettings(updatedSettings); // 로컬 상태 업데이트
    } else {
      console.log("Seed update for today already executed.", updatedSeedRecords);
    }
  };

  // 새로운 함수: 매도 날짜를 조정 (토요일이면 -1일, 일요일이면 -2일, 월요일이면 -3일 하여 금요일 날짜로 조정)
  const adjustSellDate = (sellDateStr: string): string => {
    const date = new Date(sellDateStr);
    const day = date.getDay();
    if (day === 6) { // 토요일
      date.setDate(date.getDate() - 1);
    } else if (day === 0) { // 일요일
      date.setDate(date.getDate() - 2);
    } else if (day === 1) { // 월요일
      date.setDate(date.getDate() - 3);
    }
    return date.toISOString().split("T")[0];
  };

  // 새 모달 열기 함수: 해당 트레이드의 매도 정보를 모달에 세팅 후 모달 오픈
  const openSellModal = (index: number) => {
    const trade = trades[index];
    setModalTradeIndex(index);
    setModalSellDate(trade.sellDate || "");
    setModalSellPrice(trade.actualSellPrice || 0);
    setModalSellQuantity(trade.sellQuantity || 0);
    setIsModalOpen(true);
  };

  // 모달에서 확인 버튼 클릭 시 호출되는 함수 (로컬 상태 업데이트 + DB 업데이트)
  const handleModalConfirm = async () => {
    if (modalTradeIndex === null) return;
    const index = modalTradeIndex;
    const updatedTrade = { ...trades[index] };
    updatedTrade.sellDate = modalSellDate;
    updatedTrade.actualSellPrice = modalSellPrice;
    updatedTrade.sellQuantity = modalSellQuantity;

    const newTrades = [...trades];

    if (modalSellPrice !== undefined && modalSellQuantity !== undefined) {
      const tradeProfit =
        (modalSellPrice - updatedTrade.actualBuyPrice) * modalSellQuantity;
      updatedTrade.profit = tradeProfit;

      // dailyProfit은 매도된 날짜(modalSellDate)를 buyDate로 가진 거래에 누적합니다.
      const dailyTradeIndex = newTrades.findIndex(
        (t) => t.buyDate === modalSellDate
      );
      if (dailyTradeIndex !== -1) {
        const dailyTrade = { ...newTrades[dailyTradeIndex] };
        dailyTrade.dailyProfit = (dailyTrade.dailyProfit || 0) + tradeProfit;
        newTrades[dailyTradeIndex] = dailyTrade;
      } else {
        updatedTrade.dailyProfit = tradeProfit;
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
                    {trade.mode == "safe" ? (
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
                    {trade.actualBuyPrice > 0 ? (
                      trade.sellDate
                        ? new Date(trade.sellDate).toLocaleDateString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                          })
                        : "-"
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                  <td
                    className="text-center cursor-pointer"
                    onClick={() => openSellModal(index)}
                  >
                    {trade.actualBuyPrice > 0 ? (
                      trade.actualSellPrice !== undefined
                        ? trade.actualSellPrice.toFixed(2)
                        : "-"
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                  <td
                    className="text-center cursor-pointer"
                    onClick={() => openSellModal(index)}
                  >
                    {trade.actualBuyPrice > 0 ? (
                      typeof trade.sellQuantity === "number"
                        ? trade.sellQuantity
                        : "-"
                    ) : (
                      <span>-</span>
                    )}
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
                    {trade.buyDate !== null ? (
                      <span
                        className={
                          (index + 1) % 10 === 0
                            ? "text-red-500 font-bold"
                            : ""
                        }
                      >
                        {trade.actualwithdrawalAmount}
                      </span>
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

      {/* 모달 컴포넌트 추가 */}
      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div
            className="absolute inset-0 bg-black opacity-50"
            onClick={() => setIsModalOpen(false)}
          ></div>
          <div className="bg-gray-800 p-4 rounded shadow-lg z-10 w-80">
            <h3 className="text-lg font-bold mb-4 text-white">매도 정보 수정</h3>
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
    </div>
  );
};

export default TradeHistory;
