/**
 * Tôi (/toi/): những gì đã làm trên máy này. Từ của tôi (đang học, đã biết; câu gặp từ khi đọc), chữ đã tập viết (lần
 * chấm gần nhất), số chữ đã gõ. Dữ liệu lưu trong IndexedDB, cập nhật ngay khi đánh dấu hay luyện.
 */
import { useMemo, useState } from 'react';
import type { AttemptRow, ContextRow } from '../../lib/db';
import { GRADE_VI, type WriteGrade } from '../../lib/grade';
import { useLiveQuery } from '../../lib/live-query';
import { STATE_VI, type MyWordRow, type WordState } from '../../lib/mywords';
import { sentenceText } from '../../lib/sentence';
import { fmtInt, levelLabel } from '../../lib/text';
import { url } from '../../lib/url';
import { markWords, useWordStates } from './parts';
import { ToastHost } from '../toast';
import { Han, Pinyin, btn } from '../ui';

const PAGE = 60;
const GRADE_LOOK: Record<WriteGrade, string> = { good: 'border-t2 text-t2', hard: 'border-accent text-accent', again: 'border-t1 text-t1' };

function Words() {
  const { ready, rows } = useWordStates();
  const contexts = useLiveQuery((t) => t.contexts.toArray(), [], [] as ContextRow[]);
  const [tab, setTab] = useState<WordState>('hoc');
  const [shown, setShown] = useState(PAGE);
  const ctx = useMemo(() => new Map(contexts.map((c) => [c.itemId, c])), [contexts]);
  const count = (st: WordState) => rows.filter((r) => r.st === st).length;
  const list = useMemo(() => rows.filter((r) => r.st === tab).sort((a, b) => b.at - a.at), [rows, tab]);
  if (!ready) return null;
  const item = (r: MyWordRow) => ({ id: r.itemId, lv: r.lv, s: r.s, p: r.p, hv: r.hv, vi: r.vi });
  return (
    <section aria-labelledby="tu-cua-toi" className="space-y-3">
      <h2 id="tu-cua-toi" className="text-lg font-semibold">
        Từ của tôi
      </h2>
      <div role="tablist" aria-label="Trạng thái" className="inline-flex overflow-hidden rounded-lg border border-line">
        {(['hoc', 'biet'] as const).map((st) => (
          <button
            key={st}
            type="button"
            role="tab"
            aria-selected={tab === st}
            className={`min-h-11 px-4 text-sm ${tab === st ? 'bg-accent font-semibold text-accent-ink' : 'hover:bg-accent-soft'}`}
            onClick={() => {
              setTab(st);
              setShown(PAGE);
            }}
          >
            {STATE_VI[st]} ({fmtInt(count(st))})
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted">
          {tab === 'hoc'
            ? 'Chưa có từ nào. Khi đọc hoặc tra từ, chạm một từ rồi bấm ☆ Đang học để lưu lại kèm câu bạn gặp nó.'
            : 'Chưa có từ nào. Bấm ✓ Đã biết ở một từ để ẩn pinyin của từ đó khi đọc.'}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {list.slice(0, shown).map((r) => {
            const c = ctx.get(r.itemId);
            return (
              <li key={r.itemId} className="flex items-start gap-3 px-4 py-3">
                <a className="min-w-0 flex-1" href={url(`tu/?w=${encodeURIComponent(r.itemId)}${r.lv ? `&l=${r.lv}` : ''}`)}>
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <Han className="text-2xl">{r.s}</Han>
                    <Pinyin p={r.p} />
                    {r.hv && <span className="text-sm text-muted">{r.hv}</span>}
                    {r.lv ? <span className="text-xs text-muted">{levelLabel(r.lv)}</span> : null}
                  </span>
                  {r.vi && <span className="block text-sm">{r.vi}</span>}
                  {c && (
                    <span className="han block truncate text-sm text-muted" lang="zh-CN">
                      {sentenceText(c)}
                    </span>
                  )}
                </a>
                <button
                  type="button"
                  className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line px-3 text-sm hover:border-accent"
                  onClick={() => void markWords([item(r)], tab === 'hoc' ? 'biet' : 'hoc', 'toi')}
                >
                  {tab === 'hoc' ? '✓ Đã biết' : '☆ Học lại'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {shown < list.length && (
        <button type="button" className={btn} onClick={() => setShown((n) => n + PAGE)}>
          Xem thêm ({fmtInt(list.length - shown)})
        </button>
      )}
      {count('hoc') >= 5 && (
        <p className="text-sm">
          <a className="underline" href={url('go/?che-do=tu')}>
            Luyện gõ các từ đang học →
          </a>
        </p>
      )}
    </section>
  );
}

/** Chữ đã tập viết: lần chấm gần nhất của mỗi chữ, mới nhất trước. */
function Chars() {
  const rows = useLiveQuery((t) => t.attempts.where('kind').equals('write').toArray(), [], [] as AttemptRow[]);
  const last = useMemo(() => {
    const m = new Map<string, AttemptRow>();
    for (const r of rows) if (r.itemId && (!m.has(r.itemId) || m.get(r.itemId)!.at < r.at)) m.set(r.itemId, r);
    return [...m.values()].sort((a, b) => b.at - a.at);
  }, [rows]);
  if (!last.length) return null;
  const weak = last.filter((r) => (r.data as { grade?: WriteGrade } | undefined)?.grade !== 'good').map((r) => r.itemId!);
  return (
    <section aria-labelledby="chu-da-tap" className="space-y-3">
      <h2 id="chu-da-tap" className="text-lg font-semibold">
        Chữ đã tập viết ({fmtInt(last.length)})
      </h2>
      <ul className="flex flex-wrap gap-2" lang="zh-CN">
        {last.slice(0, 120).map((r) => {
          const g = ((r.data as { grade?: WriteGrade } | undefined)?.grade ?? 'hard') as WriteGrade;
          return (
            <li key={r.itemId}>
              <a
                href={url(`chu/?c=${encodeURIComponent(r.itemId!)}`)}
                title={GRADE_VI[g]}
                aria-label={`${r.itemId}: ${GRADE_VI[g]}`}
                className={`inline-flex size-12 items-center justify-center rounded-lg border-2 bg-card text-2xl ${GRADE_LOOK[g]}`}
              >
                <Han>{r.itemId}</Han>
              </a>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">Viền xanh: viết tốt · cam: còn khó · đỏ: chưa nhớ (lần tập gần nhất).</p>
      {weak.length > 0 && (
        <a className={btn} href={url(`viet/?chu=${encodeURIComponent(weak.slice(0, 30).join(''))}`)}>
          Tập lại {fmtInt(Math.min(weak.length, 30))} chữ chưa tốt
        </a>
      )}
    </section>
  );
}

export default function MineApp() {
  return (
    <div className="space-y-8">
      <Words />
      <Chars />
      <ToastHost />
    </div>
  );
}
