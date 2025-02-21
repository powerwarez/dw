import React from "react";

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
          <input
            type="date"
            value={settings.startDate}
            onChange={(e) => onChange("startDate", e.target.value)}
            className="p-2 rounded bg-gray-700 text-white"
          />
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
