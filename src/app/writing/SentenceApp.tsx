/**
 * Xem cách viết (/viet/cau/?t=…): nhập một câu hay đoạn văn, xem animation nét của từng chữ theo hai kiểu:
 * - Lần lượt: viết hết các nét của chữ này mới sang chữ sau, từ trái qua phải; xong câu thì chạy lại.
 * - Đồng loạt: mọi chữ cùng viết, mỗi chữ chạy độc lập; chữ nào xong thì quay lại nét đầu của chính nó.
 * Chạm vào một chữ: Lần lượt thì chạy lại từ chữ đó, Đồng loạt thì chữ đó viết lại.
 *
 * Pinyin trên mỗi ô chữ, đọc theo ngữ cảnh: tách từ như trang Đọc (银行 → háng, 行走 → xíng). Ba chế độ như trang Đọc:
 * hiện hết, chỉ chữ thuộc từ chưa biết, tắt (chạm chỗ trống trên chữ để xem riêng chữ đó). Chữ có nhiều cách đọc
 * trong HSK: chạm pinyin để đổi; máy đoán thì có dấu "?". Tuỳ chọn hiện âm Hán Việt dưới chữ.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CharRec } from '../../schema/data';
import { loadChar } from '../../lib/data';
import type { HskEntry, ReadTok } from '../../lib/reader';
import { useIsKnown } from '../mine/parts';
import { getSetting, setSetting } from '../../lib/settings';
import { numberedToMarks } from '../../lib/pinyin';
import { DEFAULT_TIMING, StrokeRunner, type RunMode } from '../../lib/stroke-runner';
import { url } from '../../lib/url';
import { MAX_HAN, cellReadings, mainHanviet, mainReadings, splitCells, uniqueHan, type Cell, type CellReading } from '../../lib/writing';
import { loadHsk, readText } from '../reading/readText';
import type { PinyinMode } from '../reading/ReaderText';
import { Han, TONE_CLASS, btn, useQueryParam } from '../ui';
import { AnimatedChar, SPEEDS, TianGrid, type CharHandle, type SpeedKey } from './AnimatedChar';
import { VietNav } from './VietNav';

const SIZES = { nho: { label: 'Nhỏ', px: 56 }, vua: { label: 'Vừa', px: 80 }, lon: { label: 'Lớn', px: 112 } } as const;
type SizeKey = keyof typeof SIZES;

export interface Opts {
  mode: RunMode;
  speed: SpeedKey;
  size: SizeKey;
  outline: boolean;
  radical: boolean;
  loop: boolean;
  /** pinyin trên ô chữ: hết, chữ thuộc từ chưa biết, tắt */
  pinyin: PinyinMode;
  /** âm Hán Việt dưới ô chữ */
  hv: boolean;
}
const DEFAULTS: Opts = { mode: 'sequence', speed: 'vua', size: 'vua', outline: true, radical: false, loop: true, pinyin: 'all', hv: false };
const EXAMPLES = ['我们一起学习汉语。', '今天天气很好，我们去公园吧！'];
const MODE_PARAM: Record<RunMode, string> = { sequence: 'lan-luot', together: 'dong-loat' };
const OPENING = /^[“‘《〈「『【（([]$/u;

/** Nút chọn một trong vài giá trị (radio). */
function Segmented<K extends string>({ label, value, options, onChange }: { label: string; value: K; options: [K, string][]; onChange: (k: K) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-lg border border-line">
      {options.map(([k, text]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={k === value}
          className={`min-h-11 px-3 text-sm ${k === value ? 'bg-accent font-semibold text-accent-ink' : 'hover:bg-accent-soft'}`}
          onClick={() => onChange(k)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function charInfo(rec: CharRec | undefined): string {
  if (!rec) return '';
  return [mainReadings(rec).map(numberedToMarks).join(', '), mainHanviet(rec).join(', ')].filter(Boolean).join(' · ');
}

export default function SentenceApp() {
  const qText = useQueryParam('t');
  const qMode = useQueryParam('kieu');
  const [text, setText] = useState(qText ?? '');
  const [shown, setShown] = useState(qText ?? '');
  const [opts, setOpts] = useState<Opts>(() => ({ ...DEFAULTS, mode: qMode === 'dong-loat' ? 'together' : 'sequence' }));
  const [ready, setReady] = useState(false);
  const composing = useRef(false);

  // cài đặt và câu lần trước (nếu đường dẫn không có câu)
  useEffect(() => {
    Promise.all([getSetting('vietCau'), getSetting('vietCauText')])
      .then(([o, t]) => {
        setOpts((cur) => ({ ...cur, ...o, ...(qMode ? { mode: cur.mode } : {}) }));
        if (qText === null) {
          const first = t || EXAMPLES[0];
          setText(first);
          setShown(first);
        }
      })
      .catch(() => {
        if (qText === null) {
          setText(EXAMPLES[0]);
          setShown(EXAMPLES[0]);
        }
      })
      .finally(() => setReady(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // gõ xong (không còn đang gõ bộ gõ tiếng Trung) 0,5 giây thì vẽ lại
  useEffect(() => {
    if (text === shown) return;
    const id = setTimeout(() => {
      if (!composing.current) setShown(text);
    }, 500);
    return () => clearTimeout(id);
  }, [text, shown]);

  useEffect(() => {
    if (!ready) return;
    void setSetting('vietCau', opts).catch(() => undefined);
  }, [opts, ready]);
  useEffect(() => {
    if (!ready) return;
    void setSetting('vietCauText', shown).catch(() => undefined);
    const p = new URLSearchParams();
    if (shown) p.set('t', shown);
    if (opts.mode === 'together') p.set('kieu', MODE_PARAM.together);
    history.replaceState(null, '', p.size ? `?${p}` : location.pathname);
  }, [shown, opts.mode, ready]);

  const { cells, han, cut } = useMemo(() => splitCells(shown), [shown]);
  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setOpts((o) => ({ ...o, [k]: v }));

  // ---------------------------------------------------------------- pinyin theo ngữ cảnh

  const [toks, setToks] = useState<ReadTok[] | null>(null);
  const hskRef = useRef<Map<string, HskEntry[]> | null>(null);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    setRevealed(new Set());
    if (!ready || !shown.trim()) {
      setToks(null);
      return;
    }
    let alive = true;
    readText(shown.normalize('NFC'))
      .then(async (t) => {
        hskRef.current = await loadHsk();
        if (alive) setToks(t);
      })
      .catch(() => alive && setToks([]));
    return () => {
      alive = false;
    };
  }, [shown, ready]);
  const ctx = useMemo(() => (toks ? cellReadings(toks, han.length) : []), [toks, han.length]);
  // chữ không tách được âm tiết (không có trong từ điển): cách đọc chính của chữ
  const [fallback, setFallback] = useState<ReadonlyMap<number, CellReading>>(new Map());
  useEffect(() => {
    if (!toks) return;
    const miss = han.flatMap((c, i) => (ctx[i] ? [] : [[i, c] as const]));
    setFallback(new Map());
    if (!miss.length) return;
    let alive = true;
    Promise.all(
      miss.map(([i, c]) =>
        loadChar(c)
          .then((x) => [i, c, x?.rec] as const)
          .catch(() => [i, c, undefined] as const),
      ),
    ).then((rows) => {
      if (!alive) return;
      const m = new Map<number, CellReading>();
      for (const [i, c, rec] of rows) {
        const py = mainReadings(rec)[0];
        if (!py) continue;
        m.set(i, {
          p: numberedToMarks(py),
          tone: Number(py.slice(-1)) || 5,
          hv: mainHanviet(rec)[0],
          tok: -1,
          lv: 0,
          alt: mainReadings(rec).length > 1,
          ids: [],
          word: c,
          wordP: numberedToMarks(py),
        });
      }
      setFallback(m);
    });
    return () => {
      alive = false;
    };
  }, [toks, ctx, han]);
  const readingOf = (i: number): CellReading | null => ctx[i] ?? fallback.get(i) ?? null;
  const { known } = useIsKnown();
  /** Các từ HSK cùng chữ với token (để đổi cách đọc), ít nhất hai mới đổi được. */
  const choicesOf = (r: CellReading | null): HskEntry[] => {
    if (!r || r.tok < 0 || !toks) return [];
    const t = toks[r.tok];
    const list = t.kind === 'word' ? (hskRef.current?.get(t.t) ?? []) : [];
    return [...new Map(list.map((e) => [e.p, e])).values()].length > 1 ? list : [];
  };
  /** Đổi token sang cách đọc kế tiếp (theo pinyin khác nhau). */
  const cycle = (r: CellReading) => {
    if (!toks) return;
    const t = toks[r.tok];
    const list = choicesOf(r);
    if (t.kind !== 'word' || !list.length) return;
    const byP = [...new Map(list.map((e) => [e.p, e])).values()];
    const cur = byP.findIndex((e) => e.p === t.p);
    const e = byP[(cur + 1) % byP.length];
    const next = [...toks];
    next[r.tok] = { ...t, p: e.p, hv: e.hv, m: e.m, lv: e.lv, ids: [e.id, ...t.ids.filter((x) => x !== e.id)], alt: false };
    setToks(next);
  };

  // ---------------------------------------------------------------- điều phối animation

  const runner = useRef<StrokeRunner | null>(null);
  const boxes = useRef<(HTMLButtonElement | null)[]>([]);
  const handles = useRef<(CharHandle | null | undefined)[]>([]);
  // mỗi lần đổi câu hoặc tốc độ: bộ điều phối mới và các ô Hanzi Writer mới (khoá theo `gen`)
  const genCounter = useRef(0);
  const gen = useMemo(() => ++genCounter.current, [han, opts.speed, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const [active, setActive] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const modeRef = useRef(opts.mode);
  modeRef.current = opts.mode;

  useEffect(() => {
    if (!ready) return;
    const f = SPEEDS[opts.speed].factor;
    const r = new StrokeRunner(
      han.length,
      {
        onState: (i, s) => {
          const el = boxes.current[i];
          if (el) el.dataset.trangThai = s;
        },
        onActive: setActive,
        onLoop: (i, n) => {
          const el = boxes.current[i];
          if (el) el.dataset.vong = String(n);
        },
        onEnd: () => setEnded(true),
      },
      { charGap: DEFAULT_TIMING.charGap / f, endPause: DEFAULT_TIMING.endPause / f, loopPause: DEFAULT_TIMING.loopPause / f },
    );
    r.loop = opts.loop;
    runner.current = r;
    handles.current = han.map(() => undefined);
    setActive(-1);
    setPaused(false);
    setEnded(false);
    r.play(modeRef.current);
    return () => r.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen]);

  useEffect(() => {
    const r = runner.current;
    if (!r || r.mode === opts.mode) return;
    for (const el of boxes.current) if (el) delete el.dataset.vong;
    setPaused(false);
    setEnded(false);
    r.play(opts.mode);
  }, [opts.mode]);

  useEffect(() => {
    if (runner.current) runner.current.loop = opts.loop;
  }, [opts.loop]);

  // Đồng loạt: chữ ngoài màn hình tạm dừng cho nhẹ máy
  useEffect(() => {
    const r = runner.current;
    if (!r || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const i = Number((e.target as HTMLElement).dataset.i);
        if (Number.isInteger(i)) r.setVisible(i, e.isIntersecting);
      }
    });
    for (const el of boxes.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, [gen]);

  // Lần lượt: chữ đang viết luôn trong tầm nhìn
  useEffect(() => {
    if (opts.mode !== 'sequence' || active < 0) return;
    const el = boxes.current[active];
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, opts.mode]);

  const [info, setInfo] = useState<{ c: string; text: string } | null>(null);
  useEffect(() => {
    if (opts.mode !== 'sequence' || active < 0 || active >= han.length) {
      setInfo(null);
      return;
    }
    const c = han[active];
    let alive = true;
    setInfo({ c, text: '' });
    loadChar(c)
      .then((x) => alive && setInfo({ c, text: charInfo(x?.rec) }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [active, han, opts.mode]);

  const togglePause = () => {
    const r = runner.current;
    if (!r) return;
    if (ended) {
      setEnded(false);
      r.play(opts.mode);
      return;
    }
    if (r.paused) r.resume();
    else r.pause();
    setPaused(r.paused);
  };
  const restart = () => {
    setPaused(false);
    setEnded(false);
    for (const el of boxes.current) if (el) delete el.dataset.vong;
    runner.current?.play(opts.mode);
  };

  const size = SIZES[opts.size].px;
  const unique = useMemo(() => uniqueHan(shown), [shown]);
  const strokesOf = (i: number) => handles.current[i]?.strokes;
  // dấu câu đi liền với chữ đứng trước (không bị đẩy xuống đầu dòng); dấu mở (“《（) đi liền với chữ đứng sau
  const groups = useMemo(() => {
    const out: Cell[][] = [];
    for (const c of cells) {
      const last = out[out.length - 1];
      const prev = last?.[last.length - 1];
      const afterOpen = prev?.kind === 'other' && OPENING.test(prev.c) && (c.kind === 'han' || c.kind === 'other');
      const closing = c.kind === 'other' && !OPENING.test(c.c) && !!prev && prev.kind !== 'space' && prev.kind !== 'break';
      if (last && (afterOpen || closing)) last.push(c);
      else out.push([c]);
    }
    return out;
  }, [cells]);

  const pyFont = Math.max(12, Math.round(size * 0.2));
  const pyRowH = Math.round(pyFont * 1.5);
  const hvFont = Math.max(11, Math.round(size * 0.16));
  const hvRow = Math.round(hvFont * 1.5);
  const pyShown = (i: number, r: CellReading) => opts.pinyin === 'all' || revealed.has(i) || (opts.pinyin === 'new' && !r.ids.some((id) => known(id, r.lv)));
  /** Hàng pinyin trên ô chữ: pinyin (chạm để đổi cách đọc), hoặc chỗ trống chạm để xem khi đang ẩn. */
  const pyRow = (i: number, c: string, r: CellReading | null, isActive: boolean) => {
    const box = 'flex items-end justify-center leading-none whitespace-nowrap';
    const style = { fontSize: pyFont, height: pyRowH, minWidth: Math.round(size * 0.6) };
    if (!r) return <span aria-hidden="true" className={box} style={style} />;
    if (!pyShown(i, r))
      return (
        <button
          type="button"
          className={`${box} rounded text-muted hover:text-ink`}
          style={style}
          aria-label={`Xem pinyin của ${c}`}
          onClick={() => setRevealed((s) => new Set(s).add(i))}
        >
          ···
        </button>
      );
    const multi = choicesOf(r).length > 0;
    const text = (
      <>
        <span className={`${TONE_CLASS[r.tone] ?? ''} ${isActive ? 'font-bold underline decoration-2 underline-offset-2' : ''}`} lang="zh-Latn-pinyin">
          {r.p}
        </span>
        {r.alt && <sup className="text-muted">?</sup>}
      </>
    );
    return multi ? (
      <button
        type="button"
        className={`${box} rounded hover:bg-accent-soft`}
        style={style}
        aria-label={`${c} đọc là ${r.p}${r.alt ? ' (máy đoán)' : ''}: chạm để đổi cách đọc`}
        onClick={() => cycle(r)}
      >
        {text}
      </button>
    ) : (
      <span className={box} style={style}>
        {text}
      </span>
    );
  };

  const renderCell = (cell: Cell, k: number) => {
    if (cell.kind === 'break') return null;
    if (cell.kind === 'space') return <span key={k} style={{ width: Math.round(size * 0.3) }} aria-hidden="true" />;
    if (cell.kind === 'other')
      return (
        <span key={k} className="flex flex-col">
          <span
            className="han flex items-end justify-center pb-1 text-muted"
            lang="zh-CN"
            style={{ height: size, minWidth: Math.round(size * 0.3), fontSize: Math.round(size * 0.45) }}
          >
            {cell.c}
          </span>
          {opts.hv && <span aria-hidden="true" style={{ height: hvRow }} />}
        </span>
      );
    const i = cell.i;
    const isActive = opts.mode === 'sequence' && i === active;
    const r = readingOf(i);
    return (
      <span key={`${gen}-${i}-${cell.c}`} className="inline-flex flex-col items-center">
        {pyRow(i, cell.c, r, isActive)}
        <button
          ref={(el) => {
            boxes.current[i] = el;
          }}
          type="button"
          data-i={i}
          aria-label={`${cell.c}${r && pyShown(i, r) ? ` ${r.p}` : ''}: chạm để viết lại`}
          aria-current={isActive ? 'true' : undefined}
          className={`relative shrink-0 overflow-hidden rounded-md border bg-card ${isActive ? 'border-accent ring-2 ring-accent' : 'border-line'}`}
          style={{ width: size, height: size }}
          onClick={() => {
            setPaused(false);
            setEnded(false);
            runner.current?.restartFrom(i);
          }}
        >
          <TianGrid />
          <AnimatedChar
            c={cell.c}
            size={size}
            speed={opts.speed}
            outline={opts.outline}
            radical={opts.radical}
            onReady={(h) => {
              handles.current[i] = h;
              runner.current?.set(i, h);
            }}
          />
        </button>
        {opts.hv && (
          <span className="block text-center leading-tight whitespace-nowrap text-muted" style={{ fontSize: hvFont, height: hvRow }}>
            {r?.hv ?? ''}
          </span>
        )}
      </span>
    );
  };

  const iconBtn = 'inline-flex size-11 items-center justify-center rounded-lg border text-lg disabled:opacity-50';
  return (
    <div className="space-y-3">
      <VietNav current="cau" />
      <label className="block">
        <span className="text-sm font-semibold">Câu hoặc đoạn văn tiếng Trung</span>
        <textarea
          className="mt-1 block w-full rounded-xl border border-line bg-card p-3 text-xl"
          lang="zh-CN"
          rows={2}
          value={text}
          placeholder="Dán hoặc gõ chữ Hán, ví dụ 我们一起学习汉语。"
          onChange={(e) => setText(e.target.value)}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={(e) => {
            composing.current = false;
            setText(e.currentTarget.value);
          }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
        <span>
          {han.length} chữ Hán{cut ? ` · chỉ hiện ${MAX_HAN} chữ đầu` : ''}
        </span>
        {text ? (
          <button
            type="button"
            className="underline"
            onClick={() => {
              setText('');
              setShown('');
            }}
          >
            Xoá
          </button>
        ) : (
          <>
            <span>Thử:</span>
            {EXAMPLES.map((x) => (
              <button
                key={x}
                type="button"
                className="han rounded-full border border-line px-2 py-0.5 text-ink hover:border-accent"
                lang="zh-CN"
                onClick={() => {
                  setText(x);
                  setShown(x);
                }}
              >
                {x}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="sticky top-0 z-10 -mx-4 space-y-2 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Kiểu xem"
            value={opts.mode}
            options={[
              ['sequence', 'Lần lượt'],
              ['together', 'Đồng loạt'],
            ]}
            onChange={(m) => set('mode', m)}
          />
          <button
            type="button"
            className={`${iconBtn} border-accent bg-accent text-accent-ink`}
            onClick={togglePause}
            disabled={!han.length}
            aria-label={ended ? 'Viết lại' : paused ? 'Chạy tiếp' : 'Dừng'}
            title={ended ? 'Viết lại' : paused ? 'Chạy tiếp' : 'Dừng'}
          >
            {ended || paused ? '▶' : '⏸'}
          </button>
          <button
            type="button"
            className={`${iconBtn} border-line`}
            onClick={restart}
            disabled={!han.length}
            aria-label="Viết lại từ đầu"
            title="Viết lại từ đầu"
          >
            ↺
          </button>
          <Segmented
            label="Tốc độ"
            value={opts.speed}
            options={(Object.keys(SPEEDS) as SpeedKey[]).map((k) => [k, SPEEDS[k].label])}
            onChange={(v) => set('speed', v)}
          />
          <Segmented
            label="Pinyin"
            value={opts.pinyin}
            options={[
              ['all', 'Pinyin: hết'],
              ['new', 'Chữ chưa biết'],
              ['off', 'Tắt'],
            ]}
            onChange={(v) => {
              setRevealed(new Set());
              set('pinyin', v);
            }}
          />
        </div>
        {opts.mode === 'sequence' && active >= 0 && active < han.length ? (
          <p className="text-sm" aria-live="polite">
            <Han className="text-lg">{han[active]}</Han>{' '}
            <span className="text-muted">
              chữ {active + 1}/{han.length}
              {strokesOf(active) ? ` · ${strokesOf(active)} nét` : ''}
            </span>
            {info?.c === han[active] && info.text && <span> · {info.text}</span>}
            {(() => {
              const r = readingOf(active);
              return r && r.word.length > 1 ? (
                <span>
                  {' · trong '}
                  <Han>{r.word}</Han> {r.wordP}
                  {r.m ? ` (${r.m})` : ''}
                </span>
              ) : null;
            })()}
            {' · '}
            <a className="underline" href={url(`chu/?c=${encodeURIComponent(han[active])}`)}>
              Trang chữ
            </a>
          </p>
        ) : (
          <p className="text-sm text-muted">
            {opts.mode === 'sequence'
              ? 'Từng chữ một, từ trái qua phải. Chạm một chữ để bắt đầu từ chữ đó.'
              : 'Mọi chữ cùng viết, chữ nào xong thì viết lại từ nét đầu. Chạm một chữ để viết lại chữ đó.'}
            {opts.pinyin !== 'all' ? ' Chạm ··· trên chữ để xem pinyin.' : ' Pinyin có dấu ? là máy đoán: chạm để đổi cách đọc.'}
          </p>
        )}
      </div>

      {!han.length ? (
        <p className="text-muted">Nhập chữ Hán để xem cách viết.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-1" aria-label="Các chữ">
          {groups.map((g, k) =>
            g[0].kind === 'break' ? (
              <span key={k} className="h-0 basis-full" aria-hidden="true" />
            ) : (
              <span key={k} className="inline-flex items-end gap-1">
                {g.map((cell, j) => renderCell(cell, j))}
              </span>
            ),
          )}
        </div>
      )}

      <details className="rounded-xl border border-line p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Tuỳ chỉnh</summary>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span>Cỡ ô</span>
            <Segmented
              label="Cỡ ô"
              value={opts.size}
              options={(Object.keys(SIZES) as SizeKey[]).map((k) => [k, SIZES[k].label])}
              onChange={(v) => set('size', v)}
            />
          </div>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5" checked={opts.outline} onChange={(e) => set('outline', e.target.checked)} />
            Hiện nét mờ của chữ chưa viết
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5" checked={opts.radical} onChange={(e) => set('radical', e.target.checked)} />
            Tô màu các nét của bộ thủ
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5" checked={opts.hv} onChange={(e) => set('hv', e.target.checked)} />
            Hiện âm Hán Việt dưới chữ
          </label>
          {opts.mode === 'sequence' && (
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-5" checked={opts.loop} onChange={(e) => set('loop', e.target.checked)} />
              Xong câu thì viết lại từ đầu
            </label>
          )}
        </div>
      </details>

      {unique.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <a className={btn} href={url(`viet/?chu=${encodeURIComponent(unique.join(''))}`)}>
            Tập viết các chữ này
          </a>
          <a className={btn} href={url(`viet/in/?chu=${encodeURIComponent(unique.join(''))}`)}>
            In 田字格 các chữ này
          </a>
        </div>
      )}
    </div>
  );
}
