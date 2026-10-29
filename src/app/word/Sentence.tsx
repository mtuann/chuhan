/**
 * Câu dạng token (câu gặp từ khi đọc): chữ Hán (chạm vào từ để tra), pinyin trên từng từ, nút nghe bằng giọng máy.
 * Kèm bảng tra nhanh một từ (WordSheet).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PackKey, Token, WordRec } from '../../schema/data';
import { loadWord } from '../../lib/data';
import { groupTokens, sentenceText } from '../../lib/sentence';
import { hvString, wordGloss } from '../../lib/text';
import { url } from '../../lib/url';
import { Han, Pinyin, SpeakButtons, SpeakerIcon, TONE_CLASS, btn, colorizePinyin, useWordVoices } from '../ui';

/** Pinyin nhỏ trên một từ, có màu thanh. */
function TokenPinyin({ p }: { p: string }) {
  return (
    <span lang="zh-Latn-pinyin" className="block text-center text-[0.7rem] leading-tight whitespace-nowrap">
      {colorizePinyin(p).map((x, i) => (
        <span key={i} className={x.tone ? TONE_CLASS[x.tone] : undefined}>
          {x.text}
        </span>
      ))}
    </span>
  );
}

export interface TokenProps {
  /** hiện pinyin trên từng từ */
  pinyin?: boolean;
  /** từ đã biết (từ chưa biết gạch chân chấm) */
  known?: (wordId: string) => boolean;
  /** chạm vào một từ */
  onWord?: (wordId: string) => void;
  /** token bị che (bài điền từ) */
  blank?: number;
  blankContent?: ReactNode;
}

/** Dòng chữ Hán của câu, mỗi từ là một cột (pinyin trên, chữ dưới), xuống dòng giữa các từ. */
export function SentenceTokens({ tk, pinyin = false, known, onWord, blank, blankContent, className = '' }: TokenProps & { tk: Token[]; className?: string }) {
  const one = (i: number) => {
    const t = tk[i];
    if (i === blank)
      return (
        <span key={i} className="inline-flex flex-col items-center">
          {pinyin && <span className="block text-[0.7rem] leading-tight">&nbsp;</span>}
          {blankContent ?? <span className="han inline-block min-w-12 border-b-2 border-accent text-center">&nbsp;</span>}
        </span>
      );
    if (t.length === 1)
      return (
        <span key={i} className="han">
          {t[0]}
        </span>
      );
    const w = t.length === 3 ? t[2] : undefined;
    const unknown = !!(w && known && !known(w));
    const body = (
      <>
        {pinyin && <TokenPinyin p={t[1]} />}
        <span className={`han ${unknown ? 'underline decoration-dotted decoration-2 underline-offset-4' : ''}`}>{t[0]}</span>
      </>
    );
    return w && onWord ? (
      <button
        key={i}
        type="button"
        className="inline-flex flex-col items-center rounded-md px-0.5 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
        onClick={() => onWord(w)}
        aria-label={`${t[0]} ${t[1]}${unknown ? ', chưa biết' : ''}: tra từ`}
      >
        {body}
      </button>
    ) : (
      <span key={i} className="inline-flex flex-col items-center px-0.5">
        {body}
      </span>
    );
  };
  return (
    <p lang="zh-CN" className={`flex flex-wrap items-end gap-x-0.5 gap-y-1 ${className}`}>
      {groupTokens(tk).map((g) => (
        <span key={g[0]} className="inline-flex items-end">
          {g.map(one)}
        </span>
      ))}
    </p>
  );
}

/** Nút nghe một câu bằng giọng máy (ẩn nếu máy không có giọng tiếng Trung). */
export function SpeakSentence({ text, label = 'Nghe câu', slow = false }: { text: string; label?: string; slow?: boolean }) {
  const voices = useWordVoices(text);
  const [busy, setBusy] = useState(false);
  if (!voices?.length) return null;
  const play = async (rate: number) => {
    setBusy(true);
    try {
      await voices[0].play(rate);
    } catch {
      /* bỏ qua lỗi phát */
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex gap-2">
      <button type="button" className={`${btn} !px-3`} onClick={() => play(1)} aria-label={label} aria-pressed={busy}>
        <SpeakerIcon />
      </button>
      {slow && (
        <button type="button" className={`${btn} !px-3 text-xs`} onClick={() => play(0.7)} aria-label={`${label} chậm`}>
          Chậm
        </button>
      )}
    </span>
  );
}

/** Một câu dạng token: chữ, pinyin trên từng từ, nút nghe. */
export function SentenceView({
  tk,
  pinyin = true,
  known,
  onWord,
}: {
  tk: Token[];
  pinyin?: boolean;
  known?: (wordId: string) => boolean;
  onWord?: (wordId: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <SentenceTokens tk={tk} pinyin={pinyin} known={known} onWord={onWord} className="text-xl" />
      <SpeakSentence text={sentenceText({ tk })} />
    </div>
  );
}

/** Thông tin có sẵn của một từ ngoài dữ liệu từ HSK (từ của từ điển mở rộng, tên riêng). */
export interface WordInfo {
  p: string;
  /** nghĩa ngắn */
  m: string;
  /** cấp ('1'…'7', 'x'), '' nếu ngoài dữ liệu từ HSK */
  lv: string;
  /** ghi chú nguồn thay cho ghi chú mặc định (từ điển mở rộng) */
  note?: string;
}

/** Bảng tra nhanh một từ (chạm vào từ). `actions`: phần thêm ở cuối (đánh dấu từ, cách đọc khác…). */
export function WordSheet({
  wordId,
  onClose,
  info,
  actions,
}: {
  wordId: string | null;
  onClose: () => void;
  info?: (wordId: string) => WordInfo | undefined;
  actions?: ReactNode;
}) {
  const [word, setWord] = useState<WordRec | null | undefined>(undefined);
  const closeRef = useRef<HTMLButtonElement>(null);
  const extra = wordId ? info?.(wordId) : undefined;
  useEffect(() => {
    if (!wordId) return;
    let alive = true;
    setWord(undefined);
    const lv = info?.(wordId)?.lv;
    if (lv === '') {
      setWord(null);
    } else
      loadWord(wordId, (lv || undefined) as PackKey | undefined)
        .then((w) => alive && setWord(w ?? null))
        .catch(() => alive && setWord(null));
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [wordId, onClose, info]);
  if (!wordId) return null;
  const simp = wordId.slice(0, wordId.indexOf('_'));
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tra từ"
        className="w-full max-w-md rounded-t-2xl border border-line bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          {word ? (
            <div>
              <p className="text-4xl">
                <Han>{word.s}</Han>
              </p>
              <p className="mt-1 text-xl">
                <Pinyin p={word.p} />
              </p>
            </div>
          ) : word === null && extra ? (
            <div>
              <p className="text-4xl">
                <Han>{simp}</Han>
              </p>
              <p className="mt-1 text-xl">
                <Pinyin p={extra.p} />
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">{word === null ? 'Không tải được từ này.' : 'Đang tải…'}</p>
          )}
          <button ref={closeRef} type="button" className={btn} onClick={onClose}>
            Đóng
          </button>
        </div>
        {word && (
          <div className="mt-3 space-y-3">
            <p>{(word.vi ?? []).slice(0, 3).join('; ') || wordGloss(word)}</p>
            {hvString(word) && (
              <p className="text-sm">
                <span className="text-muted">Hán Việt </span>
                {hvString(word)}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <SpeakButtons text={word.s} label={word.p} wordId={word.id} />
              <a className={btn} href={url(`tu/?w=${encodeURIComponent(word.id)}${word.lv.e25 ? `&l=${word.lv.e25}` : ''}`)}>
                Mở trang từ
              </a>
            </div>
          </div>
        )}
        {word === null && extra && (
          <div className="mt-3 space-y-3">
            <p>{extra.m}</p>
            <p className="text-xs text-muted">{extra.note ?? 'Từ ngoài danh sách HSK · nghĩa theo từ điển mở rộng (máy dịch).'}</p>
            <div className="flex flex-wrap items-center gap-2">
              <SpeakButtons text={simp} label={extra.p} />
              <a className={btn} href={url(`tra/?q=${encodeURIComponent(simp)}`)}>
                Tra từ điển
              </a>
            </div>
          </div>
        )}
        {actions && <div className="mt-3 border-t border-line pt-3">{actions}</div>}
      </div>
    </div>
  );
}
