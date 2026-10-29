/**
 * Một lượt luyện gõ: lần lượt từng đề (từ, câu, chỗ trống của bẫy cùng âm, bẫy dấu câu), gõ bằng bộ gõ pinyin. Gõ từ,
 * điền chỗ trống: gõ đúng là chấm luôn (Enter để chấm khi chưa đúng). Gõ câu: không tự chấm, gõ xong cả câu (kể cả dấu
 * câu cuối) bấm Enter để nộp; chấm cả dấu câu nếu bật. Sai thì xem lỗi và giải thích, sửa ngay trong ô gõ (chữ sai tô đỏ,
 * chỗ thiếu có ô trống; dấu lỗi cập nhật ngay khi sửa) rồi nộp lại, hoặc sang đề sau. Chỉ lần chấm đầu được tính. Cuối
 * lượt: số chữ đúng, tốc độ, lỗi hay gặp; lượt được lưu (attempts, kind `type`).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { stopAll, voicesForWord } from '../../lib/audio';
import { buildDrillAttempt, logAttempt } from '../../lib/attempts';
import type { ImeLexicon } from '../../lib/ime';
import { checkTyped, isZhPunct, marksOf, perMinute, scoreFirstCheck, summarizeErrors, type CheckOpts, type CheckResult, type TypedChar, type TypingError } from '../../lib/typing';
import { SentenceTokens } from '../word/Sentence';
import { FocusHeader } from '../FocusHeader';
import { Han, Pinyin, SpeakerIcon, btn, btnPrimary } from '../ui';
import { CellsRow, Explain, PunctSlip, charInfo } from './CheckView';
import { ImeBox } from './ImeBox';
import type { DrillItem } from './sources';
import { keepFocus, PROMPT_VI, PunctToggle, type PromptKind } from './prompt';
/** Giữ nguyên API: các chỗ khác vẫn import PROMPT_VI/PunctToggle/PromptKind từ './Drill' được. */
export { PROMPT_VI, PunctToggle };
export type { PromptKind };



export interface DrillResult {
  items: number;
  /** số chữ đúng / tổng số chữ (lần chấm đầu) */
  right: number;
  chars: number;
  ms: number;
  errors: TypingError[];
  /** các đề sai ở lần chấm đầu */
  missed: DrillItem[];
}

/** Nghe đề: bản ghi người thật nếu là từ có bản ghi, không thì giọng máy. */
function usePlayer(text: string, wordId?: string) {
  return useCallback(
    async (rate = 1) => {
      const v = await voicesForWord(text, wordId).catch(() => []);
      await v[0]?.play(rate).catch(() => undefined);
    },
    [text, wordId],
  );
}

function Prompt({ item, kind, done, hint }: { item: DrillItem; kind: PromptKind; done: boolean; hint: boolean }) {
  const play = usePlayer(item.blank !== undefined && item.tk ? item.tk.map((t) => t[0]).join('') : item.zh, item.tk ? undefined : item.wordId);
  useEffect(() => {
    if (kind === 'nghe') void play();
    return () => stopAll();
  }, [kind, play]);
  const isSentence = !!item.tk;
  const showHan = kind === 'chu' || done;
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-card p-5 text-center">
      {item.blank !== undefined && item.tk ? (
        <>
          <div className="flex justify-center">
            <SentenceTokens
              tk={item.tk}
              blank={done ? undefined : item.blank}
              blankContent={
                <span className="inline-flex flex-col items-center">
                  <span className={`han inline-block border-b-2 border-accent text-center ${item.punct ? 'min-w-8' : 'min-w-14'}`}>&nbsp;</span>
                  <span className={item.punct ? 'han text-sm whitespace-nowrap text-accent' : 'font-mono text-sm text-accent'}>{item.punct ? '、 hay ，' : item.keys}</span>
                </span>
              }
              className="justify-center text-2xl"
            />
          </div>
          <p className="text-sm text-muted">{item.vi}</p>
        </>
      ) : (
        <>
          {showHan && (isSentence ? <SentenceTokens tk={item.tk!} pinyin={done} className="justify-center text-2xl" /> : <Han className="text-5xl">{item.zh}</Han>)}
          {!isSentence && done && <Pinyin p={item.p} className="block text-lg" />}
          {kind === 'pinyin' && !done && <p className="font-mono text-xl">{item.keys}</p>}
          {kind === 'nghe' && (
            <div className="flex justify-center gap-2">
              <button type="button" className={btnPrimary} onClick={() => void play()} aria-label="Nghe lại">
                <SpeakerIcon /> Nghe
              </button>
              <button type="button" className={btn} onClick={() => void play(0.7)} aria-label="Nghe chậm">
                Chậm
              </button>
            </div>
          )}
          {(kind !== 'nghe' || done) && (
            <p className={isSentence ? 'text-sm text-muted' : 'text-base'}>
              {!isSentence && item.hv && (kind === 'chu' || done) && <span className="font-semibold">{item.hv} · </span>}
              {item.vi}
            </p>
          )}
          {hint && !done && kind !== 'pinyin' && (
            <p className="font-mono text-lg text-accent" aria-live="polite">
              {item.keys}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Quy tắc nhắc lại khi điền đúng dấu ở Bẫy dấu câu. */
const PUNCT_RULE: Record<string, string> = {
  '、': 'Các từ, cụm từ ngắn ngang hàng trong danh sách ngăn bằng dấu ngắt liệt kê 、 (phím \\); không đặt 、 trước 和, 或 nối món cuối.',
  '，': 'Dấu phẩy ， (phím ,) là chỗ ngừng trong câu: giữa hai vế, sau lời gọi (陈安，…), sau phần mở đầu câu (晚上，…), giữa các nhóm dài khi liệt kê.',
};


export function Drill({
  title,
  items,
  kind,
  lex,
  showInfo,
  setShowInfo,
  punct = true,
  setPunct,
  closeHref,
  onFinish,
  subtitle,
}: {
  title: string;
  items: DrillItem[];
  kind: PromptKind;
  lex: ImeLexicon | null;
  showInfo: boolean;
  setShowInfo: (v: boolean) => void;
  /** chấm cả dấu câu ở đề là câu */
  punct?: boolean;
  setPunct?: (v: boolean) => void;
  closeHref: string;
  onFinish: (r: DrillResult) => void;
  /** nhãn cách ra đề trên đầu (mặc định theo `kind`) */
  subtitle?: string;
}) {
  const [at, setAt] = useState(0);
  const [typed, setTyped] = useState<TypedChar[]>([]);
  /** kết quả lần chấm gần nhất (sau lần chấm đầu thì chấm lại ngay khi sửa) */
  const [res, setRes] = useState<CheckResult | null>(null);
  /** đã chấm ít nhất một lần: hiện đáp án */
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const counted = useRef(false);
  const acc = useRef({ right: 0, chars: 0, ms: 0, errors: [] as TypingError[], missed: [] as DrillItem[] });
  const started = useRef(Date.now());
  const nextBtn = useRef<HTMLButtonElement>(null);
  const item = items[at];
  const solved = !!res?.ok;
  /** đề là câu (gõ câu): không tự chấm, Enter để nộp (phím cách còn để chọn chữ, kịp gõ dấu câu cuối) */
  const isSentence = !!item?.tk && item.blank === undefined;
  const punctOn = !!item?.punct || (isSentence && punct);
  const opts: CheckOpts | undefined = useMemo(() => (punctOn ? { punct: true } : undefined), [punctOn]);
  /** chấm phần đang gõ (không tính điểm): dấu lỗi khi sửa, báo "đúng hết" để nộp */
  const live = useMemo(() => (item ? checkTyped(item.target, typed, lex ?? undefined, opts) : null), [item, typed, lex, opts]);

  /** Nộp: chấm; chỉ lần chấm đầu của mỗi đề được tính vào kết quả lượt. Ô trống thì không chấm (lỡ bấm Enter). */
  const check = useCallback(
    (t: readonly TypedChar[] = typed) => {
      if (!item || solved || !t.length) return;
      const r = checkTyped(item.target, t, lex ?? undefined, opts);
      setRes(r);
      setRevealed(true);
      if (counted.current) return;
      counted.current = true;
      const { score, missed } = scoreFirstCheck(acc.current, r, Date.now(), started.current);
      acc.current = { ...score, missed: missed ? [...acc.current.missed, item] : acc.current.missed };
    },
    [item, typed, lex, solved, opts],
  );

  // gõ từ: đúng hết là chấm luôn; bẫy dấu câu: gõ dấu là chấm; gõ câu: chỉ chấm khi Enter
  const onChange = (v: TypedChar[]) => {
    setTyped(v);
    if (!item || isSentence) return;
    if (item.punct ? v.some((x) => isZhPunct(x.c)) : checkTyped(item.target, v, lex ?? undefined, opts).ok) check(v);
  };

  useEffect(() => {
    if (solved) nextBtn.current?.focus({ preventScroll: true });
  }, [solved]);

  const next = () => {
    if (at + 1 >= items.length) {
      const a = acc.current;
      onFinish({ items: items.length, right: a.right, chars: a.chars, ms: a.ms, errors: a.errors, missed: a.missed });
      return;
    }
    setAt(at + 1);
    setTyped([]);
    setRes(null);
    setRevealed(false);
    setHint(false);
    counted.current = false;
    started.current = Date.now();
  };
  const [focusTick, setFocusTick] = useState(0);
  const clear = () => {
    setTyped([]);
    setRes(null);
    setRevealed(false);
    setFocusTick((t) => t + 1);
  };
  // sau lần nộp đầu, dấu lỗi và lời giải thích theo phần đang gõ (sửa đến đâu cập nhật đến đó)
  const shown = revealed && !solved ? live : null;
  const marks = useMemo(() => (shown && !shown.ok ? marksOf(shown.cells, typed, opts) : undefined), [shown, typed, opts]);
  const wrong = shown ? shown.cells.filter((c) => c.kind !== 'ok').length : 0;
  const isLast = at + 1 >= items.length;

  if (!item) return null;
  const sameKeys = item.set && (
    <div className="text-sm">
      <p className="font-semibold">Các chữ cùng gõ “{item.keys}”:</p>
      <ul className="mt-1 space-y-1">
        {item.set.map((m) => (
          <li key={m.id}>
            <Han className="text-xl">{m.t}</Han> <Pinyin p={m.p} className="text-sm" /> · <span className="font-semibold">{m.hv}</span> · {m.m}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="space-y-4">
      <FocusHeader label={`${title} · ${subtitle ?? PROMPT_VI[kind]}`} done={at + (solved ? 1 : 0)} total={items.length} closeHref={closeHref} closeLabel="Thoát, về Gõ chữ" />
      <Prompt key={item.key} item={item} kind={kind} done={revealed} hint={hint} />

      {!solved && (
        <>
          <ImeBox
            lex={lex}
            value={typed}
            onChange={onChange}
            onEnter={() => check()}
            label={`Gõ ${isSentence ? 'câu' : item.punct ? 'dấu câu' : 'từ'}`}
            showInfo={showInfo}
            autoFocus
            marks={marks}
            refocus={focusTick}
            punctBar={isSentence || !!item.punct}
            placeholder={item.punct ? 'Gõ dấu (phím , hoặc \\) hoặc bấm nút dấu' : undefined}
          />
          {isSentence && live?.ok && (
            <p role="status" className="text-sm font-semibold text-t2">
              ✓ Đúng hết. Bấm Enter để nộp.
            </p>
          )}
          {!(shown && !shown.ok) && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btnPrimary} onMouseDown={keepFocus} onClick={() => check()}>
                {revealed ? 'Nộp lại (Enter)' : isSentence ? 'Nộp (Enter)' : 'Kiểm tra (Enter)'}
              </button>
              {!revealed && kind !== 'pinyin' && item.blank === undefined && !hint && (
                <button type="button" className={btn} onMouseDown={keepFocus} onClick={() => setHint(true)}>
                  Gợi ý cách gõ
                </button>
              )}
              {!revealed && (
                <div className="ml-auto flex flex-col items-end">
                  {!item.punct && (
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input type="checkbox" className="size-5" checked={showInfo} onChange={(e) => setShowInfo(e.target.checked)} />
                      Hán Việt, nghĩa trong gợi ý
                    </label>
                  )}
                  {isSentence && setPunct && <PunctToggle punct={punct} setPunct={setPunct} />}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {shown && !shown.ok && (
        // chỉ dòng kết quả là vùng thông báo: sửa trong ô thì chấm lại liên tục, đọc lại cả khung sẽ rất ồn
        <section aria-label="Kết quả chấm" className="space-y-3 rounded-2xl border-2 border-t1 p-4">
          <p role="status" className="text-lg font-semibold text-t1">
            Chưa đúng: {wrong} chỗ sai
          </p>
          <CellsRow res={shown} />
          <p className="text-sm">
            {item.punct
              ? 'Chạm vào dấu tô đỏ để đổi dấu, hoặc xoá (⌫) rồi gõ lại.'
              : `Sửa ngay trong ô gõ: chạm vào chữ tô đỏ để chọn lại chữ cùng âm (gõ sai âm thì xoá ⌫ rồi gõ lại)${punctOn ? ', chạm vào dấu tô đỏ để đổi dấu' : ''}, chạm vào ô trống để chèn chữ${punctOn ? ' hoặc dấu' : ''} còn thiếu, ⌫ xoá chữ thừa.${isSentence ? ' Sửa xong bấm Enter để nộp lại.' : ''}`}
          </p>
          <p className="text-sm text-muted">
            Cách gõ: <span className="font-mono text-ink">{item.punct ? `phím ${item.keys} ra ${item.zh}` : item.keys}</span>
          </p>
          <Explain res={shown} lex={lex} />
          {sameKeys}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onMouseDown={keepFocus} onClick={() => check()}>
              {isSentence ? 'Nộp lại (Enter)' : 'Kiểm tra lại (Enter)'}
            </button>
            <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={clear}>
              Xoá hết, gõ lại
            </button>
            <button type="button" className={btn} onClick={next}>
              {isLast ? 'Bỏ qua, xem kết quả' : 'Bỏ qua, sang đề sau'}
            </button>
          </div>
        </section>
      )}

      {solved && (
        <section aria-label="Kết quả chấm" className="space-y-3 rounded-2xl border-2 border-t2 p-4">
          <p role="status" className="text-lg font-semibold text-t2">
            ✓ Đúng rồi!
          </p>
          {item.punct && PUNCT_RULE[item.zh] && <p className="text-sm">{PUNCT_RULE[item.zh]}</p>}
          <p className="text-sm text-muted">
            Cách gõ: <span className="font-mono text-ink">{item.punct ? `phím ${item.keys} ra ${item.zh}` : item.keys}</span>
          </p>
          {sameKeys}
          <div className="flex flex-wrap gap-2">
            <button ref={nextBtn} type="button" className={btnPrimary} onClick={next}>
              {isLast ? 'Xem kết quả' : 'Tiếp'} (Enter)
            </button>
          </div>
        </section>
      )}
      {lex === null && <p className="text-sm text-muted">Đang tải từ điển gợi ý…</p>}
    </div>
  );
}

/** Kết quả cuối lượt và lưu lượt luyện. */
export function DrillSummary({
  result,
  mode,
  lex,
  onAgain,
  onMissed,
  backHref,
  title,
  againLabel = 'Lượt mới',
  extra,
  save = true,
}: {
  result: DrillResult;
  mode: string;
  lex: ImeLexicon | null;
  onAgain: () => void;
  onMissed: () => void;
  backHref: string;
  /** tiêu đề (mặc định "Xong lượt N đề") */
  title?: string;
  againLabel?: string;
  /** nút, liên kết thêm */
  extra?: ReactNode;
  /** lưu lượt luyện (false: nơi gọi tự lưu) */
  save?: boolean;
}) {
  const saved = useRef(!save);
  useEffect(() => {
    if (saved.current) return;
    saved.current = true;
    logAttempt(buildDrillAttempt(result, mode));
  }, [result, mode]);
  const sum = useMemo(() => summarizeErrors(result.errors), [result]);
  const pct = result.chars ? Math.round((100 * result.right) / result.chars) : 0;
  const secs = Math.round(result.ms / 1000);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{title ?? `Xong lượt ${result.items} đề`}</h2>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-line bg-card p-3">
          <dt className="text-xs text-muted">Chữ đúng</dt>
          <dd className="text-2xl font-semibold tabular-nums">{pct}%</dd>
          <dd className="text-xs text-muted tabular-nums">
            {result.right}/{result.chars}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <dt className="text-xs text-muted">Tốc độ</dt>
          <dd className="text-2xl font-semibold tabular-nums">{perMinute(result.right, result.ms)}</dd>
          <dd className="text-xs text-muted">chữ/phút</dd>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <dt className="text-xs text-muted">Thời gian</dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
          </dd>
          <dd className="text-xs text-muted">phút</dd>
        </div>
      </dl>
      {(sum.swaps.length > 0 || sum.sounds.length > 0 || sum.puncts.length > 0) && (
        <div className="rounded-xl border border-line p-4 text-sm">
          <p className="font-semibold">Lỗi trong lượt này</p>
          <ul className="mt-2 space-y-1">
            {sum.swaps.map((s) => (
              <li key={`${s.t}${s.got}`}>
                Cần <Han className="text-lg">{s.t}</Han> ({charInfo(lex, s.t)}) mà chọn <Han className="text-lg">{s.got}</Han> ({charInfo(lex, s.got)})
                {s.n > 1 ? ` · ${s.n} lần` : ''}
              </li>
            ))}
            {sum.sounds.map((s) => (
              <li key={s.key}>
                Gõ sai âm <b>{s.key}</b>
                {s.n > 1 ? ` · ${s.n} lần` : ''}
              </li>
            ))}
            {sum.puncts.map((s) => (
              <li key={`p${s.t}${s.got}`}>
                <PunctSlip t={s.t} got={s.got} />
                {s.n > 1 ? ` · ${s.n} lần` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} onClick={onAgain}>
          {againLabel}
        </button>
        {result.missed.length > 0 && (
          <button type="button" className={btn} onClick={onMissed}>
            Gõ lại {result.missed.length} đề sai
          </button>
        )}
        {extra}
        <a className={btn} href={backHref}>
          Về Gõ chữ
        </a>
      </div>
    </div>
  );
}
