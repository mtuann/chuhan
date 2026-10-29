/**
 * Một chữ: hình chữ, cách đọc, Hán Việt, nghĩa, số nét, bộ, cấp, 3 từ chứa chữ.
 * Các mục mở khi chạm, mỗi lần một mục: Nét (xem nét, viết thử) · Cấu tạo · Mẹo thanh · Mẹo nhớ của bạn.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type HanziWriter from 'hanzi-writer';
import type { CharRec, DictEntry } from '../../schema/data';
import { getNote, setNote } from '../../lib/db';
import { gradeWriting, GRADE_VI } from '../../lib/grade';
import { toneHint } from '../../lib/hanviet';
import { numberedToMarks, parseNumbered } from '../../lib/pinyin';
import type { BriefEntry } from '../../lib/search-protocol';
import { ETYMOLOGY_VI, fmtInt, idsComponents, isHan, levelLabel, packKey } from '../../lib/text';
import { strokeUrl } from '../../lib/data';
import { url } from '../../lib/url';
import { RadicalLine } from './Radical';
import { Han, LevelBadge, NumberedSyllable, Pill, Pinyin, SpeakButtons, Unreviewed, btn, btnPrimary } from '../ui';

export interface StrokeData {
  strokes: string[];
  medians: number[][][];
  radStrokes?: number[];
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Ô 田字格 với chữ vẽ từ dữ liệu nét; `highlight` tô màu các nét của bộ. */
export function StaticGlyph({
  c,
  data,
  className = 'size-32 sm:size-40',
  highlight = false,
}: {
  c: string;
  data?: StrokeData | null;
  className?: string;
  highlight?: boolean;
}) {
  return (
    <svg viewBox="0 0 1024 1024" role="img" aria-label={`Chữ ${c}`} className={`shrink-0 rounded-xl border border-line bg-paper ${className}`}>
      <g stroke="var(--line)" strokeWidth="6" strokeDasharray="24 24">
        <line x1="512" y1="0" x2="512" y2="1024" />
        <line x1="0" y1="512" x2="1024" y2="512" />
      </g>
      {data ? (
        <g transform="translate(0, 900) scale(1, -1)">
          {data.strokes.map((d, i) => (
            <path key={i} d={d} fill={highlight && data.radStrokes?.includes(i) ? 'var(--accent)' : 'currentColor'} />
          ))}
        </g>
      ) : (
        <text x="512" y="540" fontSize="760" textAnchor="middle" dominantBaseline="middle" fill="currentColor" lang="zh-CN" className="han">
          {c}
        </text>
      )}
    </svg>
  );
}

type Panel = 'net' | 'cau-tao' | 'meo-thanh' | 'ghi-chu';

export default function CharView({
  c,
  rec,
  strokes,
  words,
  meanings,
}: {
  c: string;
  rec?: CharRec;
  strokes?: StrokeData | null;
  words?: BriefEntry[] | null;
  meanings?: DictEntry[] | null;
}) {
  const [open, setOpen] = useState<Panel | null>(null);

  const readings = rec?.py ?? [...new Set((meanings ?? []).map((m) => m[2].toLowerCase().replace(/u:/g, 'v')))].filter((k) => /^[a-z]+[1-5]$/.test(k));
  const hv = rec?.hv ?? {};
  const hvList: { key: string; r: string[] }[] = [
    ...readings.filter((k) => hv[k]).map((k) => ({ key: k, r: hv[k] })),
    ...(hv['*'] ? [{ key: '*', r: hv['*'] }] : []),
    // Hán Việt theo cách đọc không còn dùng trong HSK (ví dụ 干 qián): chỉ hiện trong Cấu tạo
  ];
  const gloss = (meanings ?? []).filter((m) => m[0] === c);
  const toggle = (p: Panel) => setOpen((cur) => (cur === p ? null : p));

  return (
    <article className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {rec?.lv.r25 ? <LevelBadge level={rec.lv.r25} /> : <Pill>Ngoài danh sách chữ HSK 2025</Pill>}
        {rec?.lv.w25 ? <Pill>Viết tay {levelLabel(rec.lv.w25)}</Pill> : null}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <StaticGlyph c={c} data={strokes} />
        <div className="min-w-[9.5rem] flex-1 space-y-3">
          <h1 className="sr-only">Chữ {c}</h1>
          {readings.length > 0 && (
            <p className="text-2xl">
              {readings.map((k, i) => (
                <span key={k}>
                  {i > 0 && <span className="text-muted"> · </span>}
                  <NumberedSyllable s={k} />
                </span>
              ))}
            </p>
          )}
          <SpeakButtons text={c} />
          {hvList.length > 0 && (
            <p className="text-lg">
              <span className="mr-2 text-sm text-muted">Hán Việt</span>
              {hvList.map(({ key, r }, i) => (
                <span key={key}>
                  {i > 0 && <span className="text-muted"> · </span>}
                  {r.join(', ')}
                  {key !== '*' && readings.length > 1 && <span className="text-sm text-muted"> ({numberedToMarks(key)})</span>}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-muted">
          Nghĩa
          {gloss.length > 0 && <Unreviewed />}
        </h2>
        {gloss.length ? (
          <ul className="mt-1 space-y-1">
            {gloss.slice(0, 4).map((m, i) => (
              <li key={i}>
                {readings.length > 1 || gloss.length > 1 ? (
                  <span className="mr-2 text-sm" lang="zh-Latn-pinyin">
                    {numberedToMarks(m[2])}
                  </span>
                ) : null}
                {m[3].slice(0, 3).join('; ')}
              </li>
            ))}
          </ul>
        ) : meanings === undefined ? (
          <p className="mt-1 text-sm text-muted">Đang tải…</p>
        ) : (
          <p className="mt-1 text-muted">
            {meanings === null && 'Không tải được nghĩa (cần mạng lần đầu). '}
            {rec?.def ? `Tiếng Anh: ${rec.def}` : meanings === null ? '' : 'Chưa có nghĩa.'}
          </p>
        )}
      </section>

      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {rec?.sc ? (
          <div>
            <dt className="inline text-muted">Số nét </dt>
            <dd className="inline font-semibold">{rec.sc}</dd>
          </div>
        ) : null}
        {rec?.rad ? (
          <div>
            <dt className="inline text-muted">Bộ </dt>
            <dd className="inline">
              <RadicalLine c={c} rec={rec} />
            </dd>
          </div>
        ) : null}
        {rec?.t?.length ? (
          <div>
            <dt className="inline text-muted">Phồn thể </dt>
            <dd className="inline">
              <Han className="text-lg">{rec.t.join(' ')}</Han>
            </dd>
          </div>
        ) : null}
        {rec?.lv.s21 ? (
          <div>
            <dt className="inline text-muted">Chuẩn 2021 </dt>
            <dd className="inline">cấp {rec.lv.s21 === 7 ? '7–9' : rec.lv.s21}</dd>
          </div>
        ) : null}
      </dl>

      <section aria-labelledby="tu-co-chu">
        <h2 id="tu-co-chu" className="text-sm font-semibold text-muted">
          Từ có chữ này
        </h2>
        {words === undefined ? (
          <p className="mt-1 text-sm text-muted">Đang tìm…</p>
        ) : words === null ? (
          <p className="mt-1 text-sm text-muted">Không tải được danh sách từ (cần mạng lần đầu).</p>
        ) : words.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Chưa có từ HSK nào chứa chữ này.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {words.map((w) => (
              <li key={w.id}>
                <a
                  className="flex min-h-11 flex-wrap items-baseline gap-x-3 px-4 py-2 hover:bg-accent-soft"
                  href={url(`tu/?w=${encodeURIComponent(w.id)}&l=${packKey(w.lv)}`)}
                >
                  <Han className="text-xl">{w.s}</Han>
                  <Pinyin p={w.p} />
                  <span className="text-sm text-muted">{w.hv}</span>
                  <span className="min-w-0 basis-full truncate text-sm sm:flex-1 sm:basis-auto">{w.vi.split('; ')[0]}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="divide-y divide-line rounded-xl border border-line">
        <Disclosure id="net" title="Nét chữ" open={open === 'net'} onToggle={() => toggle('net')}>
          {strokes ? <StrokePanel c={c} /> : <p className="text-sm text-muted">Chưa có dữ liệu nét cho chữ này.</p>}
        </Disclosure>
        <Disclosure id="cau-tao" title="Cấu tạo" open={open === 'cau-tao'} onToggle={() => toggle('cau-tao')}>
          <StructurePanel c={c} rec={rec} strokes={strokes} />
        </Disclosure>
        {hvList.some((x) => x.key !== '*') && (
          <Disclosure id="meo-thanh" title="Mẹo thanh" open={open === 'meo-thanh'} onToggle={() => toggle('meo-thanh')}>
            <ToneHintPanel hvList={hvList} />
          </Disclosure>
        )}
        <Disclosure id="ghi-chu" title="Mẹo nhớ của bạn" open={open === 'ghi-chu'} onToggle={() => toggle('ghi-chu')}>
          <NotePanel itemId={c} />
        </Disclosure>
      </div>
    </article>
  );
}

function Disclosure({ id, title, open, onToggle, children }: { id: string; title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div>
      <h2>
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-between px-4 text-left font-semibold"
          aria-expanded={open}
          aria-controls={`panel-${id}`}
          onClick={onToggle}
        >
          {title}
          <span aria-hidden="true" className={`transition-transform ${open ? 'rotate-90' : ''}`}>
            ›
          </span>
        </button>
      </h2>
      {open && (
        <div id={`panel-${id}`} className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

/** Animation nét (không tự chạy) và viết thử bằng quiz của Hanzi Writer. */
function StrokePanel({ c }: { c: string }) {
  const box = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const hint = useRef(false);
  const [result, setResult] = useState<{ mistakes: number; strokes: number; hint: boolean } | null>(null);
  const [quizzing, setQuizzing] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false);
    setFailed(false);
    (async () => {
      const el = box.current;
      if (!el) return;
      // Tải động Hanzi Writer để trang /chu/ mở nhanh (pattern như WriterBox trong writer.tsx).
      const { default: HW } = await import('hanzi-writer');
      if (!alive) return;
      el.innerHTML = '';
      const size = Math.max(160, Math.min(240, el.clientWidth || 240));
      writer.current = HW.create(el, c, {
        width: size,
        height: size,
        padding: 12,
        showOutline: true,
        showCharacter: true,
        charDataLoader: (ch, onLoad, onError) => {
          fetch(strokeUrl(ch))
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then(onLoad)
            .catch(onError);
        },
        strokeColor: cssVar('--ink', '#1a1a19'),
        outlineColor: cssVar('--line', '#e4e2dc'),
        drawingColor: cssVar('--accent', '#9a6b12'),
        highlightColor: cssVar('--t3', '#02629c'),
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 250,
      });
      if (alive) setReady(true);
    })().catch(() => {
      if (alive) setFailed(true);
    });
    return () => {
      alive = false;
      writer.current?.cancelQuiz();
      writer.current = null;
    };
  }, [c]);

  const animate = () => {
    writer.current?.cancelQuiz();
    setQuizzing(false);
    writer.current?.showCharacter();
    void writer.current?.animateCharacter();
  };
  const quiz = () => {
    setResult(null);
    setQuizzing(true);
    hint.current = false;
    let strokes = 0;
    writer.current?.hideCharacter();
    void writer.current?.quiz({
      showHintAfterMisses: 3,
      onMistake: (d) => {
        if (d.mistakesOnStroke >= 3) hint.current = true;
      },
      onCorrectStroke: (d) => {
        strokes = d.strokeNum + d.strokesRemaining + 1;
      },
      onComplete: (d) => {
        setQuizzing(false);
        setResult({ mistakes: d.totalMistakes, strokes, hint: hint.current });
      },
    });
  };

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="relative aspect-square w-full max-w-[240px] touch-none rounded-xl border border-line bg-paper">
        <div ref={box} className="absolute inset-0" aria-label={`Ô viết chữ ${c}`} />
        {!ready && (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted">
            {failed ? 'Chưa tải được dữ liệu nét (cần mạng lần đầu).' : 'Đang tải…'}
          </p>
        )}
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${btn} disabled:opacity-50`} onClick={animate} disabled={!ready}>
            Xem nét
          </button>
          <button type="button" className={`${btnPrimary} disabled:opacity-50`} onClick={quiz} disabled={!ready}>
            {quizzing ? 'Viết lại' : 'Viết thử'}
          </button>
        </div>
        {quizzing && <p className="text-muted">Viết từng nét theo đúng thứ tự. Sai 3 lần một nét sẽ hiện gợi ý.</p>}
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <a className="text-muted underline" href={url(`viet/?chu=${encodeURIComponent(c)}`)}>
            Tập viết 3 bước
          </a>
          <a className="text-muted underline" href={url(`viet/in/?chu=${encodeURIComponent(c)}`)}>
            In 田字格
          </a>
        </p>
        {result && (
          <p role="status">
            Xong: {result.mistakes} lỗi / {result.strokes} nét → <b>{GRADE_VI[gradeWriting(result.mistakes, result.strokes, result.hint)]}</b>
            {result.hint && ' (đã cần gợi ý)'}.
          </p>
        )}
      </div>
    </div>
  );
}

function StructurePanel({ c, rec, strokes }: { c: string; rec?: CharRec; strokes?: StrokeData | null }) {
  const parts = idsComponents(rec?.dec).filter((x) => x !== c);
  const et = rec?.et;
  const role = (x: string) => (et?.s === x ? 'phần nghĩa' : et?.p === x ? 'phần âm' : null);
  if (!rec && !strokes) return <p className="text-sm text-muted">Chưa có dữ liệu cấu tạo cho chữ này.</p>;
  return (
    <div className="flex flex-wrap items-start gap-4">
      {strokes?.radStrokes?.length ? (
        <figure className="w-[120px] space-y-1">
          <StaticGlyph c={c} data={strokes} className="size-[120px]" highlight />
          <figcaption className="text-xs text-muted">Tô màu: các nét của bộ</figcaption>
        </figure>
      ) : null}
      <div className="min-w-[10rem] flex-1 space-y-2 text-sm">
        {parts.length > 0 && (
          <p>
            <span className="text-muted">Gồm </span>
            {parts.map((x, i) => (
              <span key={x}>
                {i > 0 && ' + '}
                {isHan(x) ? (
                  <a className="underline decoration-line underline-offset-4" href={url(`chu/?c=${encodeURIComponent(x)}`)}>
                    <Han className="text-lg">{x}</Han>
                  </a>
                ) : (
                  <Han className="text-lg">{x}</Han>
                )}
                {role(x) && <span className="text-muted"> ({role(x)})</span>}
              </span>
            ))}
          </p>
        )}
        {et && (
          <p>
            <span className="text-muted">Loại: </span>
            {ETYMOLOGY_VI[et.t]}
          </p>
        )}
        {et?.h && (
          <p>
            <span className="text-muted">Gợi ý nguồn gốc (tiếng Anh, Make Me a Hanzi): </span>
            {et.h}
          </p>
        )}
        {rec?.def && (
          <p>
            <span className="text-muted">Nghĩa gốc (tiếng Anh): </span>
            {rec.def}
          </p>
        )}
        {rec?.hv && Object.keys(rec.hv).some((k) => k !== '*' && !(rec.py ?? []).includes(k)) && (
          <p>
            <span className="text-muted">Âm Hán Việt khác: </span>
            {Object.entries(rec.hv)
              .filter(([k]) => k !== '*' && !(rec.py ?? []).includes(k))
              .map(([k, r]) => `${r.join(', ')} (${numberedToMarks(k)})`)
              .join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}

/** Mẹo đoán thanh từ âm Hán Việt; luôn ghi rõ đây là mẹo nhớ, không phải cách đọc. */
function ToneHintPanel({ hvList }: { hvList: { key: string; r: string[] }[] }) {
  const [detail, setDetail] = useState<string | null>(null);
  const rows = hvList
    .filter((x) => x.key !== '*')
    .flatMap(({ key, r }) => {
      const tone = parseNumbered(key)?.[0]?.tone;
      return r.slice(0, 2).map((reading) => ({ key, reading, tone, hint: toneHint(reading, tone) }));
    });
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted">Mẹo nhớ thanh, không phải cách đọc: thanh tiếng Việt của âm Hán Việt thường gợi ý thanh pinyin.</p>
      <ul className="space-y-2">
        {rows.map(({ key, reading, hint }) => {
          const id = `${key}-${reading}`;
          const p = hint.rule.predict;
          return (
            <li key={id}>
              <button type="button" className="text-left" onClick={() => setDetail(detail === id ? null : id)} aria-expanded={detail === id}>
                <b>{reading}</b> ({hint.rule.label}) → {p ? `thường là thanh ${p}` : 'không đoán được'} · thật: <NumberedSyllable s={key} />{' '}
                {hint.fits === true && <span className="text-t2">✓ theo mẹo</span>}
                {hint.fits === false && <span className="text-t1">✗ ngoại lệ</span>}
              </button>
              {detail === id && (
                <p className="mt-1 text-muted">
                  {p
                    ? `Nhóm này đúng ${hint.rule.accuracy.toLocaleString('vi-VN')}% (đo trên ${fmtInt(hint.rule.n)} cặp chữ HSK).`
                    : `Nhóm này chia gần đều giữa các thanh (thanh phổ biến nhất chỉ ${hint.rule.accuracy.toLocaleString('vi-VN')}%).`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NotePanel({ itemId }: { itemId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    getNote(itemId)
      .then(setText)
      .catch(() => setText(''));
  }, [itemId]);
  const onChange = (v: string) => {
    setText(v);
    setSaved(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setNote(itemId, v)
        .then(() => setSaved(true))
        .catch(() => setSaved(false));
    }, 500);
  };
  if (text === null) return <p className="text-sm text-muted">Đang mở…</p>;
  return (
    <div className="space-y-1">
      <label className="block text-sm text-muted" htmlFor={`note-${itemId}`}>
        Ghi lại cách bạn nhớ chữ này (lưu trên máy này).
      </label>
      <textarea
        id={`note-${itemId}`}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-line bg-paper p-3 text-base"
      />
      <p className="h-4 text-xs text-muted" role="status">
        {saved ? 'Đã lưu' : ''}
      </p>
    </div>
  );
}
