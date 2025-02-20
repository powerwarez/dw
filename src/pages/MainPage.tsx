import React, { useState, useEffect } from "react";
import TradeCalculator from "../components/TradeCalculator";
import InvestmentSettings from "../components/InvestmentSettings";
import TradeHistory from "../components/TradeHistory";
import { FaBars, FaSpinner } from "react-icons/fa";
import supabase from "../utils/supabase";
import { Session } from "@supabase/supabase-js";
import { Trade, PriceEntry } from "../components/TradeHistory";

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

const defaultSettings: AppSettings = {
  initialInvestment: 10000,
  safeMaxDays: 30,
  aggressiveMaxDays: 7,
  startDate: "2025-01-01",
  safeBuyPercent: 3,
  safeSellPercent: 0.2,
  seedDivision: 7,
  profitCompounding: 80,
  lossCompounding: 30,
  aggressiveSellPercent: 15,
  withdrawalAmount: 0,
  aggressiveBuyPercent: 20,
  fee: 0.0,
};

const MainPage: React.FC<MainPageProps> = ({ session }) => {
  // 초기 props로 전달된 session을 localSession 상태로 관리하고, onAuthStateChange 리스너로 업데이트합니다.
  const [localSession, setLocalSession] = useState(session);
  const [showSidebar, setShowSidebar] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [closingPrices, setClosingPrices] = useState<PriceEntry[]>([]);
  const [currentSeed, setCurrentSeed] = useState<number>(10000);
  const [lastSeedForDay, setLastSeedForDay] = useState<number>(0);
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
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth state changed:", event, session);
      setLocalSession(session);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!localSession || !localSession.user) {
        console.error("사용자 로그인이 필요합니다. 설정 데이터를 불러올 수 없습니다.");
        return;
      }

      try {
        // 동적wave 테이블에서 로그인한 사용자의 settings 데이터를 불러옴
        const { data, error } = await supabase
          .from("dynamicwave")
          .select("settings")
          .eq("user_id", localSession.user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data || !data.settings) {
          console.log("dynamicwave 테이블에 설정 데이터가 없습니다. 기본 설정값을 삽입합니다.");
          // 설정 데이터가 없으면 기본 설정값을 삽입
          const { error: insertError } = await supabase
            .from("dynamicwave")
            .insert({ user_id: localSession.user.id, settings: defaultSettings });
          if (insertError) {
            console.error("기본 설정값 삽입 중 오류 발생:", insertError);
          }
          setSettings(defaultSettings);
          setCurrentSeed(defaultSettings.initialInvestment);
          setLastSeedForDay(defaultSettings.initialInvestment);
          setCalculation((prev) => ({
            ...prev,
            reservationPeriod:
              mode === "safe" ? defaultSettings.safeMaxDays : defaultSettings.aggressiveMaxDays,
          }));
        } else {
          setSettings(data.settings as AppSettings);
          setCurrentSeed(data.settings.initialInvestment);
          setLastSeedForDay(data.settings.initialInvestment);
          setCalculation((prev) => ({
            ...prev,
            reservationPeriod:
              mode === "safe" ? data.settings.safeMaxDays : data.settings.aggressiveMaxDays,
          }));
        }
      } catch (error) {
        console.error("dynamicwave 테이블에서 설정 값을 불러오지 못했습니다:", error);
      }
    };

    fetchSettings();
  }, [mode, localSession]);

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
        data.prices.map((p: { date: string; price: string }) => ({
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
        console.log("API response:", response);
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
    if (!localSession || !localSession.user) {
      console.error("사용자 로그인이 필요합니다.");
      return;
    }
    try {
      await supabase
        .from("dynamicwave")
        .upsert({ user_id: localSession.user.id, settings });
      console.log("설정이 성공적으로 저장되었습니다.");
    } catch (error) {
      console.error("설정 저장에 실패했습니다:", error);
    }
  };

  const handleTradesUpdate = (updatedTrades: Trade[]) => {
    if (updatedTrades.length > 0) {
      const lastTradeSeed = updatedTrades[updatedTrades.length - 1]?.seedForDay;
      if (lastTradeSeed !== undefined) {
        setLastSeedForDay(lastTradeSeed);
      }
    }
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

  const lastMode = modes.length > 0 ? modes[modes.length - 1].mode : "safe";

  if (!localSession || !localSession.user) {
    return (
      <div className="w-screen h-screen bg-gray-900 text-white flex justify-center items-center">
        <button
          onClick={() =>
            supabase.auth.signInWithOAuth({
              provider: "kakao",
              options: { redirectTo: window.location.origin },
            })
          }
          className="px-4 py-2 bg-blue-500 rounded"
        >
          카카오로 로그인
        </button>
      </div>
    );
  }

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
            currentSeed={lastSeedForDay}
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
              onUpdateYesterdaySell={handleUpdateYesterdaySell}
              onZeroDayTradesUpdate={handleZeroDayTradesUpdate}
              onTradesUpdate={handleTradesUpdate}
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
        {localSession?.user ? (
          <>
            <p>Logged in as: {localSession.user.email}</p>
            <button onClick={() => supabase.auth.signOut()}>로그아웃</button>
          </>
        ) : (
          <button
            onClick={() =>
              supabase.auth.signInWithOAuth({
                provider: "kakao",
                options: { redirectTo: window.location.origin },
              })
            }
          >
            카카오로 로그인
          </button>
        )}
      </div>
    </div>
  );
};

export default MainPage;
