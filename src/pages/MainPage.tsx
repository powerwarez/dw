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
  currentInvestment: number;
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
  aggressiveSellPercent: 2.5,
  withdrawalAmount: 0,
  aggressiveBuyPercent: 5,
  fee: 0.0,
  currentInvestment: 10000,
};

const MainPage: React.FC<MainPageProps> = ({ session }) => {
  // 초기 props로 전달된 session을 localSession 상태로 관리하고, onAuthStateChange 리스너로 업데이트합니다.
  const [localSession, setLocalSession] = useState(session);
  const [showSidebar, setShowSidebar] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  // 최초 로드된 세팅을 저장 (취소 시 원래대로 복원)
  const [originalSettings, setOriginalSettings] = useState<AppSettings | null>(null);
  const [closingPrices, setClosingPrices] = useState<PriceEntry[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [mode] = useState<"safe" | "aggressive">("safe");
  const [previousClosePrice, setPreviousClosePrice] = useState<number>(0);
  const [yesterdaySell, setYesterdaySell] = useState<Trade | undefined>(
    undefined
  );
  const [zeroDayTrades, setZeroDayTrades] = useState<Trade[]>([]);
  const [modes, setModes] = useState<ApiModeItem[]>([]);
  // 저장 상태: idle, loading, success, error
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  // 모달 표시 여부
  const [showConfirmSaveModal, setShowConfirmSaveModal] = useState(false);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth state changed:", event, session);
      setLocalSession(session);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function fetchSession() {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      console.log("Fetched initial session:", currentSession);
      setLocalSession(currentSession);
    }
    fetchSession();
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!localSession || !localSession.user) {
        console.error("사용자 로그인이 필요합니다. 설정 데이터를 불러올 수 없습니다.");
        return;
      }

      try {
        // dynamicwave 테이블에서 로그인한 사용자의 settings와 tradehistory 데이터를 불러옴
        const { data, error } = await supabase
          .from("dynamicwave")
          .select("settings, tradehistory")
          .eq("user_id", localSession.user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data || !data.settings) {
          console.log("dynamicwave 테이블에 설정 데이터가 없습니다. 기본 설정값을 삽입합니다.");
          // 설정 데이터가 없으면 기본 설정값을 삽입 (tradehistory는 빈 배열로 초기화)
          const { error: insertError } = await supabase
            .from("dynamicwave")
            .insert({ user_id: localSession.user.id, settings: defaultSettings, tradehistory: [] });
          if (insertError) {
            console.error("기본 설정값 삽입 중 오류 발생:", insertError);
          }
          setSettings(defaultSettings);
          setTradeHistory([]);
          if (!originalSettings) {
            setOriginalSettings(defaultSettings);
          }
        } else {
          const loadedSettings = data.settings as AppSettings;
          setSettings(loadedSettings);
          if (!originalSettings) {
            setOriginalSettings(loadedSettings);
          }
          setTradeHistory(data.tradehistory ? (data.tradehistory as Trade[]) : []);
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

        // 응답 본문을 문자열로 가져온 후, 비어있는지 확인합니다.
        const text = await response.text();
        if (!text) {
          console.warn("응답 본문이 비어 있습니다.");
          return;
        }

        const data: ApiResponse = JSON.parse(text);
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

  // 실제 저장 로직(모달 확인 후 실행)
  const doSaveSettings = async () => {
    setSaveStatus('loading');
    try {
      const emptyTradeHistory: Trade[] = [];
      await supabase
        .from("dynamicwave")
        .upsert({ user_id: localSession!.user!.id, settings, tradehistory: emptyTradeHistory });
      setTradeHistory(emptyTradeHistory);
      console.log("설정 저장 및 tradehistory 초기화 완료");
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error("설정 저장에 실패했습니다:", error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  // 저장 버튼 클릭 시 모달을 띄움 (실제 저장은 모달 확인후 doSaveSettings에서 수행)
  const handleSaveSettings = () => {
    if (!localSession || !localSession.user) {
      console.error("사용자 로그인이 필요합니다.");
      return;
    }
    setShowConfirmSaveModal(true);
  };

  const mergeTrades = (existingTrades: Trade[], newTrades: Trade[]): Trade[] => {
    const mergedMap = new Map<number, Trade>();
    for (const trade of existingTrades) {
      mergedMap.set(trade.tradeIndex, trade);
    }
    for (const trade of newTrades) {
      mergedMap.set(trade.tradeIndex, trade);
    }
    return Array.from(mergedMap.values()).sort((a, b) => a.tradeIndex - b.tradeIndex);
  };

  const handleTradesUpdate = async (updatedTrades: Trade[]) => {
    // 병합: 기존 tradeHistory와 새롭게 계산된 내역을 합칩니다.
    setTradeHistory(prevTrades => {
      const merged = mergeTrades(prevTrades, updatedTrades);
      // DB에 항상 최신 merge 결과를 저장합니다.
      (async () => {
        try {
          await supabase
            .from("dynamicwave")
            .upsert({ user_id: localSession?.user?.id, settings, tradehistory: merged });
          console.log("Trade history 저장 성공");
        } catch (error) {
          console.error("Trade history 저장 실패:", error);
        }
      })();
      return merged;
    });
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
      <div className="w-screen h-screen bg-gray-900 text-white flex flex-col justify-center items-center">
        <p className="mb-4">로그인이 필요합니다</p>
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
    return (
      <div className="w-screen h-screen bg-gray-900 flex items-center justify-center">
        <h1 className="text-3xl font-bold text-center mb-6 bg-clip-text text-transparent bg-gradient-to-r from-pink-300 via-purple-300 to-blue-300">
          기계처럼 투자해서 부자되자 동파법
        </h1>
      </div>
    );
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

      {/* 모달창: 세팅 저장 전 확인 */}
      {showConfirmSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-96">
            <h2 className="text-xl text-white mb-4">확인</h2>
            <p className="text-white mb-6">
              기존 트레이드가 삭제되고 새로 생성됩니다. 계속하시겠습니까?
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => {
                  setShowConfirmSaveModal(false);
                  if (originalSettings) {
                    setSettings(originalSettings);
                  }
                }}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded text-white"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  setShowConfirmSaveModal(false);
                  await doSaveSettings();
                }}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded text-white"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

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
          <button
            onClick={handleSaveSettings}
            className="mt-4 w-full px-4 py-2 bg-green-500 text-white rounded"
          >
            저장
          </button>
          {saveStatus === 'loading' && (
            <p className="text-center mt-2">저장 중...</p>
          )}
          {saveStatus === 'success' && (
            <p className="text-center mt-2">저장 완료!</p>
          )}
          {saveStatus === 'error' && (
            <p className="text-center mt-2">저장 실패. 다시 시도해주세요.</p>
          )}
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
            initialInvestment={settings.initialInvestment}
            mode={mode}
            settings={settings as AppSettings}
            closingPrices={closingPrices}
            yesterdaySell={yesterdaySell}
            zeroDayTrades={zeroDayTrades}
          />
          {modes && modes.length > 0 ? (
            <TradeHistory
              closingPrices={closingPrices}
              settings={settings}
              onUpdateYesterdaySell={handleUpdateYesterdaySell}
              onZeroDayTradesUpdate={handleZeroDayTradesUpdate}
              onTradesUpdate={handleTradesUpdate}
              modes={modes}
              initialTrades={tradeHistory}
              userId={localSession?.user?.id as string}
            />
          ) : (
            <div className="text-center text-white p-4">
              <p>거래 내역을 생성 중입니다</p>
              <FaSpinner className="animate-spin w-8 h-8 mx-auto" />
            </div>
          )}
        </main>
      </div>
      <div>
        {localSession?.user ? (
          <>
            <p>Logged in as: {localSession.user.email}</p>
            <button onClick={() => supabase.auth.signOut()}>로그아웃</button>
          </>
        ) : (
          <div className="w-screen h-screen bg-gray-900 text-white flex justify-center items-center">
            <p>로그인이 필요합니다</p>
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
          </div>
        )}
      </div>
    </div>
  );
};

export default MainPage;
