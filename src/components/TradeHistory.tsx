import React from "react";

interface Trade {
  date: string;
  amount: number;
  price: number;
}

interface TradeHistoryProps {
  trades?: Trade[];
}

const TradeHistory: React.FC<TradeHistoryProps> = ({ trades = [] }) => {
  return (
    <div className="bg-gray-800 p-4 rounded">
      <h2 className="text-xl mb-4">거래 내역</h2>
      <div className="bg-gray-700 p-4 rounded">
        {trades.length === 0 ? (
          <p>거래 내역이 없습니다.</p>
        ) : (
          <ul>
            {trades.map((trade, index) => (
              <li key={index}>
                {trade.date}: {trade.amount}주 @ ${trade.price}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TradeHistory;
