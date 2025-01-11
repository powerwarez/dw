import React from "react";

interface StockSelectorProps {
  selectedStock: string;
  onSelectStock: (stock: string) => void;
}

const StockSelector: React.FC<StockSelectorProps> = ({
  selectedStock,
  onSelectStock,
}) => {
  return (
    <div className="mb-8">
      <h2 className="text-xl mb-4">종목 선택</h2>
      <div className="flex gap-4">
        {["SOXL", "TQQQ"].map((stock) => (
          <button
            key={stock}
            onClick={() => onSelectStock(stock)}
            className={`px-6 py-2 rounded ${
              selectedStock === stock
                ? "bg-blue-600"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            {stock}
          </button>
        ))}
      </div>
    </div>
  );
};

export default StockSelector;
