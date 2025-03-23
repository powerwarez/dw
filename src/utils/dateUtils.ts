// dateUtils.ts
// 주식 거래일 계산을 위한 유틸리티 함수

/**
 * 특정 연도의 미국 공휴일 목록을 반환합니다.
 */
export const getUSHolidays = (year: number): Date[] => {
  const holidays = [];

  // 새해
  holidays.push(new Date(year, 0, 1));

  // 마틴 루터 킹 주니어의 날 (1월 셋째 월요일)
  holidays.push(getNthDayOfWeek(year, 0, 1, 3));

  // 대통령의 날 (2월 셋째 월요일)
  holidays.push(getNthDayOfWeek(year, 1, 1, 3));

  // 메모리얼 데이 (5월 마지막 월요일)
  holidays.push(getLastDayOfWeek(year, 4, 1));

  // 독립기념일
  holidays.push(new Date(year, 6, 4));

  // 노동절 (9월 첫째 월요일)
  holidays.push(getNthDayOfWeek(year, 8, 1, 1));

  // 추수감사절 (11월 넷째 목요일)
  holidays.push(getNthDayOfWeek(year, 10, 4, 4));

  // 크리스마스
  holidays.push(new Date(year, 11, 25));

  // 주말에 해당하는 공휴일 조정
  return holidays.map((holiday) => {
    const day = holiday.getDay();
    if (day === 6) {
      // 토요일이면 금요일로 조정
      holiday.setDate(holiday.getDate() - 1);
    } else if (day === 0) {
      // 일요일이면 월요일로 조정
      holiday.setDate(holiday.getDate() + 1);
    }
    return holiday;
  });
};

/**
 * N번째 특정 요일의 날짜를 반환합니다.
 */
export const getNthDayOfWeek = (
  year: number,
  month: number,
  dayOfWeek: number,
  n: number
): Date => {
  const date = new Date(year, month, 1);
  const add = (dayOfWeek - date.getDay() + 7) % 7;
  date.setDate(1 + add + (n - 1) * 7);
  return date;
};

/**
 * 특정 월의 마지막 특정 요일의 날짜를 반환합니다.
 */
export const getLastDayOfWeek = (
  year: number,
  month: number,
  dayOfWeek: number
): Date => {
  const date = new Date(year, month + 1, 0);
  const sub = (date.getDay() - dayOfWeek + 7) % 7;
  date.setDate(date.getDate() - sub);
  return date;
};

/**
 * 주어진 날짜가 미국 공휴일인지 확인합니다.
 */
export const isHoliday = (date: Date): boolean => {
  const year = date.getFullYear();
  const holidays = getUSHolidays(year);
  return holidays.some(
    (holiday) =>
      holiday.getFullYear() === date.getFullYear() &&
      holiday.getMonth() === date.getMonth() &&
      holiday.getDate() === date.getDate()
  );
};

/**
 * 주어진 날짜가 주말(토요일 또는 일요일)인지 확인합니다.
 */
export const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6; // 0: 일요일, 6: 토요일
};

/**
 * 주어진 날짜가 거래일(영업일)인지 확인합니다.
 * 주말이나 공휴일이 아닌 경우 거래일로 간주합니다.
 */
export const isTradingDay = (date: Date): boolean => {
  return !isWeekend(date) && !isHoliday(date);
};

/**
 * 두 날짜 사이의 거래일 수를 계산합니다.
 * 시작일과 종료일을 포함하지 않습니다.
 */
export const getTradingDaysBetween = (
  startDate: Date,
  endDate: Date
): number => {
  let count = 0;
  const currentDate = new Date(startDate);
  currentDate.setDate(currentDate.getDate() + 1); // 시작일 다음날부터 계산

  while (currentDate < endDate) {
    if (isTradingDay(currentDate)) {
      count++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return count;
};

/**
 * 특정 날짜로부터 n 거래일 후의 날짜를 계산합니다.
 */
export const addTradingDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  let addedDays = 0;

  while (addedDays < days) {
    result.setDate(result.getDate() + 1);
    if (isTradingDay(result)) {
      addedDays++;
    }
  }

  return result;
};

/**
 * Date 객체를 'YYYY-MM-DD' 형식의 문자열로 변환합니다.
 */
export const formatDateToString = (date: Date): string => {
  return date.toISOString().split("T")[0];
};

/**
 * 'YYYY-MM-DD' 형식의 문자열을 Date 객체로 변환합니다.
 */
export const parseStringToDate = (dateString: string): Date => {
  return new Date(dateString);
};
