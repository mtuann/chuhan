/**
 * Bảng pinyin cơ bản (spec F8): chọn phụ âm đầu, chạm vào âm tiết để nghe 4 thanh bằng bản ghi người thật
 * (audio-cmn, giọng Chen Wang). Âm nào không có bản ghi thì ẩn. Kèm ghi chú các âm khó với người Việt
 * (AI soạn, chưa duyệt) và mẹo Hán Việt cho vần cuối -n/-ng (số đo trên dữ liệu).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PinyinNote } from '../../schema/data';
import { playSyllable, stopAll } from '../../lib/audio';
import { loadAudioIndex, loadPinyinNotes } from '../../lib/data';
import { syllableToMarks } from '../../lib/pinyin';
import { fmtInt, fmtPct } from '../../lib/text';
import { TONE_FINALS } from '../../lib/tone-table';
import { ErrorBox, Loading, TONE_CLASS, Unreviewed } from '../ui';

/** Phụ âm đầu theo nhóm cách phát âm; "" = âm tiết không có phụ âm đầu (a, o, e…). */
const INITIALS = ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w', ''] as const;
type Initial = (typeof INITIALS)[number];
/** Âm đặc biệt (thán từ, 儿 hoá) không đưa vào bảng. */
const SPECIAL = new Set(['m', 'n', 'ng', 'hm', 'hng', 'r']);
/** Thứ tự vần trong một hàng (theo bảng vận mẫu thường gặp; ü viết v). */
const FINAL_ORDER = [
  'a', 'o', 'e', 'i', 'u', 'v', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'ong', 'er',
  'ia', 'ie', 'iao', 'iu', 'ian', 'in', 'iang', 'ing', 'iong',
  'ua', 'uo', 'uai', 'ui', 'uan', 'un', 'uang', 'ueng', 'ue', 've', 'van', 'vn',
];

function splitInitial(base: string): { ini: Initial; fin: string } {
  for (const i of ['zh', 'ch', 'sh'] as const) if (base.startsWith(i)) return { ini: i, fin: base.slice(2) };
  const c = base[0];
  if (base.length > 1 && 'bpmfdtnlgkhjqxrzcsyw'.includes(c)) return { ini: c as Initial, fin: base.slice(1) };
  return { ini: '', fin: base };
}

const display = (base: string) => base.replace(/v/g, 'ü');
const chipLabel = (i: Initial) => (i === '' ? 'a o e' : i);
const chipName = (i: Initial) => (i === '' ? 'không có phụ âm đầu' : `phụ âm ${i}`);

interface Row {
  base: string;
  tones: number[];
}

export default function PinyinChart() {
  const [data, setData] = useState<{ rows: Map<Initial, Row[]>; notes: PinyinNote[]; draft: boolean } | 'loading' | { error: string }>('loading');
  const [ini, setIni] = useState<Initial>(() => {
    const h = decodeURIComponent(window.location.hash.slice(1));
    if (h === 'a') return '';
    return (INITIALS as readonly string[]).includes(h) && h ? (h as Initial) : 'b';
  });
  const [playing, setPlaying] = useState<string | null>(null);
  const run = useRef(0);

  useEffect(() => {
    Promise.all([loadAudioIndex(), loadPinyinNotes().catch(() => null)])
      .then(([index, notes]) => {
        const tonesOf = new Map<string, number[]>();
        for (const k of index.s.keys) {
          const base = k.slice(0, -1);
          tonesOf.set(base, [...(tonesOf.get(base) ?? []), Number(k.slice(-1))]);
        }
        const rows = new Map<Initial, Row[]>(INITIALS.map((i) => [i, []]));
        for (const [base, tones] of tonesOf) {
          if (SPECIAL.has(base)) continue;
          const { ini: i } = splitInitial(base);
          rows.get(i)?.push({ base, tones: tones.sort() });
        }
        const rank = (b: string) => {
          const k = FINAL_ORDER.indexOf(splitInitial(b).fin);
          return k < 0 ? 999 : k;
        };
        for (const list of rows.values()) list.sort((a, b) => rank(a.base) - rank(b.base) || a.base.localeCompare(b.base));
        setData({ rows, notes: notes?.notes ?? [], draft: notes?.status === 'draft' });
      })
      .catch((e: unknown) => setData({ error: e instanceof Error ? e.message : String(e) }));
    return () => stopAll();
  }, []);

  const choose = (i: Initial) => {
    setIni(i);
    history.replaceState(null, '', `#${encodeURIComponent(i || 'a')}`);
  };

  /** Phát lần lượt các âm tiết; chạm âm khác thì dừng chuỗi đang phát. */
  const playSeq = async (keys: string[]) => {
    const me = ++run.current;
    for (const k of keys) {
      if (run.current !== me) return;
      setPlaying(k);
      await playSyllable(k);
      if (run.current !== me) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (run.current === me) setPlaying(null);
  };

  const notesHere = useMemo(
    () => (typeof data === 'object' && 'notes' in data ? data.notes.filter((n) => n.sounds.includes(ini === '' ? 'er' : ini)) : []),
    [data, ini],
  );

  if (data === 'loading') return <Loading label="Đang tải bảng âm…" />;
  if ('error' in data) return <ErrorBox>Không tải được bảng âm: {data.error}. Lần đầu dùng cần có mạng.</ErrorBox>;
  const rows = data.rows.get(ini) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted" id="chon-am">
          Phụ âm đầu
        </h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="chon-am">
          {INITIALS.filter((i) => (data.rows.get(i)?.length ?? 0) > 0).map((i) => (
            <button
              key={i || 'none'}
              type="button"
              onClick={() => choose(i)}
              aria-pressed={i === ini}
              aria-label={chipName(i)}
              className={`min-h-11 min-w-11 rounded-lg border px-3 text-base font-semibold ${
                i === ini ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-card hover:border-accent'
              }`}
              lang="zh-Latn-pinyin"
            >
              {chipLabel(i)}
            </button>
          ))}
        </div>
      </div>

      {notesHere.map((n) => (
        <NoteCard key={n.id} note={n} draft={data.draft} playing={playing} onPlay={playSeq} />
      ))}

      <section aria-label={`Âm tiết với ${chipName(ini)}`}>
        <p className="mb-2 text-sm text-muted">Chạm vào âm để nghe; chạm vào tên hàng để nghe lần lượt cả 4 thanh.</p>
        <ul className="sm:grid sm:grid-cols-2 sm:gap-x-6">
          {rows.map((r) => (
            <li key={r.base} className="flex items-center gap-2 border-b border-line py-1.5">
              <button
                type="button"
                className="min-h-11 w-14 shrink-0 rounded-lg text-left font-semibold hover:text-accent"
                onClick={() => void playSeq(r.tones.map((t) => `${r.base}${t}`))}
                aria-label={`Nghe ${display(r.base)} cả ${r.tones.length} thanh`}
                lang="zh-Latn-pinyin"
              >
                {display(r.base)}
              </button>
              <div className="grid flex-1 grid-cols-4 gap-1">
                {[1, 2, 3, 4].map((t) => {
                  const key = `${r.base}${t}`;
                  if (!r.tones.includes(t)) return <span key={t} aria-hidden="true" />;
                  const marks = syllableToMarks(key);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => void playSeq([key])}
                      aria-label={`${marks}, thanh ${t}`}
                      aria-pressed={playing === key}
                      lang="zh-Latn-pinyin"
                      className={`min-h-11 overflow-hidden rounded-lg border px-0.5 text-sm whitespace-nowrap sm:text-base ${TONE_CLASS[t]} ${
                        playing === key ? 'border-accent bg-accent-soft' : 'border-line bg-card hover:border-accent'
                      }`}
                    >
                      {marks}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-card p-5" aria-labelledby="meo-n-ng">
        <h2 id="meo-n-ng" className="font-semibold">
          Mẹo Hán Việt cho -n và -ng
        </h2>
        <p className="mt-1">
          Âm Hán Việt tận cùng -m hoặc -n → pinyin thường tận cùng -n. Âm Hán Việt tận cùng -ng hoặc -nh → pinyin thường tận cùng -ng.
        </p>
        <p className="mt-2 text-sm text-muted">
          Đo trên các chữ đọc HSK 2025: -m → -n đúng {fmtPct(TONE_FINALS.m.toN)} ({fmtInt(TONE_FINALS.m.n)} cặp), -n → -n{' '}
          {fmtPct(TONE_FINALS.n.toN)} ({fmtInt(TONE_FINALS.n.n)} cặp), -ng/-nh → -ng {fmtPct(TONE_FINALS['ng/nh'].toNg)} (
          {fmtInt(TONE_FINALS['ng/nh'].n)} cặp).
        </p>
      </section>

      {data.notes.length > 0 && (
        <section aria-labelledby="am-kho">
          <h2 id="am-kho" className="mb-2 font-semibold">
            Âm khó với người Việt
            {data.draft && <Unreviewed what="AI soạn" />}
          </h2>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {data.notes.map((n) => (
              <details key={n.id} className="group px-4 py-1">
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold">{n.title}</summary>
                <div className="pb-3">
                  <NoteBody note={n} playing={playing} onPlay={playSeq} />
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function NoteCard({ note, draft, playing, onPlay }: { note: PinyinNote; draft: boolean; playing: string | null; onPlay: (keys: string[]) => void }) {
  return (
    <aside className="rounded-2xl border border-line bg-card p-4">
      <h2 className="font-semibold">
        {note.title}
        {draft && <Unreviewed what="AI soạn" />}
      </h2>
      <div className="mt-1">
        <NoteBody note={note} playing={playing} onPlay={onPlay} />
      </div>
    </aside>
  );
}

function NoteBody({ note, playing, onPlay }: { note: PinyinNote; playing: string | null; onPlay: (keys: string[]) => void }) {
  return (
    <>
      <p className="text-sm">{note.text}</p>
      {note.pairs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Nghe so sánh">
          {note.pairs.map(([a, b]) => (
            <span key={`${a}-${b}`} className="inline-flex items-center overflow-hidden rounded-lg border border-line">
              {[a, b].map((k, i) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onPlay([k])}
                  aria-pressed={playing === k}
                  aria-label={`Nghe ${syllableToMarks(k)}`}
                  lang="zh-Latn-pinyin"
                  className={`min-h-11 min-w-12 px-3 ${TONE_CLASS[Number(k.slice(-1))]} ${i ? 'border-l border-line' : ''} ${
                    playing === k ? 'bg-accent-soft' : 'hover:bg-accent-soft'
                  }`}
                >
                  {syllableToMarks(k)}
                </button>
              ))}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
