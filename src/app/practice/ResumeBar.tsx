/**
 * Thanh "Tiếp tục" dùng chung cho các trang luyện: hiện lần luyện gần nhất (gõ/đọc/viết/nghe thanh/so thanh/tình huống)
 * để quay lại nhanh. Không hiện khi chưa từng luyện, người dùng đã bấm ×, hoặc đang đứng đúng trang đích.
 */
import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '../../lib/settings';
import type { LastPractice } from './resume';

const strip = (p: string) => p.replace(/\/+$/, '');

export default function ResumeBar() {
  const [item, setItem] = useState<LastPractice | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, dismissed] = await Promise.all([
          getSetting('lastPractice'),
          getSetting('lastPracticeDismissed'),
        ]);
        if (!alive) return;
        if (!p || !p.url || !p.label || dismissed) {
          setItem(null);
          return;
        }
        // không trỏ "tiếp tục" về chính trang đang đứng (so theo đường dẫn, bỏ query)
        const here = strip(window.location.pathname);
        const target = strip(new URL(p.url, window.location.origin).pathname);
        setItem(target === here ? null : p);
      } catch {
        if (alive) setItem(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!item) return null;

  const dismiss = () => {
    setItem(null);
    void setSetting('lastPracticeDismissed', true).catch(() => undefined);
  };

  return (
    <div className="mb-4 flex min-h-11 items-center gap-2 rounded-xl border border-accent bg-accent-soft px-3 py-2">
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-semibold">Tiếp tục:</span> <span className="text-muted">{item.label}</span>
      </p>
      <a
        href={item.url}
        className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-accent underline"
      >
        Mở
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Ẩn thanh tiếp tục"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-muted hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}
