// StockTracker.jsx
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_API_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// StockChart 컴포넌트
const StockChart = ({ data, ticker }) => {
  return (
    <div className="w-full h-[400px] bg-white p-4 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">{ticker}</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="price" stroke="#8884d8" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// 메인 컴포넌트
const StockTracker = () => {
  const [stockData, setStockData] = useState({
    SOXL: [],
    TQQQ: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isKoreaMarketOpen = () => {
    const now = new Date();
    const koreaTime = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
    );
    const hours = koreaTime.getHours();
    return hours >= 9;
  };

  const isSameDate = (date1, date2) => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  const fetchYahooData = async (ticker) => {
    const response = await fetch(
      `/api/v8/finance/chart/${ticker}?interval=1d&range=1y`
    );
    const data = await response.json();

    if (data.chart.error) {
      throw new Error("Failed to fetch stock data");
    }

    const timestamps = data.chart.result[0].timestamp;
    const closePrices = data.chart.result[0].indicators.quote[0].close;

    return timestamps.map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().split("T")[0],
      price: closePrices[index]?.toFixed(2) || null,
    }));
  };

  useEffect(() => {
    const loadStockData = async () => {
      try {
        // Supabase에서 최신 데이터 확인
        const { data: latestData, error: fetchError } = await supabase
          .from("stock_prices")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1);

        if (fetchError) throw fetchError;

        const now = new Date();
        const koreanTime = new Date(
          now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
        );
        const shouldFetchNew =
          !latestData.length ||
          !isSameDate(new Date(latestData[0].updated_at), koreanTime) ||
          (isKoreaMarketOpen() &&
            latestData[0].updated_at < koreanTime.setHours(9, 0, 0, 0));

        let stockPrices;

        if (shouldFetchNew) {
          // 새로운 데이터 fetch
          const [soxlData, tqqqData, qqqData] = await Promise.all([
            fetchYahooData("SOXL"),
            fetchYahooData("TQQQ"),
            fetchYahooData("QQQ"),
          ]);

          stockPrices = {
            SOXL: soxlData,
            TQQQ: tqqqData,
            QQQ: qqqData,
          };

          // Supabase 업데이트
          const { error: upsertError } = await supabase
            .from("stock_prices")
            .upsert([
              {
                ticker: "SOXL",
                prices: soxlData,
              },
              {
                ticker: "TQQQ",
                prices: tqqqData,
              },
              {
                ticker: "QQQ",
                prices: qqqData,
              },
            ]);

          if (upsertError) throw upsertError;
        } else {
          // Supabase의 캐시된 데이터 사용
          const { data: cachedData, error: cacheError } = await supabase
            .from("stock_prices")
            .select("*");

          if (cacheError) throw cacheError;

          stockPrices = cachedData.reduce(
            (acc, curr) => ({
              ...acc,
              [curr.ticker]: curr.prices,
            }),
            {}
          );
        }

        setStockData(stockPrices);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadStockData();
  }, []);

  if (loading) {
    return (
      <div className="text-center p-4">
        <div className="mb-2">전일 종가 데이터를 불러오고 있습니다...</div>
        <div className="text-sm text-gray-500">
          전일 종가는 아침 9시 이후에 업데이트 됩니다.
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 text-center p-4">Error: {error}</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Stock Price Tracker</h1>
      <div className="space-y-6">
        {Object.entries(stockData).map(([ticker, data]) => (
          <StockChart key={ticker} data={data} ticker={ticker} />
        ))}
      </div>
    </div>
  );
};

export default StockTracker;
