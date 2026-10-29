/**
 * Từ của tôi, phần dùng chung: trạng thái của mọi từ (cập nhật ngay khi đánh dấu), cấp đã biết, nút đánh dấu
 * "Đang học" / "Đã biết" kèm thông báo Hoàn tác.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { arraySig, useLiveQuery } from '../../lib/live-query';
import { isKnownWord, restoreWords, setWordState, STATE_VI, type MyWordRow, type WordItem, type WordState } from '../../lib/mywords';
import { getSetting } from '../../lib/settings';
import { notify } from '../toast';

/** Trạng thái đánh dấu của mọi từ; Map giữ nguyên identity khi nội dung không đổi (tránh render lại cây chữ). */
export function useWordStates(): { ready: boolean; states: ReadonlyMap<string, WordState>; rows: MyWordRow[] } {
  const rows = useLiveQuery((t) => t.words.toArray(), [], null as MyWordRow[] | null);
  const sig = useMemo(() => arraySig(rows, (r) => [r.itemId, r.st]), [rows]);
  const states = useMemo(() => new Map((rows ?? []).map((r) => [r.itemId, r.st])), [sig]);
  return { ready: rows !== null, states, rows: rows ?? [] };
}

/** Cấp đã biết (cài đặt `knownLevel`), đọc một lần khi mở trang. */
export function useKnownLevel(): number {
  const [lv, setLv] = useState(0);
  useEffect(() => {
    getSetting('knownLevel')
      .then(setLv)
      .catch(() => undefined);
  }, []);
  return lv;
}

/** Hàm "từ này đã biết chưa" theo trạng thái đánh dấu và cấp đã biết. */
export function useIsKnown() {
  const { states } = useWordStates();
  const knownLevel = useKnownLevel();
  const known = useCallback((id: string, lv?: number) => isKnownWord(id, lv, states, knownLevel), [states, knownLevel]);
  return { known, states, knownLevel };
}

/** Đánh dấu (hoặc bỏ đánh dấu) các từ, báo kèm Hoàn tác. */
export async function markWords(items: readonly WordItem[], st: WordState | null, src: string): Promise<void> {
  if (!items.length) return;
  const old = await setWordState(items, st, src);
  const ids = items.map((x) => x.id);
  const what = items.length === 1 ? items[0].s : `${items.length} từ`;
  notify({
    text: st ? `${what}: ${STATE_VI[st].toLowerCase()}.` : `Đã bỏ đánh dấu ${what}.`,
    undo: () => restoreWords(ids, old),
    link: !!st,
  });
}

/** Hai nút "Đang học" / "Đã biết" (bấm lại nút đang chọn để bỏ đánh dấu). */
export function MarkButtons({ item, state, src, onMark }: { item: WordItem; state?: WordState; src: string; onMark?: (st: WordState | null) => void }) {
  const [busy, setBusy] = useState(false);
  const set = (st: WordState) => {
    const next = state === st ? null : st;
    setBusy(true);
    onMark?.(next);
    markWords([item], next, src)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  const look = (on: boolean) =>
    `inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold ${on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-card hover:border-accent'}`;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={`Đánh dấu ${item.s}`}>
      <button type="button" disabled={busy} aria-pressed={state === 'hoc'} className={look(state === 'hoc')} onClick={() => set('hoc')}>
        ☆ {STATE_VI.hoc}
      </button>
      <button type="button" disabled={busy} aria-pressed={state === 'biet'} className={look(state === 'biet')} onClick={() => set('biet')}>
        ✓ {STATE_VI.biet}
      </button>
    </div>
  );
}

/** Nhãn trạng thái nhỏ trong danh sách. */
export function StateBadge({ state }: { state?: WordState }) {
  if (!state) return null;
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${state === 'biet' ? 'bg-t2/10 text-t2' : 'border border-accent text-accent'}`}>
      {state === 'biet' ? '✓ ' : '☆ '}
      {STATE_VI[state]}
    </span>
  );
}
