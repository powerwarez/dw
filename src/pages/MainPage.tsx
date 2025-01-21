import React, { useState, useEffect } from "react";
import TradeCalculator from "../components/TradeCalculator";
import InvestmentSettings from "../components/InvestmentSettings";
import TradeHistory from "../components/TradeHistory";
import { FaBars } from "react-icons/fa";
import { calculateMode } from "../components/ModeCalculator";
import { createClient } from "@supabase/supabase-js";
import { saveSettings, loadSettings } from "../utils/supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const userId = "your-user-id"; // 사용자 식별자

interface Trade {
  date: string;
  amount: number;
  price: number;
}

const MainPage: React.FC<{ session: any }> = ({ session }) => {
  const [showSidebar, setShowSidebar] = useState(false);
  const [settings, setSettings] = useState({
    initialInvestment: 75000,
    startDate: "",
    seedDivision: 7,
    safeBuyPercent: 3,
    safeSellPercent: 0.2,
    safeMaxDays: 30,
    aggressiveBuyPercent: 5,
    aggressiveSellPercent: 2.5,
    aggressiveMaxDays: 7,
    investmentRenewal: 10,
    profitCompounding: 80,
    lossCompounding: 30,
    fee: 0.0,
    withdrawalAmount: 0,
  });

  const [trades, setTrades] = useState<Trade[]>([]);
  const [currentSeed, setCurrentSeed] = useState<number>(
    settings.initialInvestment
  );
  const [mode, setMode] = useState<"safe" | "aggressive">("safe");

  const [calculation, setCalculation] = useState({
    targetPrice: 0,
    buyAmount: 0,
    reservationPeriod:
      mode === "safe" ? settings.safeMaxDays : settings.aggressiveMaxDays,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const loadedSettings = await loadSettings(userId);
        if (loadedSettings) {
          setSettings(loadedSettings);
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };

    fetchSettings();
  }, []);

  const handleSettingsChange = (field: string, value: number | string) => {
    setSettings((prevSettings) => ({
      ...prevSettings,
      [field]: value,
    }));
  };

  const handleSaveSettings = async () => {
    try {
      await saveSettings(userId, settings);
      console.log("Settings saved successfully");
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  };

  useEffect(() => {
    calculateMode()
      .then((calculatedMode) => setMode(calculatedMode))
      .catch((error) => console.error("Error calculating mode:", error));
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from("stock_prices")
        .select("prices")
        .eq("ticker", "SOXL")
        .single();

      if (error) {
        console.error("Error fetching current price:", error);
        return;
      }

      const prices = data.prices;
      const latestPriceEntry = prices[prices.length - 1];
      const currentPrice = parseFloat(latestPriceEntry.price);
      const targetPrice =
        mode === "safe"
          ? currentPrice * (1 + settings.safeBuyPercent / 100)
          : currentPrice * (1 + settings.aggressiveBuyPercent / 100);

      const buyAmount = Math.floor(
        currentSeed / settings.seedDivision / currentPrice
      );

      setCalculation({
        targetPrice,
        buyAmount,
        reservationPeriod: settings.safeMaxDays,
      });
    };

    fetchData();
  }, [settings, currentSeed, mode]);

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
              onCalculate={() => {
                // 계산 로직 추가
              }}
              mode={mode}
              settings={settings}
            />
            <TradeHistory trades={trades} />
          </div>
        </main>
      </div>
      <button onClick={handleSaveSettings}>Save Settings</button>
      <div>
        <p>Logged in as {session.user.email}</p>
        <button onClick={() => supabase.auth.signOut()}>Logout</button>
      </div>
    </div>
  );
};

export default MainPage;
