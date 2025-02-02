import React, { useState, useEffect } from "react";
import TradeCalculator from "../components/TradeCalculator";
import InvestmentSettings from "../components/InvestmentSettings";
import TradeHistory from "../components/TradeHistory";
import { FaBars, FaSpinner } from "react-icons/fa";
import supabase from "../utils/supabase";
import { Session } from "@supabase/supabase-js";
import { Trade, PriceEntry } from "../components/TradeHistory";
// import settings from "../data/settings.json";

interface ApiModeItem {
  date: string;
  mode: "safe" | "aggressive";
}

interface ApiResponse {
  id: number;
  mode: ApiModeItem[];
  inserted_at: string;
}

interface AppSettings {
  initialInvestment: number;
  safeMaxDays: number;
  aggressiveMaxDays: number;
  startDate: string;
  safeBuyPercent: number;
  safeSellPercent: number;
  seedDivision: number;
  profitCompounding: number;
  lossCompounding: number;
  aggressiveSellPercent: number;
  withdrawalAmount: number;
  aggressiveBuyPercent: number;
  [key: string]: string | number;
}

interface MainPageProps {
  session: Session | null;
}

const MainPage: React.FC<MainPageProps> = ({ session }) => {
  const [showSidebar, setShowSidebar] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [closingPrices, setClosingPrices] = useState<PriceEntry[]>([]);
  const [currentSeed, setCurrentSeed] = useState<number>(10000);
  const [mode] = useState<"safe" | "aggressive">("safe");
  const [calculation, setCalculation] = useState({
    targetPrice: 0,
    buyAmount: 0,
    reservationPeriod: 0,
  });
  const [previousClosePrice, setPreviousClosePrice] = useState<number>(0);
  const [yesterdaySell, setYesterdaySell] = useState<Trade | undefined>(
    undefined
  );
  const [zeroDayTrades, setZeroDayTrades] = useState<Trade[]>([]);
  const [modes, setModes] = useState<ApiModeItem[]>([]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch("/src/data/settings.json");
        if (!response.ok) {
          throw new Error("Failed to fetch settings.json");
        }
        const data = await response.json();
        setSettings(data);
        setCurrentSeed(data.initialInvestment);
        setCalculation((prev) => ({
          ...prev,
          reservationPeriod:
            mode === "safe" ? data.safeMaxDays : data.aggressiveMaxDays,
        }));
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };

    fetchSettings();
  }, [mode]);

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from("stock_prices")
        .select("prices")
        .eq("ticker", "SOXL")
        .single();

      if (error) {
        console.error("Error fetching SOXL prices:", error);
        return;
      }

      setClosingPrices(
        data.prices.map((p: any) => ({
          date: p.date,
          price: p.price,
        }))
      );
    };

    fetchData();
  }, [settings]);

  useEffect(() => {
    if (closingPrices.length > 0) {
      const lastClosePrice = parseFloat(
        closingPrices[closingPrices.length - 1].price
      );
      if (lastClosePrice !== previousClosePrice) {
        setPreviousClosePrice(lastClosePrice);
      }
    }
  }, [closingPrices, previousClosePrice]);

  useEffect(() => {
    const fetchModes = async () => {
      try {
        const response = await fetch(
          "https://mode-api-powerwarezs-projects.vercel.app/api"
        );
        if (!response.ok) {
          throw new Error("Failed to fetch modes data");
        }
        const data: ApiResponse = await response.json();
        console.log("API data:", data);
        setModes(data.mode);
      } catch (error) {
        console.error("Error fetching modes:", error);
      }
    };

    fetchModes();
  }, []);

  const handleSettingsChange = (field: string, value: number | string) => {
    setSettings((prevSettings) => ({
      ...(prevSettings as AppSettings),
      [field]: value,
    }));
  };

  const handleSaveSettings = async () => {
    try {
      await supabase
        .from("settings")
        .upsert({ user_id: session?.user?.id, ...settings });
      console.log("Settings saved successfully");
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  };

  // const handleUpdateSeed = (newSeed: number) => {
  //   setCurrentSeed(newSeed);
  // };

  const handleCalculate = () => {
    if (previousClosePrice !== calculation.targetPrice) {
      setCalculation((prev) => ({
        ...prev,
        targetPrice: previousClosePrice,
      }));
    }
  };

  const handleUpdateYesterdaySell = (sell: Trade) => {
    setYesterdaySell(sell);
  };

  const handleZeroDayTradesUpdate = (zTrades: Trade[]) => {
    console.log("▶ MainPage에서 받은 zeroDayTrades:", zTrades);
    setZeroDayTrades(zTrades);
  };

  // const handleTradesUpdate = (trades: Trade[]) => {
  //   setTrades(trades);
  //   console.log("▶ MainPage에서 받은 trades:", trades);
  // };

  // modes 배열에 데이터가 있다면 마지막 항목의 모드를 "이번주 모드"로 삼는다.
  const lastMode = modes.length > 0 ? modes[modes.length - 1].mode : "safe";

  if (!settings) {
    return <div>Loading...</div>;
  }

  return (
    <div className="w-screen h-screen bg-gray-900 text-white overflow-hidden">
      {/* Hamburger button */}
      <button
        className="fixed top-4 left-4 z-50 text-white"
        onClick={() => setShowSidebar(!showSidebar)}
      >
        <FaBars className="text-2xl" />
      </button>

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-gray-800 
          transform transition-transform duration-300 ease-in-out
          ${showSidebar ? "translate-x-0" : "-translate-x-full"}
          z-40
        `}
      >
        <div className="pt-16 p-4 h-full overflow-y-auto">
          <div className="bg-gray-700 p-4 rounded mb-4">
            <h3 className="text-lg mb-2">이번주 모드</h3>
            <div
              className={`text-4xl font-bold rounded ${
                lastMode === "safe" ? "text-yellow-400" : "text-red-400"
              }`}
            >
              {lastMode === "safe" ? "안전 모드" : "공세 모드"}
            </div>
          </div>
          <InvestmentSettings
            settings={settings}
            onChange={handleSettingsChange}
          />
        </div>
      </aside>

      {/* Overlay for mobile */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Main content wrapper */}
      <div
        className={`
        w-full h-full
        transition-all duration-300 ease-in-out
        ${showSidebar ? "md:pl-64" : "pl-0"}
      `}
      >
        {/* Main content */}
        <main className="w-full h-full pt-16 px-4 md:px-8 overflow-y-auto">
          <TradeCalculator
            calculation={calculation}
            initialInvestment={settings.initialInvestment}
            currentSeed={currentSeed}
            onCalculate={handleCalculate}
            mode={mode}
            settings={settings as AppSettings}
            closingPrices={closingPrices}
            yesterdaySell={yesterdaySell}
            zeroDayTrades={zeroDayTrades}
          />
          {/* modes가 로딩 완료될 때까지만 대기 */}
          {modes && modes.length > 0 ? (
            <TradeHistory
              closingPrices={closingPrices}
              settings={settings}
              currentSeed={currentSeed}
              // onUpdateSeed={handleUpdateSeed}
              onUpdateYesterdaySell={handleUpdateYesterdaySell}
              onZeroDayTradesUpdate={handleZeroDayTradesUpdate}
              // onTradesUpdate={handleTradesUpdate}
              modes={modes}
            />
          ) : (
            <div className="text-center text-white p-4">
              <p>거래 내역을 생성 중입니다</p>
              <FaSpinner className="animate-spin w-8 h-8 mx-auto" />
            </div>
          )}
        </main>
      </div>
      <button onClick={handleSaveSettings}>Save Settings</button>
      <div>
        {session?.user ? (
          <p>Logged in as: {session.user.email}</p>
        ) : (
          <p>No user logged in</p>
        )}
        <button onClick={() => supabase.auth.signOut()}>Logout</button>
      </div>
    </div>
  );
};

export default MainPage;
