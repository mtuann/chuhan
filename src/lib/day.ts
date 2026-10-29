/**
 * Ngày luyện: bắt đầu lúc 04:00 theo giờ máy (thống kê theo ngày).
 * Tính theo giờ đồng hồ địa phương, nên vẫn đúng vào ngày đổi giờ mùa hè (America/Chicago…).
 */
export const DAY_START_HOUR = 4;

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Ngày lịch của ngày học chứa `at`: trước 04:00 thì vẫn là ngày hôm trước. */
function studyDate(at: number): Date {
  const d = new Date(at);
  if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1);
  return d;
}

/** Khoá ngày học "YYYY-MM-DD" chứa thời điểm `at` (ms). */
export function studyDayKey(at: number): string {
  return ymd(studyDate(at));
}

