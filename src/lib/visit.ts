/**
 * Đếm lượt truy cập bằng MapMyVisitors, bản ảnh (không có mã của dịch vụ chạy trên trang, nên dịch vụ không đọc được dữ
 * liệu học trong trình duyệt): mỗi phiên trình duyệt tải ngầm một ảnh của mapmyvisitors.com sau khi trang tải xong, không
 * hiện gì, không chiếm chỗ. Dịch vụ nhận địa chỉ IP (đoán quốc gia, thành phố), loại trình duyệt và tên miền của site;
 * không đặt cookie. Thống kê xem ở VISIT_STATS.
 *
 * Không đếm khi: không phải site thật (máy dev, test), trình duyệt bật Global Privacy Control hoặc Do
 * Not Track.
 */
export const VISIT_HOST = 'mtuann.github.io';
export const VISIT_BASE = '/chuhan/';
export const VISIT_PIXEL = 'https://mapmyvisitors.com/map.png?d=BhdCibshIWxPamUtFqCC9lNLd9FdU61UxFjZHsu2yOo&cl=ffffff';
export const VISIT_STATS = 'https://mapmyvisitors.com/web/1c963';
/** sessionStorage: phiên này đã đếm. Có tiền tố vì mọi site dưới mtuann.github.io dùng chung origin. */
const SESSION_KEY = 'chuhan:da-dem-luot';

export interface VisitEnv {
  host: string;
  /** base của bản build (bản xem trước PR có base khác) */
  base: string;
  /** Global Privacy Control */
  gpc: boolean;
  /** Do Not Track */
  dnt: boolean;
  session?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

/** Có đếm lần mở trang này không (site thật, phiên này chưa đếm). */
export function shouldCount(env: VisitEnv): boolean {
  if (env.host !== VISIT_HOST || env.base !== VISIT_BASE || env.gpc || env.dnt) return false;
  try {
    return !env.session?.getItem(SESSION_KEY);
  } catch {
    // bộ nhớ phiên bị chặn: không nhớ được phiên, đếm theo từng lần mở trang
    return true;
  }
}

/** Đánh dấu phiên đã đếm: chỉ làm lúc thật sự gửi (rời trang trước khi gửi thì trang sau vẫn đếm). */
export function markCounted(session: Pick<Storage, 'setItem'> | null | undefined): void {
  try {
    session?.setItem(SESSION_KEY, '1');
  } catch {
    // bỏ qua
  }
}

const safe = <T>(f: () => T): T | null => {
  try {
    return f();
  } catch {
    return null;
  }
};

let pixel: HTMLImageElement | null = null;

/** Gửi lượt truy cập khi trình duyệt rảnh (gọi một lần mỗi trang). */
export function countVisit(): void {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  const env: VisitEnv = {
    host: location.hostname,
    base: import.meta.env.BASE_URL,
    gpc: nav.globalPrivacyControl === true,
    dnt: nav.doNotTrack === '1' || (window as { doNotTrack?: string }).doNotTrack === '1',
    session: safe(() => sessionStorage),
  };
  if (!shouldCount(env)) return;
  const send = () => {
    if (!shouldCount(env)) return;
    markCounted(env.session);
    pixel = new Image();
    pixel.referrerPolicy = 'origin';
    pixel.decoding = 'async';
    pixel.src = VISIT_PIXEL;
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(send, { timeout: 4000 });
  else setTimeout(send, 1500);
}
