/**
 * In 田字格 (/viet/in/?cap=1&tu=1&den=20, /viet/in/?chu=学习): trang tập viết khổ A4.
 * Mỗi chữ: dòng thông tin (pinyin, Hán Việt, số nét), hàng thứ tự nét (ô thứ k vẽ k nét đầu, nét mới đậm nhất),
 * rồi các hàng luyện: ô mẫu, vài ô tô mờ, còn lại ô trống. Chữ vẽ từ dữ liệu nét nên in ra giống hệt trên màn hình.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CharRec, PackKey } from '../../schema/data';
import { loadChar, loadLevelList, loadManifest, loadStrokes } from '../../lib/data';
import { getSetting, setSetting } from '../../lib/settings';
import { numberedToMarks } from '../../lib/pinyin';
import { fmtInt, levelLabel } from '../../lib/text';
import { BOX_SIZES, PAPER_MM, boxesPerRow, mainHanviet, mainReadings, orderBoxMm, orderRows, practiceRow, uniqueHan, type BoxMm } from '../../lib/writing';
import { Loading, btnPrimary, useQueryParam } from '../ui';
import { VietNav } from './VietNav';

type Level = Exclude<PackKey, 'x'>;
const MAX_PRINT = 100;

export interface PrintOpts {
  grid: 'tian' | 'mi';
  box: BoxMm;
  faded: number;
  rows: number;
  order: boolean;
  info: boolean;
}
const DEFAULTS: PrintOpts = { grid: 'tian', box: 15, faded: 3, rows: 2, order: true, info: true };

interface CharData {
  strokes: string[] | null;
  rec?: CharRec;
}

const INK = '#000';
const DONE = '#8c8c8c';
const FAINT = '#bdbdbd';
const TODO = '#ececec';
const LINE = '#9a9a9a';
const GUIDE = '#cdcdcd';

const symId = (c: string, j: number) => `n${c.codePointAt(0)!.toString(16)}-${j}`;

/** Một ô vuông có kẻ 田 hoặc 米, `children` vẽ trong hệ toạ độ mm của ô. */
function GridBox({ x, size, grid, children }: { x: number; size: number; grid: PrintOpts['grid']; children?: ReactNode }) {
  const h = size / 2;
  const dash = `${(size / 15).toFixed(2)} ${(size / 22).toFixed(2)}`;
  const w = 0.18;
  return (
    <g transform={`translate(${x} 0)`}>
      <g stroke={GUIDE} strokeWidth={w} strokeDasharray={dash} fill="none">
        <line x1={h} y1={0} x2={h} y2={size} />
        <line x1={0} y1={h} x2={size} y2={h} />
        {grid === 'mi' && (
          <>
            <line x1={0} y1={0} x2={size} y2={size} />
            <line x1={size} y1={0} x2={0} y2={size} />
          </>
        )}
      </g>
      <rect x={w / 2} y={w / 2} width={size - w} height={size - w} fill="none" stroke={LINE} strokeWidth={w * 1.4} />
      {children}
    </g>
  );
}

/** Chữ trong ô: từ dữ liệu nét (`fill(j)` cho màu từng nét) hoặc bằng phông chữ nếu không có nét. */
function Glyph({ c, d, size, fill }: { c: string; d: CharData; size: number; fill: (j: number) => string }) {
  const pad = size * 0.07;
  if (!d.strokes)
    return (
      <text x={size / 2} y={size * 0.8} fontSize={size * 0.78} textAnchor="middle" fill={fill(0)} lang="zh-CN" style={{ fontFamily: 'var(--font-han)' }}>
        {c}
      </text>
    );
  return (
    <g transform={`translate(${pad} ${pad}) scale(${(size - 2 * pad) / 1024}) translate(0 900) scale(1 -1)`}>
      {d.strokes.map((_, j) => (
        <use key={j} href={`#${symId(c, j)}`} fill={fill(j)} />
      ))}
    </g>
  );
}

function Row({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${PAPER_MM} ${size}`} className="block h-auto w-full" aria-hidden="true">
      {children}
    </svg>
  );
}

function CharBlock({ c, d, o }: { c: string; d: CharData; o: PrintOpts }) {
  const perRow = boxesPerRow(o.box);
  const ob = orderBoxMm(o.box);
  const n = d.strokes?.length ?? 0;
  const py = mainReadings(d.rec).map(numberedToMarks).join(', ');
  const hv = mainHanviet(d.rec).join(', ');
  return (
    <section className="sheet-block mb-[3.5mm]" style={{ breakInside: 'avoid' }} aria-label={`Chữ ${c}`}>
      {o.info && (
        <p className="mb-[1mm] text-[9pt] leading-tight">
          <span className="han text-[12pt]" lang="zh-CN">
            {c}
          </span>
          {py && <span> · {py}</span>}
          {hv && <span> · {hv}</span>}
          {n > 0 && <span> · {n} nét</span>}
        </p>
      )}
      {o.order && n > 0 && (
        <div className="mb-[1.2mm] space-y-[0.6mm]" data-hang="thu-tu-net">
          {orderRows(n, boxesPerRow(ob)).map((ks, r) => (
            <Row key={r} size={ob}>
              {ks.map((k, i) => (
                <GridBox key={k} x={i * ob} size={ob} grid={o.grid}>
                  <Glyph c={c} d={d} size={ob} fill={(j) => (j < k - 1 ? DONE : j === k - 1 ? INK : TODO)} />
                </GridBox>
              ))}
            </Row>
          ))}
        </div>
      )}
      <div data-hang="luyen">
        {Array.from({ length: o.rows }, (_, r) => (
          <Row key={r} size={o.box}>
            {practiceRow(r, perRow, o.faded).map((kind, i) => (
              <GridBox key={i} x={i * o.box} size={o.box} grid={o.grid}>
                {kind !== 'empty' && <Glyph c={c} d={d} size={o.box} fill={() => (kind === 'model' ? INK : FAINT)} />}
              </GridBox>
            ))}
          </Row>
        ))}
      </div>
    </section>
  );
}

export default function PrintApp() {
  const chu = useQueryParam('chu');
  const cap = useQueryParam('cap');
  const tu = useQueryParam('tu');
  const den = useQueryParam('den');
  const [source, setSource] = useState<'cap' | 'chu'>(chu ? 'chu' : 'cap');
  const [levels, setLevels] = useState<{ level: Level; n: number }[] | null>(null);
  const [level, setLevel] = useState<Level>((cap as Level) ?? '1');
  const [from, setFrom] = useState(Math.max(1, Number(tu) || 1));
  const [to, setTo] = useState(Math.max(1, Number(den) || 20));
  const [text, setText] = useState(chu ?? '');
  const [levelList, setLevelList] = useState<string[] | null>(null);
  const [o, setO] = useState<PrintOpts>(DEFAULTS);
  const [optsLoaded, setOptsLoaded] = useState(false);
  const [data, setData] = useState<Map<string, CharData>>(new Map());

  useEffect(() => {
    getSetting('vietIn')
      .then((x) => setO((cur) => ({ ...cur, ...x })))
      .catch(() => undefined)
      .finally(() => setOptsLoaded(true));
    loadManifest()
      .then((m) => {
        const ls = (Object.entries(m.counts.writing) as [Level, number][]).filter(([, n]) => n > 0).map(([l, n]) => ({ level: l, n }));
        setLevels(ls);
        // cấp không có chữ viết tay (như cấp 2) thì về cấp đầu tiên có chữ
        setLevel((cur) => (ls.length && !ls.some((x) => x.level === cur) ? ls[0].level : cur));
      })
      .catch(() => setLevels([]));
  }, []);
  useEffect(() => {
    if (optsLoaded) void setSetting('vietIn', o).catch(() => undefined);
  }, [o, optsLoaded]);

  useEffect(() => {
    if (source !== 'cap') return;
    let alive = true;
    setLevelList(null);
    loadLevelList(level)
      .then((l) => alive && setLevelList(l.writing))
      .catch(() => alive && setLevelList([]));
    return () => {
      alive = false;
    };
  }, [source, level]);

  const start = Math.min(Math.max(1, from), Math.max(1, levelList?.length ?? 1));
  const chars = useMemo(() => {
    if (source === 'chu') return uniqueHan(text).slice(0, MAX_PRINT);
    if (!levelList?.length) return [];
    const b = Math.min(Math.max(start, to), levelList.length, start + MAX_PRINT - 1);
    return levelList.slice(start - 1, b);
  }, [source, text, levelList, start, to]);

  // đường dẫn theo lựa chọn (gửi hoặc mở lại được)
  useEffect(() => {
    const p = new URLSearchParams();
    if (source === 'chu') {
      if (text) p.set('chu', uniqueHan(text).join(''));
    } else {
      p.set('cap', level);
      p.set('tu', String(from));
      p.set('den', String(to));
    }
    history.replaceState(null, '', `?${p}`);
  }, [source, text, level, from, to]);

  useEffect(() => {
    const missing = chars.filter((c) => !data.has(c));
    if (!missing.length) return;
    let alive = true;
    (async () => {
      const got = new Map<string, CharData>();
      for (let i = 0; i < missing.length; i += 12) {
        const part = missing.slice(i, i + 12);
        const rows = await Promise.all(
          part.map(async (c) => {
            const [s, r] = await Promise.all([loadStrokes(c).catch(() => undefined), loadChar(c).catch(() => undefined)]);
            return [c, { strokes: s?.strokes ?? null, rec: r?.rec }] as const;
          }),
        );
        for (const [c, d] of rows) got.set(c, d);
      }
      if (alive) setData((cur) => new Map([...cur, ...got]));
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [chars, data]);

  const set = <K extends keyof PrintOpts>(k: K, v: PrintOpts[K]) => setO((x) => ({ ...x, [k]: v }));
  const ready = chars.length > 0 && chars.every((c) => data.has(c));
  const title =
    source === 'chu'
      ? `Tập viết chữ Hán · ${chars.slice(0, 12).join('')}${chars.length > 12 ? '…' : ''}`
      : `Tập viết chữ Hán · ${levelLabel(Number(level))} · chữ ${fmtInt(start)}–${fmtInt(start + chars.length - 1)}`;
  const max = levelList?.length ?? 1;

  return (
    <div className="space-y-4">
      <VietNav current="in" />
      <div data-print-hide className="space-y-4">
        <div role="radiogroup" aria-label="Lấy chữ" className="inline-flex overflow-hidden rounded-lg border border-line">
          {(
            [
              ['cap', 'Theo cấp'],
              ['chu', 'Tự nhập'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={source === k}
              className={`min-h-11 px-4 text-sm ${source === k ? 'bg-accent font-semibold text-accent-ink' : 'hover:bg-accent-soft'}`}
              onClick={() => setSource(k)}
            >
              {label}
            </button>
          ))}
        </div>

        {source === 'cap' ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="block">Cấp</span>
              <select className="mt-1 min-h-11 rounded-lg border border-line bg-card px-2" value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                {(levels ?? [{ level: '1' as Level, n: 0 }]).map((l) => (
                  <option key={l.level} value={l.level}>
                    {levelLabel(Number(l.level))}
                    {l.n ? ` (${fmtInt(l.n)} chữ)` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="block">Từ chữ thứ</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                className="mt-1 min-h-11 w-24 rounded-lg border border-line bg-card px-2"
                value={from}
                onChange={(e) => setFrom(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <label className="block text-sm">
              <span className="block">đến</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                className="mt-1 min-h-11 w-24 rounded-lg border border-line bg-card px-2"
                value={to}
                onChange={(e) => setTo(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <p className="pb-3 text-sm text-muted">Chữ xếp từ ít nét đến nhiều nét; mỗi lần in tối đa {MAX_PRINT} chữ.</p>
          </div>
        ) : (
          <label className="block">
            <span className="text-sm">Chữ cần in (chữ trùng chỉ in một lần, tối đa {MAX_PRINT} chữ)</span>
            <textarea
              className="mt-1 block w-full rounded-xl border border-line bg-card p-3 text-xl"
              lang="zh-CN"
              rows={2}
              value={text}
              placeholder="Ví dụ 学习汉语"
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        )}

        <fieldset className="space-y-3 rounded-xl border border-line p-3 text-sm">
          <legend className="px-1 font-semibold">Mẫu trang</legend>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <label className="flex items-center gap-2">
              Kiểu ô
              <select className="min-h-11 rounded-lg border border-line bg-card px-2" value={o.grid} onChange={(e) => set('grid', e.target.value as PrintOpts['grid'])}>
                <option value="tian">田 (hai đường giữa)</option>
                <option value="mi">米 (thêm hai đường chéo)</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              Cỡ ô
              <select className="min-h-11 rounded-lg border border-line bg-card px-2" value={o.box} onChange={(e) => set('box', Number(e.target.value) as BoxMm)}>
                {BOX_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} mm ({boxesPerRow(s)} ô một hàng)
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Ô tô mờ
              <select className="min-h-11 rounded-lg border border-line bg-card px-2" value={o.faded} onChange={(e) => set('faded', Number(e.target.value))}>
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Hàng luyện mỗi chữ
              <select className="min-h-11 rounded-lg border border-line bg-card px-2" value={o.rows} onChange={(e) => set('rows', Number(e.target.value))}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5" checked={o.order} onChange={(e) => set('order', e.target.checked)} />
            Hàng thứ tự nét (mỗi ô thêm một nét)
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5" checked={o.info} onChange={(e) => set('info', e.target.checked)} />
            Pinyin, Hán Việt và số nét
          </label>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btnPrimary} disabled={!ready} onClick={() => window.print()}>
            In / Lưu PDF
          </button>
          <span className="text-sm text-muted">
            {chars.length ? `${fmtInt(chars.length)} chữ · khổ A4 dọc` : 'Chưa có chữ nào.'} Trên iPhone: trong hộp thoại in, chụm hai ngón trên bản xem trước để lưu thành PDF.
          </span>
        </div>
      </div>

      {chars.length > 0 &&
        (ready ? (
          <article className="print-sheet rounded-md border border-line bg-white p-[4%] text-black shadow-sm" aria-label="Trang in">
            <svg width="0" height="0" className="absolute" aria-hidden="true">
              <defs>
                {chars.map((c) => data.get(c)?.strokes?.map((d, j) => <path key={symId(c, j)} id={symId(c, j)} d={d} />))}
              </defs>
            </svg>
            <header className="mb-[4mm] flex flex-wrap items-baseline justify-between gap-2 border-b border-[#9a9a9a] pb-[1.5mm]">
              <h2 className="text-[12pt] font-semibold">{title}</h2>
              <p className="text-[9pt]">Họ tên: ________________ Ngày: __________</p>
            </header>
            {chars.map((c) => (
              <CharBlock key={c} c={c} d={data.get(c)!} o={o} />
            ))}
            <footer className="mt-[2mm] text-[7pt] text-[#666]">Chữ Hán · mtuann.github.io/chuhan · nét chữ: hanzi-writer-data (Make Me a Hanzi, Arphic PL)</footer>
          </article>
        ) : (
          <Loading label="Đang chuẩn bị trang in…" />
        ))}
    </div>
  );
}
