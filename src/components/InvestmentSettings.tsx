import React from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

interface InvestmentSettingsProps {
  settings: {
    initialInvestment: number;
    startDate: string;
    [key: string]: number | string;
  };
  onChange: (field: string, value: number | string) => void;
}

const InvestmentSettings: React.FC<InvestmentSettingsProps> = ({
  settings,
  onChange,
}) => {
  return (
    <div className="mb-8">
      <h2 className="text-xl mb-4">투자 설정</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <label className="text-sm mb-2">초기 투자금</label>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            value={settings.initialInvestment || 100000000}
            onChange={(e) =>
              onChange("initialInvestment", parseFloat(e.target.value))
            }
            className="p-2 rounded bg-gray-700 text-white"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm mb-2">투자 시작일</label>
          <div className="flex flex-col">
            <DatePicker
              selected={(() => {
                try {
                  // 날짜 형식 검증
                  if (!settings.startDate) return null;

                  // ISO 형식인지 확인 (YYYY-MM-DD)
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(settings.startDate)) {
                    console.warn(
                      `유효하지 않은 날짜 형식: ${settings.startDate}, 기본값으로 대체합니다.`
                    );
                    return new Date();
                  }

                  const date = new Date(settings.startDate);
                  // 유효한 날짜인지 확인
                  if (isNaN(date.getTime())) {
                    console.warn(
                      `유효하지 않은 날짜: ${settings.startDate}, 기본값으로 대체합니다.`
                    );
                    return new Date();
                  }

                  return date;
                } catch (error) {
                  console.error("날짜 파싱 오류:", error);
                  return new Date(); // 오류 발생 시 현재 날짜 사용
                }
              })()}
              onChange={(date) => {
                try {
                  if (date) {
                    // 날짜를 ISO 형식(YYYY-MM-DD)으로 변환
                    const formattedDate = date.toISOString().split("T")[0];
                    onChange("startDate", formattedDate);
                  }
                } catch (error) {
                  console.error("날짜 변환 오류:", error);
                  // 오류 발생 시 현재 날짜 사용
                  const today = new Date();
                  const formattedToday = today.toISOString().split("T")[0];
                  onChange("startDate", formattedToday);
                }
              }}
              dateFormat="yy.MM.dd"
              className="p-2 rounded bg-gray-700 text-white w-full"
            />
          </div>
        </div>
        {Object.entries(settings).map(
          ([key, value]) =>
            key !== "initialInvestment" &&
            key !== "startDate" && (
              <div key={key} className="flex flex-col">
                <label className="text-sm mb-2">{getLabel(key)}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={value as number}
                  onChange={(e) => onChange(key, parseFloat(e.target.value))}
                  className="p-2 rounded bg-gray-700 text-white"
                />
              </div>
            )
        )}
      </div>
    </div>
  );
};

const getLabel = (key: string) => {
  const labels: { [key: string]: string } = {
    seedDivision: "시드 분할",
    safeBuyPercent: "안전 매수 %",
    safeSellPercent: "안전 매도 %",
    safeMaxDays: "안전 최대 보유일",
    aggressiveBuyPercent: "공세 매수 %",
    aggressiveSellPercent: "공세 매도 %",
    aggressiveMaxDays: "공세 최대 보유일",
    investmentRenewal: "투자금 갱신",
    profitCompounding: "이익 복리 %",
    lossCompounding: "손실 복리 %",
    fee: "수수료",
    withdrawalAmount: "인출 금액",
    currentInvestment: "현재 투자금",
  };
  return labels[key] || key;
};

export default InvestmentSettings;
