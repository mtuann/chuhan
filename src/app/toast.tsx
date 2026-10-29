/**
 * Thông báo ngắn ở chân màn hình (ngay trên thanh tab) sau khi đánh dấu từ, kèm "Hoàn tác" và "Xem từ của tôi".
 * Gọi `notify(...)` ở bất kỳ đâu trong trang; trang có một `<ToastHost />` (vùng thông báo luôn có sẵn để trình đọc
 * màn hình đọc được nội dung mới).
 */
import { useEffect, useRef, useState } from 'react';
import { url } from '../lib/url';

export interface Toast {
  text: string;
  /** hoàn tác việc vừa làm */
  undo?: () => unknown;
  /** kèm liên kết "Xem từ của tôi" */
  link?: boolean;
}

const EVENT = 'chuhan:toast';
export const notify = (t: Toast): void => void window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: t }));

/** Thông báo tự ẩn sau bấy nhiêu ms (dừng đếm khi đang trỏ chuột, đặt tiêu điểm vào thông báo). */
const SHOW_MS = 7000;

export function ToastHost() {
  const [t, setT] = useState<(Toast & { k: number }) | null>(null);
  const timer = useRef(0);
  const hide = (ms = SHOW_MS) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setT(null), ms);
  };
  const hold = () => window.clearTimeout(timer.current);
  useEffect(() => {
    const on = (e: Event) => {
      setT({ ...(e as CustomEvent<Toast>).detail, k: Date.now() });
      hide();
    };
    window.addEventListener(EVENT, on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.clearTimeout(timer.current);
    };
  }, []);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 px-4 lg:bottom-6">
      {t && (
        <div
          key={t.k}
          className="pointer-events-auto mx-auto max-w-md rounded-2xl bg-ink px-4 py-2 text-sm text-paper shadow-lg"
          onMouseEnter={hold}
          onMouseLeave={() => hide(3000)}
          onFocus={hold}
          onBlur={() => hide(3000)}
        >
          <p className="py-1">{t.text}</p>
          {(t.undo || t.link) && (
            <p className="-mb-1 flex justify-end gap-5">
              {t.undo && (
                <button
                  type="button"
                  className="min-h-11 font-semibold underline underline-offset-4"
                  onClick={() => {
                    void Promise.resolve(t.undo!()).catch(() => undefined);
                    setT(null);
                  }}
                >
                  Hoàn tác
                </button>
              )}
              {t.link && (
                <a className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href={url('toi/')}>
                  Xem từ của tôi
                </a>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
