import React, { useState, useEffect } from "react";
import TradeCalculator from "../components/TradeCalculator";
import InvestmentSettings from "../components/InvestmentSettings";
import TradeHistory from "../components/TradeHistory";
import { FaBars } from "react-icons/fa";
import { calculateModeForDate } from "../components/ModeCalculator";
import supabase from "../utils/supabase";
import { Session } from "@supabase/supabase-js";
import settings from "../data/settings.json";

interface Trade {
  buyDate: string;
  mode: string;
  buyPrice: number;
  quantity: number;
  targetSellPrice: number;
  sellDate?: string;
  sellPrice?: number;
  sellQuantity?: number;
  profit?: number;
  daysUntilSell: number;
}

interface MainPageProps {
  session: { user?: { id: string; email: string } };
}

const MainPage: React.FC<MainPageProps> = ({ session }) => {
  const [showSidebar, setShowSidebar] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [closingPrices, setClosingPrices] = useState<any[]>([]);
  const [currentSeed, setCurrentSeed] = useState<number>(10000);
  const [mode, setMode] = useState<"safe" | "aggressive">("safe");
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
  const [allTrades, setAllTrades] = useState<Trade[]>([]);

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
    if (!settings) return;

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

      setClosingPrices(data.prices);
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

  const handleSettingsChange = (field: string, value: number | string) => {
    setSettings((prevSettings: any) => ({
      ...prevSettings,
      [field]: value,
    }));
  };

  const handleSaveSettings = async () => {
    try {
      await supabase
        .from("settings")
        .upsert({ user_id: session.user?.id, ...settings });
      console.log("Settings saved successfully");
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  };

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    calculateModeForDate(today)
      .then((calculatedMode) => setMode(calculatedMode))
      .catch((error) => console.error("Error calculating mode:", error));
  }, []);

  const handleUpdateSeed = (newSeed: number) => {
    setCurrentSeed(newSeed);
  };

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
                mode === "safe" ? "text-yellow-400" : "text-red-400"
              }`}
            >
              {mode === "safe" ? "안전 모드" : "공세 모드"}
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
          <div className="w-full">
            <TradeCalculator
              calculation={calculation}
              initialInvestment={settings.initialInvestment}
              currentSeed={currentSeed}
              onCalculate={handleCalculate}
              mode={mode}
              settings={settings}
              closingPrices={closingPrices}
              yesterdaySell={yesterdaySell}
              zeroDayTrades={zeroDayTrades}
            />
            <TradeHistory
              closingPrices={closingPrices}
              settings={settings}
              currentSeed={currentSeed}
              onUpdateSeed={handleUpdateSeed}
              onUpdateYesterdaySell={handleUpdateYesterdaySell}
              onZeroDayTradesUpdate={handleZeroDayTradesUpdate}
            />
          </div>
        </main>
      </div>
      <button onClick={handleSaveSettings}>Save Settings</button>
      <div>
        {session.user ? (
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
