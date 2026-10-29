/**
 * Phần dùng chung của trang Đọc: cài đặt pinyin và gợi ý Hán Việt, danh sách từ chưa biết, bảng tra từ kèm đánh dấu
 * "Đang học" / "Đã biết" (lưu câu gặp từ).
 */
import { useCallback, useEffect, useState } from 'react';
import type { Token } from '../../schema/data';
import { loadChar } from '../../lib/data';
import { saveContext } from '../../lib/db';
import type { WordItem, WordState } from '../../lib/mywords';
import { SETTING_DEFAULTS, getSetting, setSetting } from '../../lib/settings';
import { nameHanviet, type Coverage, type HskEntry, type ReadTok } from '../../lib/reader';
import { fmtInt, isHan, levelLabel } from '../../lib/text';
import { url } from '../../lib/url';
import { MarkButtons, StateBadge, markWords } from '../mine/parts';
import { WordSheet, type WordInfo } from '../word/Sentence';
import { Han, Pinyin, btn } from '../ui';
import type { PinyinMode } from './ReaderText';

// ---------------------------------------------------------------- cài đặt hiển thị

export function useReaderPrefs() {
  const [pinyin, setPinyinState] = useState<PinyinMode>(SETTING_DEFAULTS.docPinyin);
  const [hv, setHvState] = useState(SETTING_DEFAULTS.docHv);
  useEffect(() => {
    Promise.all([getSetting('docPinyin'), getSetting('docHv')])
      .then(([p, h]) => {
        setPinyinState(p);
        setHvState(h);
      })
      .catch(() => undefined);
  }, []);
  const setPinyin = (v: PinyinMode) => {
    setPinyinState(v);
    void setSetting('docPinyin', v).catch(() => undefined);
  };
  const setHv = (v: boolean) => {
    setHvState(v);
    void setSetting('docHv', v).catch(() => undefined);
  };
  return { pinyin, setPinyin, hv, setHv };
}

export function ReaderControls({ pinyin, setPinyin, hv, setHv }: ReturnType<typeof useReaderPrefs>) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <div role="radiogroup" aria-label="Pinyin" className="inline-flex overflow-hidden rounded-lg border border-line">
        {(
          [
            ['all', 'Pinyin: hết'],
            ['new', 'Từ chưa biết'],
            ['off', 'Tắt'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={pinyin === k}
            className={`min-h-11 px-3 ${pinyin === k ? 'bg-accent font-semibold text-accent-ink' : 'hover:bg-accent-soft'}`}
            onClick={() => setPinyin(k)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" className="size-5" checked={hv} onChange={(e) => setHv(e.target.checked)} />
        Hán Việt dưới từ chưa biết
      </label>
    </div>
  );
}

// ---------------------------------------------------------------- thêm vào Sổ từ

const toToken = (t: ReadTok): Token | null =>
  t.kind === 'word' ? [t.t, t.p, t.ids[0]] : t.kind === 'dict' ? [t.t, t.p] : t.kind === 'space' ? [' '] : t.kind === 'break' ? null : [t.t];

/** Câu chứa token thứ i (để lưu làm câu ví dụ). */
export function sentenceAround(toks: readonly ReadTok[], i: number): Token[] {
  const end = (t: ReadTok) => t.kind === 'break' || (t.kind === 'punct' && /[。！？!?…]/.test(t.t));
  let a = i;
  while (a > 0 && !end(toks[a - 1])) a--;
  let b = i;
  while (b < toks.length - 1 && !end(toks[b])) b++;
  if (toks[b]?.kind === 'break') b--;
  return toks
    .slice(a, b + 1)
    .map(toToken)
    .filter((x): x is Token => !!x)
    .filter((x, k, arr) => !(x[0] === ' ' && (k === 0 || k === arr.length - 1)));
}

/** Phần hiện của một token từ (để đánh dấu). */
export const itemOfTok = (t: Extract<ReadTok, { kind: 'word' }>): WordItem => ({ id: t.ids[0], lv: t.lv || undefined, s: t.t, p: t.p, hv: t.hv, vi: t.m });

/** Lưu câu gặp từ (token thứ i) khi đánh dấu; `markMany`: đánh dấu nhiều từ, báo một lần. */
export function useMark(src: string) {
  const keepContext = useCallback(
    (toks: readonly ReadTok[], i: number) => {
      const t = toks[i];
      if (t?.kind === 'word') void saveContext(t.ids[0], sentenceAround(toks, i), src).catch(() => undefined);
    },
    [src],
  );
  const markMany = useCallback(
    async (toks: readonly ReadTok[], at: readonly number[], st: WordState) => {
      const seen = new Set<string>();
      const items: WordItem[] = [];
      for (const i of at) {
        const t = toks[i];
        if (t?.kind !== 'word' || seen.has(t.ids[0])) continue;
        seen.add(t.ids[0]);
        items.push(itemOfTok(t));
      }
      await markWords(items, st, src);
    },
    [src],
  );
  return { keepContext, markMany };
}

// ---------------------------------------------------------------- danh sách từ chưa biết

const gloss = (t: ReadTok) => (t.kind === 'word' ? t.m : t.kind === 'dict' ? t.m.slice(0, 3).join('; ') : '');

/**
 * Từ chưa biết của văn bản: chữ, pinyin, nghĩa, cấp, trạng thái đánh dấu. Chỉ hiện 50 từ đầu, "Xem thêm" để xem hết
 * (văn bản dài có thể có hàng trăm từ).
 */
const UNKNOWN_PAGE = 50;
export function UnknownWords({
  cov,
  states,
  onOpen,
  onMarkAll,
}: {
  cov: Coverage;
  states: ReadonlyMap<string, WordState>;
  onOpen: (u: ReadTok) => void;
  onMarkAll: (st: WordState) => void;
}) {
  const [shown, setShown] = useState(UNKNOWN_PAGE);
  // đổi văn bản → hiện lại từ đầu
  useEffect(() => setShown(UNKNOWN_PAGE), [cov]);
  if (!cov.unknown.length) return null;
  const hasWords = cov.unknown.some((u) => u.kind === 'word');
  return (
    <details className="rounded-2xl border border-line bg-card p-4" open={cov.unknown.length <= 8}>
      <summary className="cursor-pointer font-semibold">Từ chưa biết ({fmtInt(cov.unknown.length)})</summary>
      <ul className="mt-2 divide-y divide-line">
        {cov.unknown.slice(0, shown).map((u, k) => {
          if (u.kind === 'space' || u.kind === 'break') return null;
          return (
            <li key={`${u.t}-${k}`} className="flex items-center gap-3 py-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(u)}>
                <Han className="text-xl">{u.t}</Han>
                {(u.kind === 'word' || u.kind === 'dict') && <Pinyin p={u.p} className="ml-2" />}
                <span className="ml-2 text-sm text-muted">
                  {gloss(u)}
                  {u.kind === 'word' ? ` · ${u.lv ? levelLabel(u.lv) : 'ngoài HSK'}` : u.kind === 'dict' ? ' · từ điển mở rộng' : ''}
                </span>
              </button>
              {u.kind === 'word' && <StateBadge state={states.get(u.ids[0])} />}
            </li>
          );
        })}
      </ul>
      {shown < cov.unknown.length && (
        <button type="button" className={btn} onClick={() => setShown((x) => x + UNKNOWN_PAGE)}>
          Xem thêm ({fmtInt(cov.unknown.length - shown)} từ nữa)
        </button>
      )}
      {hasWords && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => onMarkAll('hoc')}>
            ☆ Đánh dấu tất cả: đang học
          </button>
          <button type="button" className={btn} onClick={() => onMarkAll('biet')}>
            ✓ Tất cả: đã biết
          </button>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">Từ đánh dấu được lưu kèm câu bạn gặp nó, xem lại ở Tôi → Từ của tôi.</p>
    </details>
  );
}

// ---------------------------------------------------------------- bảng tra

/** Âm Hán Việt của tên riêng (ghép từng chữ), '' khi không phải tên riêng hoặc thiếu dữ liệu chữ. */
function useNameHv(tok: ReadTok | null): string {
  const [hv, setHv] = useState('');
  useEffect(() => {
    setHv('');
    if (tok?.kind !== 'dict' || !tok.proper) return;
    let alive = true;
    const chars = [...new Set(tok.t)];
    Promise.all(chars.map((c) => loadChar(c).catch(() => undefined)))
      .then((recs) => {
        const by = new Map(chars.map((c, i) => [c, recs[i]?.rec]));
        if (alive) setHv(nameHanviet(tok.t, tok.p, (c) => by.get(c)));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tok]);
  return hv;
}

const sheetId = (t: ReadTok) => (t.kind === 'word' ? t.ids[0] : t.kind === 'dict' ? `${t.t}_tu-dien` : t.kind === 'char' ? `${t.t}_chu` : '');

/** Bảng tra một token: nghĩa, Hán Việt (WordSheet) kèm cách đọc khác, đánh dấu từ, trang chữ, cách viết. */
export function ReaderSheet({
  tok,
  alts = [],
  state,
  onClose,
  onMark,
  onPick,
}: {
  tok: ReadTok | null;
  alts?: HskEntry[];
  /** trạng thái đánh dấu của từ */
  state?: WordState;
  onClose: () => void;
  onMark: (st: WordState | null) => void;
  onPick?: (id: string) => void;
}) {
  const info = useCallback(
    (id: string): WordInfo | undefined => {
      if (!tok) return undefined;
      if (tok.kind === 'word' && id === tok.ids[0]) return { p: tok.p, m: tok.m, lv: tok.lv ? String(tok.lv) : 'x' };
      if (tok.kind === 'dict')
        return tok.m.length || !tok.proper
          ? { p: tok.p, m: tok.m.join('; '), lv: '' }
          : { p: tok.p, m: 'Tên riêng (tên người, nơi chốn…).', lv: '', note: 'Tên riêng, không cần học như từ vựng.' };
      if (tok.kind === 'char') return { p: '', m: 'Chưa có trong từ điển của app.', lv: '' };
      return undefined;
    },
    [tok],
  );
  const show = tok && tok.kind !== 'space' && tok.kind !== 'break' && tok.kind !== 'punct' && tok.kind !== 'other';
  const nameHv = useNameHv(show ? tok : null);
  const chars = show ? [...new Set([...tok.t].filter(isHan))] : [];
  return (
    <WordSheet
      wordId={show ? sheetId(tok) || null : null}
      onClose={onClose}
      info={info}
      actions={
        show ? (
          <div className="space-y-3 text-sm">
            {nameHv && (
              <p>
                <span className="text-muted">Tên riêng · Hán Việt </span>
                <span className="font-semibold">{nameHv}</span>
              </p>
            )}
            {alts.length > 0 && onPick && (
              <div>
                <p className="text-muted">Cách đọc khác (máy chọn cách đọc thường gặp nhất):</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {alts.map((e) => (
                    <button key={e.id} type="button" className={`${btn} !min-h-9 !px-3`} onClick={() => onPick(e.id)}>
                      <Pinyin p={e.p} /> <span className="text-muted">{e.m}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tok.kind === 'word' && <MarkButtons item={itemOfTok(tok)} state={state} src="doc" onMark={onMark} />}
            {chars.length > 0 && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {chars.map((c) => (
                  <a key={c} className="text-muted underline" href={url(`chu/?c=${encodeURIComponent(c)}`)}>
                    Chữ <Han>{c}</Han>
                  </a>
                ))}
                <a className="text-muted underline" href={url(`viet/cau/?t=${encodeURIComponent(tok.t)}`)}>
                  Cách viết
                </a>
              </p>
            )}
          </div>
        ) : undefined
      }
    />
  );
}
