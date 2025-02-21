import React, { useEffect, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { FaPencilAlt, FaCheck, FaSpinner } from "react-icons/fa";
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
}) => {
  const [isModeLoading, setIsModeLoading] = useState(false);
  const [trades, setTrades] = useState<Trade[]>(initialTrades);
  const [editPriceIndex, setEditPriceIndex] = useState<number | null>(null);
  const [editQuantityIndex, setEditQuantityIndex] = useState<number | null>(
    null
  );
  const [tempPrice, setTempPrice] = useState<number | null>(null);
  const [tempQuantity, setTempQuantity] = useState<number | null>(null);
  const [cachedModes, setCachedModes] = useState<ModeItem[] | null>(null);

  const [editWithdrawalIndex, setEditWithdrawalIndex] = useState<number | null>(
    null
  );
  const [tempWithdrawal, setTempWithdrawal] = useState<number | null>(null);

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
        let dailyprofitTenDaySum = 0;

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
              const futureSellDateStr = futureSellDateObj
                .toISOString()
                .split("T")[0];

              trade.sellDate = futureSellDateStr;
              trade.actualSellPrice = futurePrice;
              trade.sellQuantity = trade.quantity;
              trade.profit =
                (trade.actualSellPrice - trade.actualBuyPrice) * trade.quantity;

              if (!dailyProfitMap[futureSellDateStr]) {
                dailyProfitMap[futureSellDateStr] = {
                  totalProfit: 0,
                  tradeIndex: 0,
                };
              }
              dailyProfitMap[futureSellDateStr].totalProfit += trade.profit || 0;
              dailyProfitMap[futureSellDateStr].tradeIndex =
                trade.tradeIndex || 0;

              console.log(
                `[DEBUG] 매도일: ${futureSellDateStr}, 매도가: ${futurePrice}, targetSellPrice: ${trade.targetSellPrice}, dailyProfitMap[${futureSellDateStr}] = ${dailyProfitMap[futureSellDateStr].totalProfit}`
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
                        (autoSellPrice - newTrades[i].actualBuyPrice) *
                        newTrades[i].quantity;
                      const sellDate = newTrades[i].sellDate!;
                      if (!dailyProfitMap[sellDate]) {
                        dailyProfitMap[sellDate] = {
                          totalProfit: 0,
                          tradeIndex: newTrades[i].tradeIndex || 0,
                        };
                      }
                      dailyProfitMap[sellDate].totalProfit +=
                        newTrades[i].profit || 0;
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

          if (newTrades.length % 10 === 0) {
            const blockTrades = newTrades.slice(-10);
            dailyprofitTenDaySum = blockTrades.reduce(
              (sum, t) => sum + (t.dailyProfit || 0),
              0
            );

            if (dailyprofitTenDaySum > 0) {
              updatedSeed +=
                (dailyprofitTenDaySum * settings.profitCompounding) / 100;
              console.log(
                `[시드재계산+++] dailyprofitTenDaySum: ${dailyprofitTenDaySum}, updatedSeed: ${updatedSeed}`
              );
            } else if (dailyprofitTenDaySum < 0) {
              updatedSeed +=
                (dailyprofitTenDaySum * settings.lossCompounding) / 100;
              console.log(
                `[시드재계산---] dailyprofitTenDaySum: ${dailyprofitTenDaySum}, updatedSeed: ${updatedSeed}`
              );
            } else if (dailyprofitTenDaySum === 0) {
              updatedSeed += 0;
            }
            updatedSeed -= trade.actualwithdrawalAmount || 0;

            trade.seedForDay = updatedSeed;
          }

          tradeIndex++;
          newTrades.push(trade);
        }

        if (JSON.stringify(newTrades) !== JSON.stringify(trades)) {
          setTrades(newTrades);
          if (onTradesUpdate) {
            onTradesUpdate(newTrades);
          }
        }

        if (updatedSeed !== settings.currentInvestment) {
          const todayStr = new Date().toISOString().split("T")[0];
          // 기존 seedUpdates가 없으면 빈 객체 초기화
          const seedUpdates = settings.seedUpdates ? { ...settings.seedUpdates } : {};
          if (seedUpdates[todayStr] === undefined) {
            // 오늘 날짜 기록이 없으므로 업데이트 실행 및 기록 추가
            seedUpdates[todayStr] = updatedSeed;
            const updatedSettings: Settings = { ...settings, currentInvestment: updatedSeed, seedUpdates };
            supabase
              .from("dynamicwave")
              .upsert({ user_id: userId, settings: updatedSettings, tradehistory: newTrades })
              .then(() => console.log("Seed updated in DB from TradeHistory"));
          } else {
            console.log("Seed update for today already executed. Skipping update.");
          }
        }

        const yesterdayDateSale = new Date();
        yesterdayDateSale.setDate(new Date().getDate() - 1);
        const yesterdayStrSale = yesterdayDateSale.toISOString().split("T")[0];

        const yesterdaySellUpdated = newTrades.find(
          (trade) =>
            trade.buyDate === yesterdayStrSale &&
            trade.targetSellPrice > 0
        );
        console.log("yesterdaySell:", yesterdaySellUpdated);
        if (yesterdaySellUpdated) {
          onUpdateYesterdaySell(yesterdaySellUpdated);
        }

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
        let dailyprofitTenDaySum = 0;

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
              const futureSellDateStr = futureSellDateObj
                .toISOString()
                .split("T")[0];

              trade.sellDate = futureSellDateStr;
              trade.actualSellPrice = futurePrice;
              trade.sellQuantity = trade.quantity;
              trade.profit =
                (trade.actualSellPrice - trade.actualBuyPrice) * trade.quantity;

              if (!dailyProfitMap[futureSellDateStr]) {
                dailyProfitMap[futureSellDateStr] = {
                  totalProfit: 0,
                  tradeIndex: 0,
                };
              }
              dailyProfitMap[futureSellDateStr].totalProfit += trade.profit || 0;
              dailyProfitMap[futureSellDateStr].tradeIndex =
                trade.tradeIndex || 0;

              console.log(
                `[DEBUG] 매도일: ${futureSellDateStr}, 매도가: ${futurePrice}, targetSellPrice: ${trade.targetSellPrice}, dailyProfitMap[${futureSellDateStr}] = ${dailyProfitMap[futureSellDateStr].totalProfit}`
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
                        (autoSellPrice - newTrades[i].actualBuyPrice) *
                        newTrades[i].quantity;
                      const sellDate = newTrades[i].sellDate!;
                      if (!dailyProfitMap[sellDate]) {
                        dailyProfitMap[sellDate] = {
                          totalProfit: 0,
                          tradeIndex: newTrades[i].tradeIndex || 0,
                        };
                      }
                      dailyProfitMap[sellDate].totalProfit +=
                        newTrades[i].profit || 0;
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

          if (newTrades.length % 10 === 0) {
            const blockTrades = newTrades.slice(-10);
            dailyprofitTenDaySum = blockTrades.reduce(
              (sum, t) => sum + (t.dailyProfit || 0),
              0
            );

            if (dailyprofitTenDaySum > 0) {
              updatedSeed +=
                (dailyprofitTenDaySum * settings.profitCompounding) / 100;
              console.log(
                `[시드재계산+++] dailyprofitTenDaySum: ${dailyprofitTenDaySum}, updatedSeed: ${updatedSeed}`
              );
            } else if (dailyprofitTenDaySum < 0) {
              updatedSeed +=
                (dailyprofitTenDaySum * settings.lossCompounding) / 100;
              console.log(
                `[시드재계산---] dailyprofitTenDaySum: ${dailyprofitTenDaySum}, updatedSeed: ${updatedSeed}`
              );
            } else if (dailyprofitTenDaySum === 0) {
              updatedSeed += 0;
            }
            updatedSeed -= trade.actualwithdrawalAmount || 0;

            trade.seedForDay = updatedSeed;
          }

          tradeIndex++;
          newTrades.push(trade);
        }

        if (JSON.stringify(newTrades) !== JSON.stringify(trades)) {
          setTrades(newTrades);
          if (onTradesUpdate) {
            onTradesUpdate(newTrades);
          }
        }

        if (updatedSeed !== settings.currentInvestment) {
          const todayStr = new Date().toISOString().split("T")[0];
          // 기존 seedUpdates가 없으면 빈 객체 초기화
          const seedUpdates = settings.seedUpdates ? { ...settings.seedUpdates } : {};
          if (seedUpdates[todayStr] === undefined) {
            // 오늘 날짜 기록이 없으므로 업데이트 실행 및 기록 추가
            seedUpdates[todayStr] = updatedSeed;
            const updatedSettings: Settings = { ...settings, currentInvestment: updatedSeed, seedUpdates };
            supabase
              .from("dynamicwave")
              .upsert({ user_id: userId, settings: updatedSettings, tradehistory: newTrades })
              .then(() => console.log("Seed updated in DB from TradeHistory"));
          } else {
            console.log("Seed update for today already executed. Skipping update.");
          }
        }

        const yesterdayDateSale = new Date();
        yesterdayDateSale.setDate(new Date().getDate() - 1);
        const yesterdayStrSale = yesterdayDateSale.toISOString().split("T")[0];

        const yesterdaySellUpdated = newTrades.find(
          (trade) =>
            trade.buyDate === yesterdayStrSale &&
            trade.targetSellPrice > 0
        );
        console.log("yesterdaySell:", yesterdaySellUpdated);
        if (yesterdaySellUpdated) {
          onUpdateYesterdaySell(yesterdaySellUpdated);
        }

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

  const handleEditPriceClick = (index: number) => {
    setEditPriceIndex(index);
    setTempPrice(trades[index].actualSellPrice || 0);
  };

  const handleEditQuantityClick = (index: number) => {
    setEditQuantityIndex(index);
    setTempQuantity(trades[index].sellQuantity || 0);
  };

  const handleCheckPriceClick = (index: number) => {
    if (tempPrice !== null) {
      handleInputChange(index, "actualSellPrice", tempPrice);
    }
    setEditPriceIndex(null);
  };

  const handleCheckQuantityClick = (index: number) => {
    if (tempQuantity !== null) {
      handleInputChange(index, "sellQuantity", tempQuantity);
    }
    setEditQuantityIndex(null);
  };

  const handleEditWithdrawalClick = (index: number) => {
    setEditWithdrawalIndex(index);
    setTempWithdrawal(trades[index].actualwithdrawalAmount || 0);
  };

  const handleCheckWithdrawalClick = (index: number) => {
    if (tempWithdrawal !== null) {
      handleInputChange(index, "actualwithdrawalAmount", tempWithdrawal);
    }
    setEditWithdrawalIndex(null);
  };

  const handleInputChange = (
    index: number,
    field: string,
    value: string | number
  ) => {
    const updatedTrade = { ...trades[index], [field]: value };

    if (field === "actualSellPrice" || field === "sellQuantity") {
      const sellPrice = Number(
        field === "actualSellPrice" ? value : updatedTrade.actualSellPrice
      );
      const sellQuantity = Number(
        field === "sellQuantity" ? value : updatedTrade.sellQuantity
      );

      if (sellPrice && sellQuantity) {
        updatedTrade.profit =
          ((sellPrice as number) - updatedTrade.actualBuyPrice) *
          (sellQuantity as number);
        updatedTrade.dailyProfit = updatedTrade.profit;

        if (field === "sellQuantity") {
          updatedTrade.daysUntilSell =
            updatedTrade.quantity - sellQuantity !== 0
              ? (updatedTrade.mode === "safe"
                  ? settings.safeMaxDays
                  : settings.aggressiveMaxDays) -
                Math.floor(
                  (new Date().getTime() -
                    new Date(updatedTrade.buyDate).getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              : 0;
        }
      }
    }

    if (field === "actualwithdrawalAmount") {
      updatedTrade.actualwithdrawalAmount = Number(value);
    }

    setTrades((prevTrades) => {
      const newTrades = [...prevTrades];
      newTrades[index] = updatedTrade;
      return newTrades;
    });
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
                  <td className="text-center">
                    {trade.actualBuyPrice > 0 ? (
                      <DatePicker
                        selected={
                          trade.sellDate ? new Date(trade.sellDate) : null
                        }
                        onChange={(date) =>
                          handleInputChange(
                            index,
                            "sellDate",
                            date
                              ? date.toLocaleDateString("ko-KR", {
                                  month: "2-digit",
                                  day: "2-digit",
                                })
                              : ""
                          )
                        }
                        dateFormat="MM-dd"
                        className="bg-gray-600 p-1 rounded w-20"
                      />
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                  <td className="text-center">
                    {trade.actualBuyPrice > 0 ? (
                      editPriceIndex === index ? (
                        <input
                          type="number"
                          value={tempPrice || ""}
                          onChange={(e) =>
                            setTempPrice(parseFloat(e.target.value))
                          }
                          onWheel={(e) => e.preventDefault()}
                          className="bg-gray-600 p-1 rounded"
                        />
                      ) : (
                        <span>{trade.actualSellPrice?.toFixed(2)}</span>
                      )
                    ) : (
                      <span>-</span>
                    )}
                    {trade.actualBuyPrice > 0 && (
                      <button
                        onClick={() =>
                          editPriceIndex === index
                            ? handleCheckPriceClick(index)
                            : handleEditPriceClick(index)
                        }
                      >
                        {editPriceIndex === index ? (
                          <FaCheck />
                        ) : (
                          <FaPencilAlt />
                        )}
                      </button>
                    )}
                  </td>
                  <td className="text-center">
                    {trade.actualBuyPrice > 0 ? (
                      editQuantityIndex === index ? (
                        <input
                          type="number"
                          value={tempQuantity || ""}
                          onChange={(e) =>
                            setTempQuantity(parseFloat(e.target.value))
                          }
                          onWheel={(e) => e.preventDefault()}
                          className="bg-gray-600 p-1 rounded"
                        />
                      ) : (
                        <span>{trade.sellQuantity}</span>
                      )
                    ) : (
                      <span>-</span>
                    )}
                    {trade.actualBuyPrice > 0 && (
                      <button
                        onClick={() =>
                          editQuantityIndex === index
                            ? handleCheckQuantityClick(index)
                            : handleEditQuantityClick(index)
                        }
                      >
                        {editQuantityIndex === index ? (
                          <FaCheck />
                        ) : (
                          <FaPencilAlt />
                        )}
                      </button>
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
                      editWithdrawalIndex === index ? (
                        <input
                          type="number"
                          value={tempWithdrawal || ""}
                          onChange={(e) =>
                            setTempWithdrawal(parseFloat(e.target.value))
                          }
                          onWheel={(e) => e.preventDefault()}
                          className="bg-gray-600 p-1 rounded"
                        />
                      ) : (
                        <span
                          className={
                            (index + 1) % 10 === 0
                              ? "text-red-500 font-bold"
                              : ""
                          }
                        >
                          {trade.actualwithdrawalAmount}
                        </span>
                      )
                    ) : (
                      <span>-</span>
                    )}
                    {trade.actualBuyPrice > 0 && (
                      <button
                        onClick={() =>
                          editWithdrawalIndex === index
                            ? handleCheckWithdrawalClick(index)
                            : handleEditWithdrawalClick(index)
                        }
                      >
                        {editWithdrawalIndex === index ? (
                          <FaCheck />
                        ) : (
                          <FaPencilAlt />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default TradeHistory;
