/**
 * Gõ theo đoạn văn (/go/?che-do=doan, ?id=… mở đoạn đã lưu, ?t=… mở sẵn một đoạn): dán một đoạn tiếng Trung bất
 * kỳ (hoặc văn bản đã đọc ở trang Đọc) rồi gõ lại từng câu.
 *
 * Câu đang gõ hiện to, có pinyin; chấm ngay khi gõ: chữ gõ đúng đậm lên, chữ chọn nhầm tô đỏ, bỏ sót chữ thì có ô trống
 * (căn với phần đầu câu nên sót một chữ chỉ báo thiếu chữ đó, không báo sai cả đoạn sau); chấm cả dấu câu nếu bật. Gõ
 * đúng hết câu thì bấm Enter để sang câu sau (không tự nhảy: kịp gõ dấu câu cuối, xem lại câu). Sửa như ô chữ thường:
 * chạm vào chữ đã gõ để đặt con trỏ, chọn lại chữ cùng âm. Chạm vào một câu trong "Cả đoạn" để quay lại sửa câu đã gõ.
 * Tiến độ lưu trên máy để lần sau gõ tiếp; văn bản không gửi đi đâu.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from '../../lib/live-query';
import { logAttempt } from '../../lib/attempts';
import type { ImeLexicon } from '../../lib/ime';
import { SETTING_DEFAULTS } from '../../lib/settings';
import { PASSAGE_MAX, hanCount, splitUnits, tidyPassage, type PassageUnit } from '../../lib/passage';
import type { ReadTok } from '../../lib/reader';
import { uuidv7 } from '../../lib/ids';
import { isHan } from '../../lib/text';
import {
  checkPrefix,
  marksOf,
  perMinute,
  scoredBy,
  type Cell,
  type CheckOpts,
  type PrefixResult,
  type TypedChar,
  type TypingError,
} from '../../lib/typing';
import { url } from '../../lib/url';
import { SpeakSentence } from '../word/Sentence';
import { readText } from '../reading/readText';
import { FocusHeader } from '../FocusHeader';
import { ErrorBox, Han, Loading, Pinyin, btn, btnPrimary, useQueryParam } from '../ui';
import { DrillSummary, PunctToggle, type DrillResult } from './Drill';
import { ImeBox, useImeLexicon } from './ImeBox';
import { getPassage, removePassage, savedPassagesQuery, savePassage, updatePassage, type SavedPassage } from './passages';

export type PassagePinyin = 'all' | 'next' | 'off';
const PINYIN_LABEL: Record<PassagePinyin, string> = { all: 'Cả câu', next: 'Từ đang gõ', off: 'Ẩn' };
const HOME = 'go/';
const SELF = 'go/?che-do=doan';

// ---------------------------------------------------------------- màn chọn đoạn văn

const firstLine = (s: string) => s.replace(/\s+/g, ' ').trim();

function Setup({ onOpen, busy, error }: { onOpen: (text: string) => void; busy: boolean; error: string | null }) {
  const q = useQueryParam('t');
  const [text, setText] = useState(q ?? '');
  const { lex } = useImeLexicon();
  const saved = useLiveQuery(savedPassagesQuery, [], [] as SavedPassage[]);
  const docs = useLiveQuery(
    (t) =>
      t.settings.get('docHistory').then((row) => (row?.value ?? SETTING_DEFAULTS.docHistory) as { text: string; at: number }[]),
    [],
    [],
  );
  const tidy = useMemo(() => tidyPassage(text), [text]);
  const han = hanCount(tidy);
  const outside = useMemo(() => (lex ? [...new Set([...tidy].filter((c) => /\p{Script=Han}/u.test(c) && !lex.charSyl.has(c)))] : []), [lex, tidy]);
  useEffect(() => {
    if (q?.trim()) onOpen(q);
    // chỉ mở một lần khi vào trang có ?t=
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const savedIds = new Set(saved.map((p) => p.text));
  const fromDocs = (docs ?? []).filter((d) => !savedIds.has(tidyPassage(d.text))).slice(0, 5);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm">
          <a className="text-muted underline" href={url(HOME)}>
            ← Gõ chữ
          </a>
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Gõ theo đoạn văn</h1>
      </div>
      <p className="text-muted">
        Dán một đoạn tiếng Trung bất kỳ (bài khoá, đoạn báo, tin nhắn…) rồi gõ lại theo từng câu. Chữ gõ đúng sáng lên, chữ chọn nhầm tô đỏ ngay khi gõ;
        chạm vào chữ để sửa. Gõ xong mỗi câu thì bấm Enter để sang câu sau. Đoạn văn và tiến độ chỉ lưu trên máy bạn.
      </p>
      <label className="block">
        <span className="text-sm font-semibold">Đoạn văn tiếng Trung</span>
        <textarea
          className="mt-1 block w-full rounded-xl border border-line bg-card p-3 text-xl"
          lang="zh-CN"
          rows={6}
          value={text}
          maxLength={PASSAGE_MAX + 500}
          placeholder="今天天气很好。我和朋友一起去公园散步，公园里有很多人。"
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {tidy && (
        <p className="text-sm text-muted" aria-live="polite">
          {han.toLocaleString('vi-VN')} chữ Hán
          {[...text].length > PASSAGE_MAX ? ` · chỉ lấy ${PASSAGE_MAX.toLocaleString('vi-VN')} ký tự đầu` : ''}
          {outside.length > 0 && (
            <>
              {' '}
              · {outside.length} chữ bộ gõ của app chưa có (<Han>{outside.slice(0, 8).join(' ')}</Han>
              {outside.length > 8 ? '…' : ''}): gõ bằng bộ gõ của máy hoặc bấm “Điền giúp”
              {outside.length >= 5 && han && outside.length / han > 0.15 ? '. Có thể đây là chữ phồn thể: bộ gõ của app chỉ gõ chữ giản thể' : ''}
            </>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} disabled={busy || !han} onClick={() => onOpen(text)}>
          {busy ? 'Đang chia câu…' : 'Bắt đầu gõ'}
        </button>
        {typeof navigator !== 'undefined' && navigator.clipboard?.readText && (
          <button
            type="button"
            className={btn}
            onClick={() =>
              void navigator.clipboard
                .readText()
                .then((t) => t && setText(t))
                .catch(() => undefined)
            }
          >
            Dán từ bộ nhớ tạm
          </button>
        )}
      </div>
      {busy && <Loading label="Đang tách từ, chia câu (lần đầu mất vài giây)…" />}
      {error && <ErrorBox>{error}</ErrorBox>}

      {saved.length > 0 && (
        <section aria-labelledby="doan-cua-ban">
          <h2 id="doan-cua-ban" className="text-sm font-semibold text-muted">
            Đoạn văn của bạn
          </h2>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {saved.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(p.text)}>
                  <Han className="block truncate text-lg">{firstLine(p.text)}</Han>
                  <span className="text-xs text-muted">
                    {p.n ? (p.done >= p.n ? `Đã gõ xong ${p.n} câu · gõ lại` : p.done ? `Đã gõ ${p.done}/${p.n} câu · gõ tiếp` : `${p.n} câu · chưa gõ`) : 'Chưa gõ'}
                  </span>
                </button>
                <button
                  type="button"
                  className="shrink-0 text-sm text-muted underline"
                  aria-label={`Xoá khỏi danh sách: ${firstLine(p.text).slice(0, 12)}`}
                  onClick={() => void removePassage(p.id).catch(() => undefined)}
                >
                  Xoá
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {fromDocs.length > 0 && (
        <section aria-labelledby="tu-doc">
          <h2 id="tu-doc" className="text-sm font-semibold text-muted">
            Văn bản bạn đã dán ở Đọc
          </h2>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {fromDocs.map((d) => (
              <li key={d.at}>
                <button type="button" className="block w-full px-3 py-2 text-left" onClick={() => onOpen(d.text)}>
                  <Han className="block truncate text-lg">{firstLine(d.text)}</Han>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- màn gõ

type CharState = 'ok' | 'bad' | 'miss' | 'next' | 'todo';
const CHAR_CLASS: Record<CharState | 'punct', string> = {
  ok: 'text-ink',
  bad: 'rounded bg-t1/10 text-t1',
  miss: 'text-t1/70 underline decoration-t1 decoration-dashed decoration-2 underline-offset-8',
  next: 'text-ink/80 underline decoration-accent decoration-4 underline-offset-8',
  todo: 'text-muted/70',
  punct: 'text-muted',
};

/** Trạng thái từng chữ đích theo kết quả chấm phần đã gõ. */
function charStates(n: number, res: PrefixResult): CharState[] {
  const out: CharState[] = new Array(n).fill('todo');
  let k = 0;
  for (const c of res.cells) {
    if (c.kind === 'thua') continue;
    if (k < n) out[k] = c.kind === 'ok' ? 'ok' : c.kind === 'thieu' ? 'miss' : 'bad';
    k++;
  }
  if (res.next < n) out[res.next] = 'next';
  return out;
}

const tokPinyin = (t: ReadTok, lex: ImeLexicon | null) =>
  t.kind === 'word' || t.kind === 'dict' ? t.p : t.kind === 'char' ? (lex?.charInfo.get(t.t)?.p ?? '') : '';

/** Chỉ số (trong `unit.target`) các chữ được chấm của câu: chữ Hán, thêm dấu câu khi chấm dấu câu. */
const scoredIdx = (u: PassageUnit, o?: CheckOpts) => {
  const scored = scoredBy(o);
  return u.target.flatMap((t, k) => (scored(t.c) ? [k] : []));
};

/**
 * Câu đang gõ: chữ lớn, pinyin trên từ, mỗi chữ được chấm (`keys`: chỉ số trong `unit.target`) tô theo trạng thái (đúng,
 * sai, thiếu, chữ cần gõ tiếp, chưa gõ); dấu câu không chấm thì nhạt.
 */
function TargetLine({ unit, keys, res, pinyin, lex }: { unit: PassageUnit; keys: number[]; res: PrefixResult; pinyin: PassagePinyin; lex: ImeLexicon | null }) {
  const states = charStates(keys.length, res);
  const idx = new Map(keys.map((k, j) => [`${unit.at[k][0]}:${unit.at[k][1]}`, j]));
  const nextTok = res.next < keys.length ? unit.at[keys[res.next]][0] : -1;
  return (
    <div className="flex flex-wrap items-end gap-x-1 gap-y-3" lang="zh-CN" data-testid="cau-dang-go">
      {unit.toks.map((t, ti) => {
        if (t.kind === 'space') return <span key={ti} className="inline-block w-2" aria-hidden="true" />;
        if (t.kind === 'break') return null;
        const p = tokPinyin(t, lex);
        const showP = !!p && (pinyin === 'all' || (pinyin === 'next' && ti === nextTok));
        return (
          <span key={ti} className="inline-flex flex-col items-center">
            {pinyin !== 'off' && <span className="min-h-4 text-xs leading-tight whitespace-nowrap">{showP ? <Pinyin p={p} /> : ' '}</span>}
            <span className="han text-3xl leading-tight">
              {[...t.t].map((c, ci) => {
                const k = idx.get(`${ti}:${ci}`);
                const st = k === undefined ? 'punct' : states[k];
                const outside = k !== undefined && isHan(c) && lex && !lex.charSyl.has(c);
                return (
                  <span
                    key={ci}
                    data-st={st}
                    className={`${CHAR_CLASS[st]} ${outside ? 'underline decoration-dotted decoration-2 underline-offset-8' : ''}`}
                    title={outside ? 'Bộ gõ của app chưa có chữ này: gõ bằng bộ gõ của máy hoặc bấm Điền giúp' : undefined}
                  >
                    {c}
                  </span>
                );
              })}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Lần gõ đầu của mỗi chữ đích (sửa sau đó không đổi): để tính tỉ lệ đúng và lỗi hay gặp. */
interface FirstTry {
  ok: boolean;
  cell?: Cell;
  /** nhờ "Điền giúp" */
  filled?: boolean;
}

let fillGroup = -1;
/** Bấm nút không lấy mất con trỏ khỏi ô gõ (bàn phím điện thoại không bị đóng). */
const keep = (e: { preventDefault: () => void }) => e.preventDefault();

function Typing({
  passage,
  units,
  pinyin,
  setPinyin,
  showInfo,
  setShowInfo,
  punct,
  setPunct,
}: {
  passage: SavedPassage;
  units: PassageUnit[];
  pinyin: PassagePinyin;
  setPinyin: (p: PassagePinyin) => void;
  showInfo: boolean;
  setShowInfo: (v: boolean) => void;
  punct: boolean;
  setPunct: (v: boolean) => void;
}) {
  const names = useMemo(() => {
    const out = new Map<string, string>();
    for (const u of units) for (const t of u.toks) if (t.kind === 'dict' && t.proper) out.set(t.t, t.p);
    return [...out.entries()];
  }, [units]);
  const { lex } = useImeLexicon(names);
  const start = passage.done > 0 && passage.done < units.length ? passage.done : 0;
  const [at, setAt] = useState(start);
  const [typedBy, setTypedBy] = useState<TypedChar[][]>(() => units.map(() => []));
  const [done, setDone] = useState<boolean[]>(() => units.map((_, i) => i < start));
  const [skipped, setSkipped] = useState<Set<number>>(() => new Set());
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [result, setResult] = useState<DrillResult | null>(null);
  /** bấm nút ngoài ô gõ xong thì đưa con trỏ về ô gõ */
  const [focusTick, setFocusTick] = useState(0);
  const refocus = () => setFocusTick((t) => t + 1);
  /** lần gõ đầu của từng chữ đích, theo chỉ số trong `unit.target` (bật, tắt chấm dấu câu giữa chừng vẫn đúng chữ) */
  const firsts = useRef<Map<number, FirstTry>[]>(units.map(() => new Map()));
  /** câu đã chạm tới trong lượt này (tính kết quả) → các chữ được chấm lúc gõ câu đó (bật, tắt chấm dấu câu về sau không đổi) */
  const touched = useRef<Map<number, number[]>>(new Map());
  const act = useRef({ ms: 0, last: 0 });
  const opts: CheckOpts | undefined = useMemo(() => (punct ? { punct: true } : undefined), [punct]);
  const unit = units[at];
  /** các chữ được chấm của câu đang gõ (chỉ số trong unit.target) */
  const keys = useMemo(() => scoredIdx(unit, opts), [unit, opts]);
  const tgt = useMemo(() => keys.map((k) => unit.target[k]), [unit, keys]);
  const typed = typedBy[at];
  const res = useMemo(() => checkPrefix(tgt, typed, lex ?? undefined, opts), [tgt, typed, lex, opts]);
  const marks = useMemo(() => marksOf(res.cells, typed, opts), [res, typed, opts]);
  const doneCount = done.filter(Boolean).length;
  /** câu đang gõ là câu cuối còn lại */
  const lastOne = done.every((d, k) => d || k === at);
  /** ngoặc kép “ mở ở câu trước của cùng đoạn mà chưa đóng (lời nói trải qua nhiều câu): phím " ở câu này ra ” */
  const quoteDepth = useMemo(() => {
    let open = 0;
    for (let k = 0; k <= at; k++) {
      if (units[k].para) open = 0;
      if (k === at) break;
      for (const c of units[k].text) open = c === '“' ? open + 1 : c === '”' ? Math.max(0, open - 1) : open;
    }
    return open;
  }, [units, at]);

  /** Kết quả lượt này (các câu đã chạm tới): chữ đúng ngay lần gõ đầu, lỗi, thời gian gõ. */
  const stats = useCallback((): DrillResult => {
    let right = 0;
    let chars = 0;
    const errors: TypingError[] = [];
    for (const [i, ks] of touched.current) {
      chars += ks.length;
      for (const k of ks) {
        const x = firsts.current[i].get(k);
        if (!x) continue;
        if (x.ok && !x.filled) right++;
        else if (x.cell && x.cell.kind !== 'ok') errors.push({ kind: x.cell.kind, t: x.cell.t, got: x.cell.got, key: x.cell.hint?.key });
      }
    }
    return { items: touched.current.size, right, chars, ms: act.current.ms, errors, missed: [] };
  }, []);
  /** Lưu lượt luyện (ghi đè cùng một dòng mỗi lần xong một câu: thoát giữa chừng vẫn còn). */
  const sessionId = useRef(uuidv7());
  const persist = useCallback((r: DrillResult) => {
    if (!r.items) return;
    void logAttempt({
      id: sessionId.current,
      kind: 'type',
      itemId: 'doan',
      ok: r.right === r.chars,
      durMs: r.ms,
      data: { mode: 'doan', items: r.items, chars: r.chars, right: r.right, cpm: perMinute(r.right, r.ms), errors: r.errors },
    });
  }, []);

  const finish = useCallback(
    (doneNow: boolean[]) => {
      const r = stats();
      persist(r);
      void updatePassage(passage.id, { done: doneNow.every(Boolean) ? units.length : doneNow.indexOf(false), n: units.length }).catch(() => undefined);
      setResult(r);
    },
    [passage.id, units, stats, persist],
  );

  /** Xong (hoặc bỏ qua) câu i: lưu tiến độ, sang câu chưa xong đầu tiên sau nó (hết thì về đầu đoạn), hết cả đoạn thì xem kết quả. */
  const complete = (i: number, skip = false) => {
    const next = done.map((d, k) => d || k === i);
    setDone(next);
    setSkipped((s) => {
      if (skip === s.has(i)) return s;
      const out = new Set(s);
      if (skip) out.add(i);
      else out.delete(i);
      return out;
    });
    setConfirmSkip(false);
    const frontier = next.indexOf(false);
    if (frontier < 0) {
      finish(next);
      return;
    }
    void updatePassage(passage.id, { done: frontier, n: units.length }).catch(() => undefined);
    persist(stats());
    const after = next.findIndex((d, k) => !d && k > i);
    setAt(after >= 0 ? after : frontier);
  };

  /** Ghi lần gõ đầu của từng chữ đích theo kết quả chấm `r` của chữ đã gõ. */
  const record = (r: PrefixResult) => {
    const f = firsts.current[at];
    let j = 0;
    for (const c of r.cells) {
      if (c.kind === 'thua') continue;
      const k = keys[j++];
      if (c.kind !== 'thieu' && k !== undefined && !f.has(k)) f.set(k, { ok: c.kind === 'ok', cell: c });
    }
  };

  // gõ đúng hết câu không tự sang câu sau: bấm Enter (kịp gõ dấu câu cuối, xem lại câu)
  const onChange = (v: TypedChar[]) => {
    const now = Date.now();
    if (act.current.last && now - act.current.last < 20_000) act.current.ms += now - act.current.last;
    act.current.last = now;
    touched.current.set(at, keys);
    setConfirmSkip(false);
    setTypedBy((all) => all.map((x, k) => (k === at ? v : x)));
    record(checkPrefix(tgt, v, lex ?? undefined, opts));
  };

  /** Điền giúp chữ (hoặc dấu) cần gõ tiếp (khi phần đã gõ chưa có lỗi): chữ đó tính là chưa đúng. */
  const canFill = res.next < tgt.length && res.cells.every((c) => c.kind === 'ok');
  const fill = () => {
    if (!canFill) return;
    const k = keys[res.next];
    const t = unit.target[k];
    const f = firsts.current[at];
    if (!f.has(k)) f.set(k, { ok: false, filled: true });
    onChange([...typed, { c: t.c, syl: t.syl || undefined, g: fillGroup-- }]);
    refocus();
  };

  /** Câu đang mở đã xong từ trước (quay lại sửa): sang câu chưa xong, không tính là bỏ qua. */
  const goOn = () => {
    const after = done.findIndex((d, k) => !d && k > at);
    const first = done.indexOf(false);
    if (first < 0) finish(done);
    else go(after >= 0 ? after : first);
  };
  const skip = () => {
    if (done[at]) return goOn();
    touched.current.set(at, keys);
    complete(at, true);
    refocus();
  };

  /** Enter: đúng hết câu thì sang câu sau; chưa đúng thì Enter lần nữa để bỏ qua câu. */
  const onEnter = () => {
    if (res.ok) return complete(at);
    if (done[at]) return goOn();
    if (!confirmSkip) {
      setConfirmSkip(true);
      return;
    }
    skip();
  };

  function go(i: number) {
    setConfirmSkip(false);
    setAt(i);
    refocus();
  }

  if (result)
    return (
      <DrillSummary
        result={result}
        mode="doan"
        lex={lex}
        save={false}
        title={`Xong ${result.items} câu`}
        againLabel="Gõ lại đoạn này"
        backHref={url(SELF)}
        onAgain={() =>
          void updatePassage(passage.id, { done: 0 })
            .catch(() => undefined)
            .then(() => window.location.assign(url(`${SELF}&id=${passage.id}`)))
        }
        onMissed={() => undefined}
        extra={
          <a className={btn} href={url(`?doan=${passage.id}`)}>
            Đọc đoạn này
          </a>
        }
      />
    );

  const left = tgt.length - res.next;
  // cách gõ từ đầu tiên của câu (gợi ý trong ô gõ còn trống)
  const firstHan = unit.target.findIndex((t) => isHan(t.c));
  const firstTok = firstHan >= 0 ? unit.at[firstHan][0] : -1;
  const firstKeys = unit.target
    .filter((t, k) => unit.at[k][0] === firstTok && isHan(t.c))
    .map((t) => t.syl)
    .join('');
  const paras: number[][] = [];
  units.forEach((u, i) => {
    if (u.para || !paras.length) paras.push([i]);
    else paras[paras.length - 1].push(i);
  });
  return (
    <div className="space-y-4">
      <FocusHeader label="Gõ theo đoạn văn" done={doneCount} total={units.length} closeHref={url(SELF)} closeLabel="Thoát, tiến độ đã lưu" />

      <section aria-label={`Câu ${at + 1}/${units.length}`} className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <div className="flex items-center justify-between gap-2 text-sm text-muted">
          <span>
            Câu {at + 1}/{units.length}
            {done[at] && !skipped.has(at) ? ' · đã gõ xong' : ''}
          </span>
          <SpeakSentence text={unit.text} slow />
        </div>
        <TargetLine unit={unit} keys={keys} res={res} pinyin={pinyin} lex={lex} />
      </section>

      <ImeBox
        lex={lex}
        value={typed}
        onChange={onChange}
        onEnter={onEnter}
        label="Gõ câu"
        showInfo={showInfo}
        autoFocus
        marks={marks}
        refocus={focusTick}
        punctBar
        quoteDepth={quoteDepth}
        placeholder={firstKeys ? `Gõ pinyin câu trên, bắt đầu: ${firstKeys}` : 'Gõ pinyin câu trên'}
      />

      <p className="min-h-5 text-sm" aria-live="polite">
        {res.ok ? (
          <span className="font-semibold text-t2">✓ Đúng hết câu này. Bấm Enter để {lastOne ? 'xem kết quả' : 'sang câu sau'}.</span>
        ) : confirmSkip ? (
          <span className="text-t1">
            Câu chưa xong (còn {left} chữ{marks.bad.size || marks.gaps.size ? ', có chỗ sai' : ''}). Enter lần nữa để bỏ qua, sang câu sau.
          </span>
        ) : marks.bad.size || marks.gaps.size || marks.extra.size ? (
          <span className="text-t1">
            Có chỗ sai: chạm vào chữ tô đỏ để chọn lại chữ cùng âm (gõ sai âm thì xoá ⌫ rồi gõ lại){punct ? ', chạm vào dấu tô đỏ để đổi dấu' : ''}, chạm
            vào ô trống để chèn chữ còn thiếu.
          </span>
        ) : (
          <span className="text-muted">
            Gõ xong cả câu{punct ? ' (kể cả dấu câu)' : ''} rồi bấm Enter để {lastOne ? 'xem kết quả' : 'sang câu sau'}.
          </span>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {res.ok ? (
          <button
            type="button"
            className={btnPrimary}
            onMouseDown={keep}
            onClick={() => {
              complete(at);
              refocus();
            }}
          >
            {lastOne ? 'Xem kết quả' : 'Sang câu sau'} (Enter)
          </button>
        ) : (
          <>
            <button
              type="button"
              className={btn}
              disabled={!canFill}
              onMouseDown={keep}
              onClick={fill}
              title="Điền chữ cần gõ tiếp theo (tính là chưa đúng); sửa hết chỗ sai thì mới điền được"
            >
              Điền giúp 1 chữ
            </button>
            <button type="button" className={btn} onMouseDown={keep} onClick={skip}>
              {lastOne ? (done[at] ? 'Xem kết quả' : 'Bỏ qua, xem kết quả') : done[at] ? 'Sang câu chưa gõ' : 'Bỏ qua câu này'}
            </button>
          </>
        )}
        <div role="radiogroup" aria-label="Pinyin" className="ml-auto flex items-center gap-1 text-sm">
          <span className="mr-1 text-muted">Pinyin:</span>
          {(['all', 'next', 'off'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={pinyin === k}
              onMouseDown={keep}
              onClick={() => {
                setPinyin(k);
                refocus();
              }}
              className={`min-h-9 rounded-lg border px-2 ${pinyin === k ? 'border-accent bg-accent-soft font-semibold' : 'border-line'}`}
            >
              {PINYIN_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6">
        <label className="flex min-h-11 items-center gap-2 text-sm" onMouseDown={keep}>
          <input
            type="checkbox"
            className="size-5"
            checked={showInfo}
            onChange={(e) => {
              setShowInfo(e.target.checked);
              refocus();
            }}
          />
          Hán Việt, nghĩa trong gợi ý
        </label>
        <PunctToggle
          punct={punct}
          setPunct={(v) => {
            setPunct(v);
            refocus();
          }}
        />
      </div>

      {units.length > 1 && (
        <details open={units.length <= 40} className="rounded-2xl border border-line p-4">
          <summary className="cursor-pointer text-sm font-semibold text-muted">
            Cả đoạn · {doneCount}/{units.length} câu (chạm vào câu để gõ hoặc sửa lại)
          </summary>
          <div className="mt-3 space-y-2 text-lg leading-relaxed" lang="zh-CN">
            {paras.map((ids) => (
              <p key={ids[0]}>
                {ids.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={keep}
                    onClick={() => go(i)}
                    aria-current={i === at ? 'step' : undefined}
                    aria-label={`Câu ${i + 1}${done[i] ? (skipped.has(i) ? ', đã bỏ qua' : ', đã gõ xong') : ''}: ${units[i].text}`}
                    className={`han rounded px-0.5 text-left ${
                      i === at ? 'bg-accent-soft text-ink ring-1 ring-accent' : done[i] ? (skipped.has(i) ? 'text-muted line-through' : 'text-ink') : 'text-muted'
                    } hover:bg-accent-soft`}
                  >
                    {units[i].text}
                  </button>
                ))}
              </p>
            ))}
          </div>
          <button type="button" className="mt-3 text-sm text-muted underline" onClick={() => finish(done)}>
            Dừng ở đây, xem kết quả
          </button>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- chế độ

export function PassageMode({
  pinyin,
  setPinyin,
  showInfo,
  setShowInfo,
  punct,
  setPunct,
}: {
  pinyin: PassagePinyin;
  setPinyin: (p: PassagePinyin) => void;
  showInfo: boolean;
  setShowInfo: (v: boolean) => void;
  /** chấm cả dấu câu */
  punct: boolean;
  setPunct: (v: boolean) => void;
}) {
  const id = useQueryParam('id');
  const [open, setOpen] = useState<{ p: SavedPassage; units: PassageUnit[] } | null>(null);
  const [busy, setBusy] = useState(!!id);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (p: SavedPassage) => {
    const units = splitUnits(await readText(p.text));
    if (!units.length) throw new Error('Đoạn văn không có chữ Hán nào để gõ.');
    if (p.n !== units.length) await updatePassage(p.id, { n: units.length }).catch(() => undefined);
    setOpen({ p: { ...p, n: units.length }, units });
    document.title = 'Gõ theo đoạn văn · Gõ chữ · Chữ Hán';
  }, []);

  const run = useCallback(
    (job: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      job()
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setBusy(false));
    },
    [setBusy],
  );

  // ?id=…: mở đoạn đã lưu (từ Đọc · Dán văn bản hoặc danh sách)
  useEffect(() => {
    if (!id) return;
    run(async () => {
      const p = await getPassage(id);
      if (!p) throw new Error('Không tìm thấy đoạn văn này trên máy (có thể đã bị xoá). Dán lại đoạn văn nhé.');
      await start(p);
    });
  }, [id, run, start]);

  if (open)
    return (
      <Typing
        key={open.p.id}
        passage={open.p}
        units={open.units}
        pinyin={pinyin}
        setPinyin={setPinyin}
        showInfo={showInfo}
        setShowInfo={setShowInfo}
        punct={punct}
        setPunct={setPunct}
      />
    );
  return (
    <Setup
      busy={busy}
      error={error}
      onOpen={(text) =>
        run(async () => {
          if (!hanCount(tidyPassage(text))) throw new Error('Đoạn văn không có chữ Hán nào để gõ.');
          await start(await savePassage(text));
        })
      }
    />
  );
}
