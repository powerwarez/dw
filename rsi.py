import yfinance as yf
import pandas as pd
from wilder_rsi import calculate_rsi
from write_mode import add_data_to_json
import json

def this_week_mode(qqq_rsi_late, qqq_rsi_late_late):

    qqq_up = True if qqq_rsi_late_late < qqq_rsi_late else False
    # 안전모드로 전환:

    # 	•	이전 RSI가 65 이상에서 하락 전환 했을 때
    # 	•	이전 RSI가 40~50 사이에서 하락 전환 했을 때
    # 	•	이전 RSI가 50 이상에서 50 미만으로 하락 돌파 했을 때

    if qqq_rsi_late_late > 65 and qqq_up == False:
        return "안전모드"
    if qqq_rsi_late_late > 40 and qqq_rsi_late_late < 50 and qqq_up == False :
        return "안전모드"
    if qqq_rsi_late_late >= 50 and qqq_rsi_late < 50:
        return "안전모드"

    # 공세모드로 전환:

    # 	•	이전 RSI가 50 이하에서 50 초과로 상승 돌파 했을 때
    # 	•	이전 RSI가 50~60 사이에서 상승 전환 했을 때
    # 	•	이전 RSI가 35 이하에서 상승 전환 했을 때

    if qqq_rsi_late_late <= 50 and qqq_rsi_late > 50:
        return "공세모드"
    if qqq_rsi_late_late >50 and qqq_rsi_late_late < 60 and qqq_up == True:
        return "공세모드"
    if qqq_rsi_late_late <=35 and qqq_up == True:
        return "공세모드"
    
    return "이전모드"

# QQQ의 데이터 가져오기
qqq_data = yf.Ticker("QQQ")

# 지난 1개월 간의 종가 데이터 가져오기
recent_close_prices = qqq_data.history(period="1y")

# 인덱스를 datetime 형식으로 변환
recent_close_prices.index = pd.to_datetime(recent_close_prices.index)

# 금요일의 데이터만 필터링 (요일이 4인 데이터)
friday_data = recent_close_prices[recent_close_prices.index.weekday == 4]

# 모든 금요일의 RSI 값을 계산
rsi_values = calculate_rsi(friday_data)

# 각 금요일의 모드를 계산하고 저장
for i in range(1, len(rsi_values)):
    qqq_rsi_late_late = rsi_values.iloc[i - 1]
    qqq_rsi_late = rsi_values.iloc[i]
    last_date = rsi_values.index[i]

    mode = this_week_mode(qqq_rsi_late, qqq_rsi_late_late)

    if mode == "이전모드":
        # JSON 파일에서 딕셔너리 읽기
        with open("mode.json", "r", encoding="utf-8") as file:
            loaded_data = json.load(file)
            if loaded_data:
                last_mode = loaded_data[-1]["mode"]
                mode = last_mode

    add_data_to_json(last_date, mode)
