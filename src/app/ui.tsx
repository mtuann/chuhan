/**
 * Thành phần giao diện dùng chung cho các ứng dụng React (trang từ, trang chữ, Tra từ, danh sách cấp).
 */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { voicesForWord, type WordVoice } from '../lib/audio';
import { splitMarked, syllableToMarks } from '../lib/pinyin';
import { fmtInt, levelLabel } from '../lib/text';
import { url } from '../lib/url';

export const TONE_CLASS: Record<number, string> = { 1: 'text-t1', 2: 'text-t2', 3: 'text-t3', 4: 'text-t4', 5: 'text-t5' };

/** Tách chuỗi pinyin hiển thị thành phần có màu theo thanh (giữ nguyên dấu cách, dấu nháy). */
export function colorizePinyin(p: string): { text: string; tone?: number }[] {
  const out: { text: string; tone?: number }[] = [];
  for (const piece of p.split(/([\s'’\-·,]+)/)) {
    if (!piece) continue;
    if (/^[\s'’\-·,]+$/.test(piece)) {
      out.push({ text: piece });
      continue;
    }
    const syls = splitMarked(piece) ?? splitMarked(piece, undefined, { lenient: true });
    if (!syls) {
      out.push({ text: piece });
      continue;
    }
    for (const y of syls) out.push({ text: y.text, tone: y.tone });
  }
  return out;
}

/** Pinyin có màu thanh (màu chỉ là tín hiệu phụ, dấu thanh luôn hiện). */
export function Pinyin({ p, className = '' }: { p: string; className?: string }) {
  const parts = useMemo(() => colorizePinyin(p), [p]);
  return (
    <span lang="zh-Latn-pinyin" className={className}>
      {parts.map((x, i) => (
        <Fragment key={i}>
          {/* cho phép xuống dòng giữa hai âm tiết viết liền (pinyin dài trên màn hình hẹp) */}
          {i > 0 && x.tone && parts[i - 1].tone ? <wbr /> : null}
          {x.tone ? <span className={TONE_CLASS[x.tone]}>{x.text}</span> : <span>{x.text}</span>}
        </Fragment>
      ))}
    </span>
  );
}

/** Một âm tiết dạng số ("hao3") hiển thị có dấu và màu. */
export function NumberedSyllable({ s, className = '' }: { s: string; className?: string }) {
  const tone = Number(s.slice(-1));
  return (
    <span lang="zh-Latn-pinyin" className={`${TONE_CLASS[tone] ?? ''} ${className}`}>
      {syllableToMarks(s)}
    </span>
  );
}

export function Han({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span lang="zh-CN" className={`han ${className}`}>
      {children}
    </span>
  );
}

export function LevelBadge({ level }: { level: number | undefined }) {
  return (
    <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
      {levelLabel(level)}
    </span>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">{children}</span>;
}

/** Nhãn cho nội dung máy dịch / AI soạn chưa được duyệt. */
export function Unreviewed({ what = 'máy dịch' }: { what?: string }) {
  return (
    <span className="ml-2 inline-block rounded-full border border-dashed border-line px-2 py-0.5 align-middle text-[11px] font-normal whitespace-nowrap text-muted">
      {what} · chưa duyệt
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-card p-5 ${className}`}>{children}</section>;
}

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <p role="status" className="py-8 text-center text-sm text-muted">
      {label}
    </p>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-2xl border border-t1 p-4 text-sm">
      {children}
    </div>
  );
}

export const btn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold hover:border-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';
export const btnPrimary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50';

export function SpeakerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

/** Hướng dẫn cài giọng tiếng Trung (hiện khi máy không đọc được). */
export function NoVoiceHelp() {
  return (
    <details className="text-sm text-muted">
      <summary className="cursor-pointer">Máy chưa có giọng đọc tiếng Trung</summary>
      <p className="mt-1">
        Windows: Cài đặt → Thời gian &amp; ngôn ngữ → Giọng nói → thêm Tiếng Trung (giản thể). iPhone: Cài đặt → Trợ năng → Nội dung
        được đọc → Giọng nói → Tiếng Trung. Android: cài “Dịch vụ lời nói của Google” và tải giọng Tiếng Trung.{' '}
        <a className="underline" href={url('kiem-tra/')}>
          Kiểm tra lại
        </a>
      </p>
    </details>
  );
}

/** Các giọng đọc được một từ (bản ghi người thật trước). undefined = đang tải. */
export function useWordVoices(text: string, wordId?: string): WordVoice[] | undefined {
  const [voices, setVoices] = useState<WordVoice[] | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setVoices(undefined);
    voicesForWord(text, wordId)
      .then((v) => alive && setVoices(v))
      .catch(() => alive && setVoices([]));
    return () => {
      alive = false;
    };
  }, [text, wordId]);
  return voices;
}

/**
 * Nút nghe ở tốc độ 1,0 và 0,75. Ưu tiên bản ghi người thật (audio-cmn) nếu từ có bản ghi.
 * Máy không có giọng tiếng Trung và từ không có bản ghi thì ẩn nút, hiện hướng dẫn cài.
 */
export function SpeakButtons({ text, label, wordId }: { text: string; label?: string; wordId?: string }) {
  const voices = useWordVoices(text, wordId);
  const [busy, setBusy] = useState<number | null>(null);
  if (voices === undefined) return <div className="h-11" aria-hidden="true" />;
  if (!voices.length) return <NoVoiceHelp />;
  const play = async (rate: number) => {
    setBusy(rate);
    try {
      await voices[0].play(rate);
    } catch {
      /* lỗi phát âm thanh: bỏ qua, nút vẫn dùng lại được */
    } finally {
      setBusy(null);
    }
  };
  const what = label ?? text;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={btn} onClick={() => play(1)} aria-label={`Nghe ${what}`} aria-pressed={busy === 1}>
        <SpeakerIcon /> Nghe
      </button>
      <button type="button" className={btn} onClick={() => play(0.75)} aria-label={`Nghe chậm ${what}`} aria-pressed={busy === 0.75}>
        <SpeakerIcon /> Chậm
      </button>
      {voices[0].human && <span className="text-xs text-muted">giọng người thật</span>}
    </div>
  );
}

export function useQueryParam(name: string): string | null {
  const [v] = useState(() => new URLSearchParams(window.location.search).get(name));
  return v;
}

/**
 * Nút "Xem thêm (N đơn-vị nữa)" cho danh sách hiện dần từng trang: danh sách từ/chữ theo cấp
 * (/hoc/cap/), Sổ từ (/so-tu/), chữ viết tay (/viet/). Ẩn khi không còn gì để hiện.
 */
export function ShowMoreButton({ remaining, unit, onMore }: { remaining: number; unit: string; onMore: () => void }) {
  if (remaining <= 0) return null;
  return (
    <button type="button" className={btn} onClick={onMore}>
      Xem thêm ({fmtInt(remaining)} {unit} nữa)
    </button>
  );
}

/** Một tab trong LevelTabs. */
export interface LevelTab<K extends string | number> {
  key: K;
  /** nhãn chính, vd. levelLabel(level) */
  label: string;
  /** hậu tố đếm sau " · ", vd. số chữ của cấp */
  count?: string;
}

/**
 * Tabs chọn cấp HSK 1–7 dùng chung (Ngữ pháp, Bài đọc, Viết tay): cùng style, cùng role=tablist.
 * Mỗi nơi tự giữ điều kiện hiện và xử lý khi chọn (lưu setting, reset phân trang, đổi URL…).
 */
export function LevelTabs<K extends string | number>({
  tabs,
  active,
  onSelect,
  className = 'flex flex-wrap gap-2',
}: {
  tabs: readonly LevelTab<K>[];
  active: K | null | undefined;
  onSelect: (key: K) => void;
  /** class của khung tablist; mặc định "flex flex-wrap gap-2" */
  className?: string;
}) {
  return (
    <div className={className} role="tablist" aria-label="Cấp">
      {tabs.map((t) => (
        <button
          key={String(t.key)}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          className={`${btn} ${t.key === active ? '!border-accent !bg-accent-soft font-semibold' : ''}`}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
          {t.count !== undefined ? ` · ${t.count}` : ''}
        </button>
      ))}
    </div>
  );
}

/** Một mục trong SectionNav: liên kết tới trang con cùng hub. */
export interface SectionNavItem {
  id: string;
  label: string;
  href: string;
}

/**
 * Thanh chuyển giữa các mục con trong một hub (Đọc, Viết tay…): các pill liên kết,
 * mục đang xem tô sáng. Chỉ là phần <nav>; tiêu đề và nút quay lại do từng trang tự vẽ.
 */
export function SectionNav({ label, current, items }: { label: string; current: string; items: readonly SectionNavItem[] }) {
  return (
    <nav aria-label={label} className="mt-2 flex flex-wrap gap-2">
      {items.map((i) => (
        <a
          key={i.id}
          href={url(i.href)}
          aria-current={i.id === current ? 'page' : undefined}
          className={`inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold ${i.id === current ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent'}`}
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}
