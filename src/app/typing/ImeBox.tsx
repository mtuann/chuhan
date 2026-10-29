/**
 * Ô gõ tiếng Trung bằng bộ gõ pinyin của app: gõ pinyin không dấu thanh, chọn chữ bằng phím số, phím cách, Enter hoặc
 * chạm vào gợi ý. Mỗi gợi ý có pinyin có dấu, âm Hán Việt và nghĩa để phân biệt chữ cùng âm (在 tại / 再 tái).
 *
 * Sửa được như ô chữ thường: con trỏ nằm giữa các chữ đã gõ (chạm vào chữ hoặc phím ←, →, Home, End để đặt), gõ tiếp là
 * chèn tại con trỏ, ⌫/Delete xoá chữ trước/sau con trỏ (Ctrl+⌫ xoá cả từ). Chạm vào một chữ đã gõ thì hiện các chữ cùng
 * âm để chọn lại (đổi 再 thành 在), chọn xong con trỏ về chỗ cũ để gõ tiếp; chạm vào một dấu câu đã gõ thì hiện các dấu
 * để đổi (， thành 、). Chỗ sai (sau khi chấm) tô đỏ, chỗ thiếu hiện ô trống: chạm vào là đặt con trỏ ở đó. Hàng nút dấu
 * câu (tuỳ chọn) để gõ dấu trên điện thoại.
 *
 * Dùng bộ gõ tiếng Trung của máy cũng được (chữ Hán gõ vào được nhận luôn, chèn tại con trỏ). Bộ gõ tiếng Việt (Telex,
 * VNI) đang bật thì nhắc tắt.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { loadAllSearchRows } from '../../lib/data';
import { PUNCT, addNames, buildImeLexicon, candidates, hasVietnamese, rest, showInput, type Candidate, type ImeLexicon } from '../../lib/ime';
import { isZhPunct, punctInfo, type TypedChar, type TypedMarks } from '../../lib/typing';
import { Han, Pinyin } from '../ui';

// ---------------------------------------------------------------- từ điển gợi ý

let lexP: Promise<ImeLexicon> | null = null;
/** Từ điển gợi ý (mọi từ HSK), dựng một lần cho cả trang. */
export function loadImeLexicon(): Promise<ImeLexicon> {
  lexP ??= loadAllSearchRows()
    .then((rows) => buildImeLexicon(rows))
    .catch((e: unknown) => {
      lexP = null;
      throw e;
    });
  return lexP;
}

/** Từ điển gợi ý; `names`: tên riêng của bài đang luyện ([chữ, pinyin]). */
export function useImeLexicon(names?: readonly (readonly [string, string])[]): { lex: ImeLexicon | null; error: string | null } {
  const [lex, setLex] = useState<ImeLexicon | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadImeLexicon()
      .then((l) => {
        if (names?.length) addNames(l, names);
        if (alive) setLex(l);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [names]);
  return { lex, error };
}

// ---------------------------------------------------------------- chọn lại chữ

const PAGE = 9;
const isHan = (c: string) => /\p{Script=Han}/u.test(c);
/** Hàng nút dấu câu (điện thoại khó tìm phím \\ để gõ 、, phím ^ để gõ ……). */
const BAR = ['，', '。', '、', '？', '！', '：', '“', '”', '……'];

/**
 * Dấu câu ứng với phím `k` (không có chuỗi pinyin): " thành “ hay ”, ' thành ‘ hay ’ tuỳ trước con trỏ đã có dấu mở
 * chưa đóng; `depth`: số ngoặc kép “ đã mở từ trước ô gõ (câu trước của cùng đoạn văn).
 */
function punctFor(k: string, before: readonly TypedChar[], depth = 0): string {
  if (k !== '"' && k !== "'") return PUNCT[k] ?? '';
  const [o, c] = k === '"' ? ['“', '”'] : ['‘', '’'];
  let open = k === '"' ? depth : 0;
  for (const x of before) {
    if (x.c === o) open++;
    else if (x.c === c) open = Math.max(0, open - 1);
  }
  return open > 0 ? c : o;
}
const punctChars = (m: string): TypedChar[] => {
  const g = newGroup();
  return [...m].map((c) => ({ c, g }));
};

/** Mỗi lần chọn một từ là một nhóm: chọn lại thì đổi cả từ (学校 → 学笑 không có; 时间 → 事件). */
let lastGroup = 0;
const newGroup = () => ++lastGroup;

/** Các chữ của một gợi ý, mỗi từ (câu ghép thì từng từ thành phần) một nhóm. */
function charsOf(c: Candidate): TypedChar[] {
  return (c.e.parts ?? [c.e]).flatMap((p) => {
    const g = newGroup();
    return [...p.t].map((ch, k) => ({ c: ch, syl: p.syl[k], g }));
  });
}

/** Khoảng [đầu, cuối) của nhóm chứa chữ thứ i. */
export function groupRange(v: readonly TypedChar[], i: number): [number, number] {
  const g = v[i]?.g;
  if (g === undefined) return [i, i + 1];
  let s = i;
  let e = i + 1;
  while (s > 0 && v[s - 1].g === g) s--;
  while (e < v.length && v[e].g === g) e++;
  return [s, e];
}

/** Cách gõ của các chữ: theo âm đã gõ; chữ gõ bằng bộ gõ của máy (chưa biết âm) thì mọi âm của chữ đó. */
function keysOf(lex: ImeLexicon, chars: readonly TypedChar[]): string[] {
  if (chars.every((x) => x.syl)) return [chars.map((x) => x.syl).join("'")];
  if (chars.length === 1) return [...(lex.charSyl.get(chars[0].c) ?? [])];
  return [];
}

/**
 * Các chữ (từ) cùng cách gõ để chọn lại, hay gặp trước; không gồm chính nó. Chỉ lấy đúng các âm tiết đó (先 xian không
 * gợi ý 想 xiang: gợi ý gõ dở của bộ gõ ở đây sẽ dạy nhầm -n/-ng).
 */
export function alternatives(lex: ImeLexicon, chars: readonly TypedChar[]): { cur?: Candidate; alts: Candidate[] } {
  const text = chars.map((x) => x.c).join('');
  const n = chars.length;
  const keys = keysOf(lex, chars);
  const exact = new Set(keys);
  const all = keys.flatMap((k) => candidates(lex, k, 80));
  const fits = all.filter((c) => c.full && !c.e.parts && [...c.e.t].length === n && exact.has(c.e.syl.join("'"))).sort((a, b) => a.score - b.score);
  const seen = new Set<string>();
  let cur: Candidate | undefined;
  const alts: Candidate[] = [];
  for (const c of fits) {
    if (seen.has(c.e.t)) continue;
    seen.add(c.e.t);
    if (c.e.t === text) cur ??= c;
    else alts.push(c);
  }
  return { cur, alts: alts.slice(0, 45) };
}

// ---------------------------------------------------------------- danh sách gợi ý

function CandidateList({
  items,
  page,
  label,
  showInfo,
  onPick,
  stripRef,
}: {
  items: readonly Candidate[];
  page: number;
  label: string;
  showInfo: boolean;
  onPick: (c: Candidate) => void;
  stripRef: RefObject<HTMLOListElement | null>;
}) {
  return (
    // điện thoại: một dải vuốt ngang chứa mọi gợi ý (như Gboard); màn hình rộng: chỉ các gợi ý của trang đang xem, xuống
    // dòng khi không đủ chỗ, để thấy hết 9 chữ có số mà chọn bằng phím (như bộ gõ trên máy tính)
    <ol ref={stripRef} aria-label={label} className="relative flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
      {items.map((c, k) => {
        const n = k - page * PAGE;
        const num = n >= 0 && n < PAGE ? n + 1 : null;
        return (
          <li key={c.e.t} data-k={k} className={`shrink-0 ${num ? '' : 'sm:hidden'}`}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(c)}
              aria-label={`${num ? `${num}: ` : ''}${c.e.t} ${c.e.p}${c.e.hv ? `, Hán Việt ${c.e.hv}` : ''}${c.e.m ? `, ${c.e.m}` : ''}`}
              className={`flex min-h-14 flex-col items-start rounded-lg border px-2.5 py-1 text-left whitespace-nowrap hover:border-accent ${k === page * PAGE ? 'border-accent bg-accent-soft' : 'border-line bg-card'}`}
            >
              <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                {num && <span className="text-xs text-muted tabular-nums">{num}</span>}
                <Han className="text-xl">{c.e.t}</Han>
                {c.e.p && <Pinyin p={c.e.p} className="text-xs" />}
              </span>
              {showInfo && (c.e.hv || c.e.m || c.e.of) && (
                <span className="max-w-40 truncate text-[11px] text-muted">
                  {c.e.hv && <span className="font-semibold">{c.e.hv}</span>}
                  {c.e.m ? ` · ${c.e.m}` : c.e.of ? ` · trong ${c.e.of}` : ''}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Dòng trên danh sách gợi ý: chữ đang gõ hoặc chữ đang chọn lại, nút sang trang, nút đóng (`end`). */
function ListHeader({
  children,
  page,
  pages,
  setPage,
  end,
}: {
  children: ReactNode;
  page: number;
  pages: number;
  setPage: (f: (p: number) => number) => void;
  end?: ReactNode;
}) {
  return (
    <div className="mb-1 flex min-h-9 items-center gap-2 text-xs text-muted">
      <p className="min-w-0">{children}</p>
      <span className="ml-auto flex items-center gap-1">
        {pages > 1 && (
          <>
            <button
              type="button"
              className="min-h-9 rounded px-2 hover:bg-accent-soft"
              aria-label="Gợi ý trước"
              title="Gợi ý trước (phím - hoặc PageUp)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ‹
            </button>
            <span className="tabular-nums">
              {page + 1}/{pages}
            </span>
            <button
              type="button"
              className="min-h-9 rounded px-2 hover:bg-accent-soft"
              aria-label="Gợi ý sau"
              title="Gợi ý sau (phím = hoặc PageDown)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            >
              ›
            </button>
          </>
        )}
        {end}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- ô gõ

/** Chọn lại: chữ thứ `at` (nhóm chứa nó); `back`: chỗ con trỏ trước khi chạm, chọn xong thì về lại đó. */
interface RePick {
  at: number;
  back?: number;
}

export function ImeBox({
  lex,
  value,
  onChange,
  onEnter,
  label,
  placeholder = 'Gõ pinyin, ví dụ: nihao',
  showInfo = true,
  autoFocus = false,
  size = 'lg',
  marks,
  refocus,
  punctBar = false,
  quoteDepth = 0,
}: {
  lex: ImeLexicon | null;
  /** các chữ đã gõ xong */
  value: readonly TypedChar[];
  onChange: (v: TypedChar[]) => void;
  /** Enter khi không còn pinyin đang gõ (nộp bài) */
  onEnter?: () => void;
  /** tên ô để đọc màn hình */
  label: string;
  placeholder?: string;
  /** hiện Hán Việt và nghĩa trong gợi ý */
  showInfo?: boolean;
  autoFocus?: boolean;
  size?: 'lg' | 'md';
  /** chỗ sai, chỗ thiếu trên các chữ đã gõ (sau khi chấm) */
  marks?: TypedMarks;
  /** đổi giá trị thì đặt lại con trỏ vào ô (sau khi bấm nút ngoài ô) */
  refocus?: number;
  /** hiện hàng nút dấu câu ，。、？！：“” (khi không gõ dở pinyin) */
  punctBar?: boolean;
  /** số ngoặc kép “ đã mở mà chưa đóng trước ô gõ (gõ theo đoạn văn: lời nói trải qua nhiều câu) */
  quoteDepth?: number;
}) {
  const [comp, setComp] = useState('');
  const [page, setPage] = useState(0);
  const [viWarn, setViWarn] = useState(false);
  const [caret, setCaret] = useState(value.length);
  const [pick, setPick] = useState<RePick | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLOListElement>(null);
  const composing = useRef(false);
  // mảng chữ do chính ô này đưa ra: nơi khác thay `value` (xoá hết, sang đề mới) thì con trỏ về cuối
  const emitted = useRef<readonly TypedChar[]>(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (value !== emitted.current) {
      emitted.current = value;
      setCaret(value.length);
      setPick(null);
    }
  }
  const cur = Math.min(caret, value.length);

  const cands = useMemo(() => (lex && comp ? candidates(lex, comp) : []), [lex, comp]);
  const pickRange = pick && pick.at < value.length && !comp ? groupRange(value, pick.at) : null;
  /** đang chọn lại một dấu câu (chạm vào dấu): hiện các dấu để đổi */
  const picked = pickRange ? value.slice(pickRange[0], pickRange[1]) : [];
  const punctPick = picked.length > 0 && picked.every((x) => isZhPunct(x.c));
  const repick = useMemo(
    () => (lex && pickRange && !punctPick ? alternatives(lex, value.slice(pickRange[0], pickRange[1])) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lex, value, pickRange?.[0], pickRange?.[1]],
  );
  const list = comp ? cands : (repick?.alts ?? []);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));

  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  useEffect(() => {
    if (refocus) input.current?.focus({ preventScroll: true });
  }, [refocus]);
  const descId = useId();
  useEffect(() => setPage(0), [comp, pick]);
  // danh sách mới thì về đầu; đổi trang thì cuộn tới gợi ý đầu trang (cuộn trong dải gợi ý, không cuộn cả trang)
  useLayoutEffect(() => {
    const el = strip.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>(`[data-k="${page * PAGE}"]`);
    el.scrollLeft = page && first ? first.offsetLeft : 0;
  }, [page, list]);

  const focus = () => input.current?.focus({ preventScroll: true });
  const emit = (next: TypedChar[], nextCaret: number) => {
    emitted.current = next;
    setCaret(nextCaret);
    setPick(null);
    onChange(next);
  };
  /** Chèn các chữ tại con trỏ; `restComp`: phần pinyin còn lại sau khi chọn. */
  const insert = (chars: TypedChar[], restComp = '') => {
    if (chars.length) emit([...value.slice(0, cur), ...chars, ...value.slice(cur)], cur + chars.length);
    setComp(restComp);
  };
  const choose = (c: Candidate | undefined) => {
    if (c) insert(charsOf(c), rest(comp, c));
    focus();
  };
  /** Chọn lại: thay nhóm đang chọn bằng các chữ (dấu) mới, con trỏ về chỗ cũ. */
  const replaceWith = (chars: TypedChar[]) => {
    if (!pickRange || !pick) return;
    const [s, e] = pickRange;
    const delta = chars.length - (e - s);
    const back = pick.back ?? cur;
    emit([...value.slice(0, s), ...chars, ...value.slice(e)], back >= e ? back + delta : back <= s ? back : s + chars.length);
    focus();
  };
  const replace = (c: Candidate | undefined) => {
    if (c) replaceWith(charsOf(c));
  };

  /** Xử lý giá trị ô nhập (gõ phím, dán, bộ gõ của máy). */
  const take = (raw: string) => {
    if (hasVietnamese(raw)) {
      setViWarn(true);
      setComp('');
      return;
    }
    // ü gõ v; dấu nháy cong sau chữ cái (bàn phím tự đổi ' thành ’) là dấu tách âm tiết xi'an
    let v = raw.replace(/ü/gi, 'v').replace(/([a-z])[‘’]/gi, "$1'");
    const ins: TypedChar[] = [];
    // chữ Hán, dấu câu tiếng Trung từ bộ gõ của máy hoặc dán vào: nhận luôn, dấu nửa khổ đi kèm đổi ra toàn khổ, giữ thứ tự
    if ([...v].some((c) => isHan(c) || isZhPunct(c))) {
      let left = '';
      for (const c of v)
        if (isHan(c) || isZhPunct(c)) ins.push({ c, g: newGroup() });
        else if (PUNCT[c] || c === '"') ins.push(...punctChars(punctFor(c, [...value.slice(0, cur), ...ins], quoteDepth)));
        else left += c;
      v = left;
    }
    // phím cách, số, dấu câu gõ trên bàn phím điện thoại (không bắt được ở keydown)
    const last = v.slice(-1);
    const letters = v.slice(0, -1).toLowerCase().replace(/[^a-z']/g, '');
    const listOf = () => (lex && letters ? (letters === comp ? cands : candidates(lex, letters)) : []);
    let restComp = v.toLowerCase().replace(/[^a-z']/g, '');
    if (last === ' ' && letters) {
      const c = listOf()[0];
      if (c) ins.push(...charsOf(c));
      restComp = c ? rest(letters, c) : letters;
    } else if (/[1-9]/.test(last) && letters) {
      const l = listOf();
      const c = l[(letters === comp ? page * PAGE : 0) + Number(last) - 1] ?? l[0];
      if (c) ins.push(...charsOf(c));
      restComp = c ? rest(letters, c) : letters;
    } else if (PUNCT[last] || last === '"' || (last === "'" && !letters)) {
      // ' đang gõ pinyin là dấu tách âm tiết (xi'an), chưa gõ gì thì ra ‘ ’
      if (letters) {
        const c = listOf()[0];
        if (c) ins.push(...charsOf(c), ...punctChars(punctFor(last, [...value.slice(0, cur), ...ins], quoteDepth)));
        restComp = c ? rest(letters, c) : letters;
      } else {
        ins.push(...punctChars(punctFor(last, [...value.slice(0, cur), ...ins], quoteDepth)));
        restComp = '';
      }
    }
    insert(ins, restComp);
  };

  /**
   * Đặt con trỏ (không đổi chữ); `p`: chữ hiện danh sách chọn lại (chữ Hán: các chữ cùng âm; dấu câu bị chấm sai, chỉ
   * khi chạm vào dấu (có `back`): các dấu để đổi).
   */
  const moveTo = (to: number, p: RePick | null = null) => {
    setCaret(Math.max(0, Math.min(value.length, to)));
    const c = p && p.at >= 0 && p.at < value.length ? value[p.at].c : '';
    setPick(p && c && (isHan(c) || (p.back !== undefined && isZhPunct(c) && !!marks?.bad.has(p.at))) ? p : null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const k = e.key;
    if (comp) {
      if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        choose(cands[page * PAGE] ?? cands[0]);
      } else if (/^[1-9]$/.test(k)) {
        e.preventDefault();
        choose(cands[page * PAGE + Number(k) - 1]);
      } else if (k === 'ArrowRight' || k === '=' || k === ']' || k === 'PageDown') {
        e.preventDefault();
        setPage((p) => Math.min(pages - 1, p + 1));
      } else if (k === 'ArrowLeft' || k === '-' || k === '[' || k === 'PageUp') {
        e.preventDefault();
        setPage((p) => Math.max(0, p - 1));
      } else if (k === 'Escape') {
        e.preventDefault();
        setComp('');
      }
      return;
    }
    const word = e.ctrlKey || e.altKey || e.metaKey;
    if (repick && /^[1-9]$/.test(k)) {
      e.preventDefault();
      replace(repick.alts[page * PAGE + Number(k) - 1]);
    } else if (repick && (k === '=' || k === ']' || k === 'PageDown')) {
      e.preventDefault();
      setPage((p) => Math.min(pages - 1, p + 1));
    } else if (repick && (k === '-' || k === '[' || k === 'PageUp')) {
      e.preventDefault();
      setPage((p) => Math.max(0, p - 1));
    } else if (k === 'Enter') {
      e.preventDefault();
      // giữ phím Enter (tự lặp) không nộp liên tục; Safari: Enter kết thúc gõ của bộ gõ máy có keyCode 229
      if (!e.repeat && (e.nativeEvent as { keyCode?: number }).keyCode !== 229) onEnter?.();
    } else if (k === 'Backspace' && cur > 0) {
      e.preventDefault();
      const s = word ? groupRange(value, cur - 1)[0] : cur - 1;
      emit([...value.slice(0, s), ...value.slice(cur)], s);
    } else if (k === 'Delete' && cur < value.length) {
      e.preventDefault();
      const end = word ? groupRange(value, cur)[1] : cur + 1;
      emit([...value.slice(0, cur), ...value.slice(end)], cur);
    } else if (k === 'ArrowLeft' && cur > 0) {
      e.preventDefault();
      const to = word ? groupRange(value, cur - 1)[0] : cur - 1;
      moveTo(to, to > 0 ? { at: to - 1 } : null);
    } else if (k === 'ArrowRight' && cur < value.length) {
      e.preventDefault();
      const to = word ? groupRange(value, cur)[1] : cur + 1;
      moveTo(to, { at: to - 1 });
    } else if (k === 'Home' || k === 'End') {
      e.preventDefault();
      moveTo(k === 'Home' ? 0 : value.length);
    } else if (k === 'Escape' && pick) {
      e.preventDefault();
      setPick(null);
    }
  };

  /** Chạm vào ô: chạm vào chữ thì đặt con trỏ trước/sau chữ (theo nửa chữ được chạm) và hiện chữ cùng âm để chọn lại. */
  const onBoxClick = (e: MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t !== input.current && !comp) {
      const el = t.closest<HTMLElement>('[data-i],[data-gap]');
      if (el?.dataset.gap) moveTo(Number(el.dataset.gap));
      else if (el?.dataset.i) {
        const i = Number(el.dataset.i);
        const r = el.getBoundingClientRect();
        moveTo(e.clientX > r.left + r.width / 2 ? i + 1 : i, { at: i, back: cur });
      } else if (!t.closest('button')) moveTo(value.length);
    }
    focus();
  };

  const big = size === 'lg' ? 'text-3xl' : 'text-2xl';
  const char = (x: TypedChar, i: number) => {
    const gap = marks?.gaps.get(i);
    const inPick = pickRange && i >= pickRange[0] && i < pickRange[1];
    const cls = marks?.bad.has(i) ? 'bg-t1/10 text-t1' : marks?.extra.has(i) ? 'text-t1 line-through decoration-2' : '';
    return (
      <span key={i}>
        {gap && i !== cur ? <Gap at={i} n={gap} /> : null}
        <span data-i={i} className={`rounded ${cls} ${inPick ? 'bg-accent-soft ring-2 ring-accent' : ''}`}>
          {x.c}
        </span>
      </span>
    );
  };
  const endGap = marks?.gaps.get(value.length);
  const empty = !value.length;
  // cho trình đọc màn hình: ô nhập chỉ chứa pinyin đang gõ, nên mô tả chữ đã gõ, vị trí con trỏ, chỗ sai
  const describe = () => {
    if (empty) return 'Chưa gõ chữ nào.';
    const text = value.map((x) => x.c).join('');
    const at = cur === value.length ? 'ở cuối' : cur === 0 ? 'ở đầu' : `sau chữ ${value[cur - 1].c}, chữ thứ ${cur} trên ${value.length}`;
    const bad = marks ? [...marks.bad].map((i) => value[i]?.c).join(' ') : '';
    const extra = marks ? [...marks.extra].map((i) => value[i]?.c).join(' ') : '';
    const gaps = marks ? [...marks.gaps.values()].reduce((x, y) => x + y, 0) : 0;
    return [`Đã gõ: ${text}.`, `Con trỏ ${at}.`, bad && `Chữ sai: ${bad}.`, extra && `Chữ thừa: ${extra}.`, gaps && `Thiếu ${gaps} chữ.`].filter(Boolean).join(' ');
  };

  return (
    <div>
      <div
        className={`flex min-h-16 cursor-text items-start gap-1 rounded-xl border-2 bg-card py-2 pr-1 pl-3 focus-within:border-accent ${viWarn ? 'border-t1' : 'border-line'}`}
        onMouseDown={(e) => {
          // giữ con trỏ trong ô nhập khi chạm vào chữ (không làm mất bàn phím trên điện thoại)
          if (e.target !== input.current) e.preventDefault();
        }}
        onClick={onBoxClick}
      >
        <div className="min-w-0 flex-1 self-center">
          <span data-testid="go-da-go" className={`han ${big} leading-normal break-all`}>
            <span>{value.slice(0, cur).map((x, i) => char(x, i))}</span>
            <input
              ref={input}
              value={comp}
              onChange={(e) => {
                if (composing.current || (e.nativeEvent as InputEvent).isComposing) setComp(e.target.value.toLowerCase());
                else take(e.target.value);
              }}
              onCompositionStart={() => (composing.current = true)}
              onCompositionEnd={(e) => {
                composing.current = false;
                take((e.target as HTMLInputElement).value);
              }}
              onKeyDown={onKeyDown}
              aria-label={label}
              aria-describedby={viWarn ? `canh-bao-telex ${descId}` : descId}
              placeholder={empty ? placeholder : ''}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="done"
              inputMode="text"
              lang="en"
              style={empty || comp ? (comp ? { width: `${comp.length + 1}ch` } : undefined) : { width: '4px' }}
              className={`inline-block bg-transparent p-0 font-mono text-ink outline-none placeholder:font-sans placeholder:text-base placeholder:text-muted ${
                empty && !comp
                  ? 'w-full align-baseline text-xl caret-accent'
                  : comp
                    ? 'align-baseline text-xl underline decoration-accent decoration-2 underline-offset-4 caret-accent'
                    : // con trỏ giữa các chữ: vạch màu nhấp nháy cao bằng chữ Hán (con trỏ thật của ô nhập quá nhỏ, dễ lẫn)
                      'ime-caret h-[1em] align-[-0.15em] text-[1em] leading-none caret-transparent'
              }`}
            />
            <span>
              {value.slice(cur).map((x, k) => char(x, cur + k))}
              {endGap && cur !== value.length ? <Gap at={value.length} n={endGap} /> : null}
            </span>
          </span>
        </div>
        <span id={descId} className="sr-only">
          {describe()}
        </span>
        {!empty && (
          <div className="flex shrink-0 flex-col">
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-accent-soft hover:text-ink disabled:opacity-30"
              aria-label="Xoá chữ trước con trỏ"
              title="Xoá chữ trước con trỏ (⌫)"
              disabled={cur === 0}
              onClick={() => cur > 0 && emit([...value.slice(0, cur - 1), ...value.slice(cur)], cur - 1)}
            >
              ⌫
            </button>
            {cur < value.length && (
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-accent-soft hover:text-ink"
                aria-label="Đưa con trỏ về cuối"
                title="Đưa con trỏ về cuối (End)"
                onClick={() => moveTo(value.length)}
              >
                ⇥
              </button>
            )}
          </div>
        )}
      </div>

      {viWarn && <VietnameseKeyboardWarning onClose={() => setViWarn(false)} />}

      {comp ? (
        <div className="mt-2">
          <ListHeader page={page} pages={pages} setPage={setPage}>
            <span className="font-mono">{showInput(comp)}</span>
          </ListHeader>
          {cands.length ? (
            <CandidateList items={cands} page={page} label="Chữ gợi ý" showInfo={showInfo} onPick={choose} stripRef={strip} />
          ) : (
            <p className="text-sm text-muted">{lex ? 'Không có chữ nào ứng với cách gõ này. Kiểm tra lại pinyin (ü gõ bằng v).' : 'Đang tải từ điển gợi ý…'}</p>
          )}
        </div>
      ) : punctPick ? (
        <div className="mt-2">
          <div className="flex min-h-9 items-center justify-between gap-2 text-sm text-muted">
            <span>
              Đổi dấu <Han className="text-base text-ink">{picked.map((x) => x.c).join('')}</Han> thành:
            </span>
            <button
              type="button"
              className="min-h-9 min-w-9 rounded px-2 text-muted hover:bg-accent-soft"
              aria-label="Đóng danh sách đổi dấu"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPick(null)}
            >
              ✕
            </button>
          </div>
          <PunctButtons label="Đổi dấu" skip={picked.map((x) => x.c).join('')} onPick={(m) => replaceWith(punctChars(m))} />
        </div>
      ) : repick && pickRange ? (
        <div className="mt-2">
          <ListHeader
            page={page}
            pages={pages}
            setPage={setPage}
            end={
              <button
                type="button"
                className="min-h-9 min-w-9 rounded px-2 text-muted hover:bg-accent-soft"
                aria-label="Đóng danh sách chọn lại"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setPick(null)}
              >
                ✕
              </button>
            }
          >
            Chọn lại <Han className="text-base text-ink">{value.slice(pickRange[0], pickRange[1]).map((x) => x.c).join('')}</Han>
            {repick.cur?.e.p ? (
              <>
                {' '}
                <Pinyin p={repick.cur.e.p} />
              </>
            ) : null}
            {repick.cur?.e.hv ? ` · ${repick.cur.e.hv}` : ''}
            {repick.alts.length ? ' thành:' : ''}
          </ListHeader>
          {repick.alts.length ? (
            <CandidateList items={repick.alts} page={page} label="Chọn lại chữ" showInfo={showInfo} onPick={replace} stripRef={strip} />
          ) : (
            <p className="text-sm text-muted">Không có chữ nào khác cùng cách gõ. Xoá chữ này (⌫) rồi gõ lại.</p>
          )}
        </div>
      ) : punctBar ? (
        <div className="mt-2">
          <PunctButtons
            label="Dấu câu"
            onPick={(m) => {
              insert(punctChars(m));
              focus();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Hàng nút dấu câu (kèm phím gõ khi có bàn phím): chèn dấu tại con trỏ, hoặc đổi dấu đang chọn (`skip`: dấu đang có). */
function PunctButtons({ label, onPick, skip }: { label: string; onPick: (m: string) => void; skip?: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {BAR.filter((m) => m !== skip).map((m) => (
        <button
          key={m}
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2 hover:border-accent"
          aria-label={`${punctInfo(m).name} ${m}`}
          title={`${punctInfo(m).name} ${m}: phím ${punctInfo(m).key}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(m)}
        >
          <Han className="text-xl leading-none">{m}</Han>
          <span className="font-mono text-[11px] text-muted pointer-coarse:hidden">{punctInfo(m).key}</span>
        </button>
      ))}
    </div>
  );
}

/** Ô trống chỗ thiếu chữ: chạm vào để đặt con trỏ ở đó. */
function Gap({ at, n }: { at: number; n: number }) {
  return (
    <span
      data-gap={at}
      role="img"
      aria-label={n > 1 ? `Thiếu ${n} chữ ở đây` : 'Thiếu chữ ở đây'}
      data-n={n > 1 ? n : ''}
      className="mx-0.5 inline-flex h-[1em] min-w-[0.8em] items-center justify-center rounded border-2 border-dashed border-t1 bg-t1/5 align-[-0.15em] font-sans text-t1 after:text-xs after:font-semibold after:content-[attr(data-n)]"
    />
  );
}

/** Nhắc tắt bộ gõ tiếng Việt khi ô gõ nhận được chữ có dấu tiếng Việt. */
export function VietnameseKeyboardWarning({ onClose }: { onClose: () => void }) {
  return (
    <div id="canh-bao-telex" role="alert" className="mt-2 rounded-xl border border-t1 p-3 text-sm">
      <p className="font-semibold">Bộ gõ tiếng Việt đang bật</p>
      <p className="mt-1">
        Telex, VNI biến s, f, r, x, j, w thành dấu (xuexi thành chữ có dấu). Tắt nó khi gõ pinyin: Unikey, EVKey bấm phím tắt chuyển (thường là Ctrl+Shift
        hoặc Alt+Z) hoặc chuột vào biểu tượng V để thành E; macOS và điện thoại thì đổi sang bàn phím tiếng Anh.
      </p>
      <button type="button" className="mt-1 min-h-9 text-muted underline" onClick={onClose}>
        Đã tắt, gõ tiếp
      </button>
    </div>
  );
}
