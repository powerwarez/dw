import React, { useEffect, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { FaPencilAlt, FaCheck } from "react-icons/fa";

interface PriceEntry {
  date: string;
  price: string;
}

interface Settings {
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
}

interface ModeItem {
  date: string;
  mode: "safe" | "aggressive";
}

interface Trade {
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

interface TradeHistoryProps {
  closingPrices: PriceEntry[];
  settings: Settings;
  currentSeed: number;
  onUpdateYesterdaySell: (sell: Trade) => void;
  onTradesUpdate?: (trades: Trade[]) => void;
  onZeroDayTradesUpdate?: (trades: Trade[]) => void;
  modes?: ModeItem[];
}

const TradeHistory: React.FC<TradeHistoryProps> = ({
  closingPrices,
  settings,
  currentSeed,
  onUpdateYesterdaySell,
  onTradesUpdate,
  onZeroDayTradesUpdate,
  modes,
}) => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [editPriceIndex, setEditPriceIndex] = useState<number | null>(null);
  const [editQuantityIndex, setEditQuantityIndex] = useState<number | null>(
    null
  );
  const [tempPrice, setTempPrice] = useState<number | null>(null);
  const [tempQuantity, setTempQuantity] = useState<number | null>(null);
  const [dailyProfits, setDailyProfits] = useState<{ [date: string]: number }>(
    {}
  );

  useEffect(() => {
    const fetchTrades = async () => {
      const startDateStr = settings.startDate;
      const startDateObj = new Date(startDateStr);
      const today = new Date();

      // (A) for 루프 전체에서 공유할 seed 변수
      let updatedSeed = currentSeed;
      let tradeIndex = 1;

      const newTrades: Trade[] = [];
      const dailyProfitMap: { [date: string]: number } = {};
      let tradeCount = 0;
      let dailyprofitTenDaySum = 0; // 10트레이드마다 수익 합산할 변수 예시

      // 트레이드를 생성하는 전체 루프 시작
      // 트레이드 생성 시작 //////////////////////////////
      for (let index = 0; index < closingPrices.length; index++) {
        const priceEntry = closingPrices[index];
        const rawBuyDateObj = new Date(priceEntry.date);
        if (rawBuyDateObj < startDateObj) {
          continue;
        }

        const buyDateStr = rawBuyDateObj.toISOString().split("T")[0];
        console.log(`[DEBUG]${buyDateStr} 트레이드 생성 시작`);

        let decidedMode: "safe" | "aggressive" = "safe";
        const matchedModeItem = modes?.find((m) => m.date === buyDateStr);
        if (matchedModeItem) {
          decidedMode = matchedModeItem.mode;
        }
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

        // 매도 목표가
        const sellPercent =
          mode === "safe"
            ? settings.safeSellPercent
            : settings.aggressiveSellPercent;
        trade.targetSellPrice = actualBuyPrice * (1 + sellPercent / 100);

        // 매도 시점 찾기
        let sellFound = false;
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

            // dailyProfitMap에 누적
            if (futureSellDateObj >= startDateObj) {
              if (!dailyProfitMap[futureSellDateStr]) {
                dailyProfitMap[futureSellDateStr] = 0;
              }
              dailyProfitMap[futureSellDateStr] += trade.profit || 0;
            }
            // (추가) 업데이트된 dailyProfitMap[futureSellDateStr]을 바로 확인
            console.log(
              `[DEBUG] 매도일: ${futureSellDateStr}, 매도가: ${futurePrice}, `,
              `dailyProfitMap[${futureSellDateStr}] = ${dailyProfitMap[futureSellDateStr]}`
            );

            sellFound = true;
            tradeCount++;
            break;
          }
        }
        trade.dailyProfit = dailyProfitMap[trade.buyDate] || 0;
        console.log(
          `[DEBUG]dailyProfitMap[${trade.buyDate}] = ${trade.dailyProfit}`
        );

        // ------------ daysUntilSell 계산 로직 ------------
        const buyTime = new Date(trade.buyDate).getTime();
        const todayTime = today.getTime();
        const daysPassed = Math.floor(
          (todayTime - buyTime) / (1000 * 60 * 60 * 24)
        );

        const maxDays =
          trade.mode === "safe"
            ? settings.safeMaxDays
            : settings.aggressiveMaxDays;

        // "sellDate가 없으면" 아직 안 팔린 것
        if (!trade.sellDate) {
          // 남은 날짜 = maxDays - 실제 경과 일수(음수면 0 처리)
          const remaining = maxDays - daysPassed;
          trade.daysUntilSell = Math.max(0, remaining);
        } else {
          // 매도 날짜가 있는 경우:
          if (trade.quantity - (trade.sellQuantity || 0) === 0) {
            // 전량 매도되었으면 0
            trade.daysUntilSell = 0;
          } else {
            // 부분만 매도라면 "남은 날짜 = maxDays - 경과 일수"
            const remaining = maxDays - daysPassed;
            trade.daysUntilSell = Math.max(0, remaining);
          }
        }
        // -----------------------------------------------

        // (C) 예시: 10번째 트레이드가 만들어질 때마다 dailyprofitTenDaySum 계산 후 updatedSeed 갱신
        if ((tradeIndex + 1) % 10 === 0) {
          // 일례로, 10개 구간의 누적 수익
          dailyprofitTenDaySum = Object.entries(dailyProfitMap).reduce(
            (sum, [date, val]) => (date <= trade.buyDate ? sum + val : sum),
            0
          );
          trade.actualwithdrawalAmount = trade.withdrawalAmount;

          console.log(
            "[DEBUG] 10번째 트레이드 도달",
            "buyDate:",
            buyDateStr,
            "tradeIndex:",
            tradeIndex,
            "tradeCount:",
            tradeCount,
            "기존 seedForDay(=updatedSeed):",
            updatedSeed,
            "dailyprofitTenDaySum:",
            dailyprofitTenDaySum
          );

          // (D) 꼭 곱셈(*)을 사용해야 함!
          if (dailyprofitTenDaySum > 0) {
            if (dailyprofitTenDaySum - (trade.withdrawalAmount || 0) > 0) {
              dailyprofitTenDaySum -= trade.withdrawalAmount || 0;
              trade.actualwithdrawalAmount = trade.withdrawalAmount || 0;
              updatedSeed +=
                (dailyprofitTenDaySum * settings.profitCompounding) / 100;
            } else {
              trade.actualwithdrawalAmount = dailyprofitTenDaySum;
              dailyprofitTenDaySum = 0;
            }
          } else if (dailyprofitTenDaySum < 0) {
            updatedSeed +=
              (dailyprofitTenDaySum * settings.lossCompounding) / 100;
          } else if (dailyprofitTenDaySum === 0) {
            updatedSeed += 0;
          }

          // 이번 트레이드에 반영
          trade.seedForDay = updatedSeed;

          console.log(
            "[DEBUG] 10번째 트레이드 직후 seedForDay 갱신",
            "buyDate:",
            buyDateStr,
            "tradeCount:",
            tradeCount,
            "갱신된 updatedSeed:",
            updatedSeed
          );

          // dailyProfitMap을 다시 초기화해주고 싶다면 여기서 해도 됨
          // dailyProfitMap = {};
        }
        tradeIndex++;
        newTrades.push(trade);
      }
      // 트레이드 생성 종료 //////////////////////////////

      // 현재 trades와 동일하면 setTrades/onTradesUpdate를 생략
      if (JSON.stringify(newTrades) !== JSON.stringify(trades)) {
        setTrades(newTrades);
        if (onTradesUpdate) {
          onTradesUpdate(newTrades);
        }
      }

      const yesterday = new Date();
      yesterday.setDate(new Date().getDate() - 2);

      const yesterdaySell = newTrades.find(
        (trade) =>
          trade.buyDate === yesterday.toISOString().split("T")[0] &&
          trade.targetSellPrice > 0
      );
      console.log("yesterdaySell:", yesterdaySell);
      if (yesterdaySell) {
        onUpdateYesterdaySell(yesterdaySell);
      }
    };

    fetchTrades();
  }, [
    closingPrices,
    currentSeed,
    settings,
    onUpdateYesterdaySell,
    onTradesUpdate,
    modes,
  ]);

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

  const handleInputChange = (
    index: number,
    field: string,
    value: string | number
  ) => {
    const updatedTrade = { ...trades[index], [field]: value };

    if (field === "actualSellPrice" || field === "sellQuantity") {
      const sellPrice =
        field === "actualSellPrice" ? value : updatedTrade.actualSellPrice;
      const sellQuantity =
        field === "sellQuantity" ? value : updatedTrade.sellQuantity;
      if (sellPrice && sellQuantity) {
        updatedTrade.profit =
          ((sellPrice as number) - updatedTrade.actualBuyPrice) *
          (sellQuantity as number);
        updatedTrade.dailyProfit = updatedTrade.profit;

        // sellQuantity가 변경되었을 때 daysUntilSell 업데이트
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

    setTrades((prevTrades) => {
      const newTrades = [...prevTrades];
      newTrades[index] = updatedTrade;
      return newTrades;
    });
  };

  const zeroDayTrades = trades.filter(
    (trade) =>
      trade.daysUntilSell <= 0 &&
      trade.quantity - (trade.sellQuantity || 0) !== 0
  );

  console.log("Zero Day Trades (before sending):", zeroDayTrades);

  return (
    <div className="bg-gray-800 p-4 rounded">
      <h2 className="text-xl mb-4">거래 내역</h2>
      <div className="bg-gray-700 p-4 rounded">
        {trades.length === 0 ? (
          <p>거래 내역이 없습니다.</p>
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
                    {trade.actualwithdrawalAmount !== undefined
                      ? trade.actualwithdrawalAmount
                      : "-"}
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
