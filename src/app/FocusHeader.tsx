/** Đầu màn hình tập trung (một lượt gõ): nút đóng, tên lượt và thanh tiến độ. */
import { url } from '../lib/url';

export function FocusHeader({
  label,
  done,
  total,
  closeHref = url(''),
  closeLabel = 'Thoát',
}: {
  label: string;
  done: number;
  total: number;
  closeHref?: string;
  closeLabel?: string;
}) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="mb-5 flex items-center gap-3">
      <a href={closeHref} className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-accent-soft" aria-label={closeLabel}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </a>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold">{label}</span>
          {total > 0 && (
            <span className="text-muted tabular-nums">
              {Math.min(done, total)}/{total}
            </span>
          )}
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
