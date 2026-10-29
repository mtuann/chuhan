/**
 * Tra từ: ô tìm luôn ở đầu trang (phím / trên máy tính), kết quả HSK có nhãn cấp và trạng thái đánh dấu (Từ của tôi),
 * chữ Hán ngoài HSK tra thêm trong từ điển mở rộng (CVDICT, máy dịch).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DictEntry } from '../../schema/data';
import type { Hit } from '../../lib/search-core';
import { lookupExtended, onSearchProgress, searchWords } from '../../lib/search-client';
import { sylsToKey, parseNumbered, numberedToMarks } from '../../lib/pinyin';
import { fmtInt, packKey } from '../../lib/text';
import { url } from '../../lib/url';
import { Han, LevelBadge, Pill, Pinyin, Unreviewed } from '../ui';
import { StateBadge, useWordStates } from '../mine/parts';

const EXAMPLES = ['nihao', 'ni3hao3', 'hoc tap', 'đại học', '爱好', 'cảm ơn', 'teacher'];

function initialQuery(): string {
  return new URLSearchParams(window.location.search).get('q') ?? '';
}

export default function SearchApp() {
  const [q, setQ] = useState(initialQuery);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [extended, setExtended] = useState<DictEntry[]>([]);
  const [progress, setProgress] = useState<{ loaded: number; total: number; words: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(0);
  const { states } = useWordStates();

  const run = useCallback(async (query: string) => {
    const ticket = ++latest.current;
    const text = query.trim();
    if (!text) {
      setHits(null);
      setExtended([]);
      return;
    }
    try {
      const res = await searchWords(text, 50);
      if (ticket !== latest.current) return;
      setHits(res.hits);
      setError(null);
      if (/\p{Script=Han}/u.test(text)) {
        const dict = await lookupExtended(text, 40);
        if (ticket !== latest.current) return;
        const inHsk = new Set(res.hits.map((h) => h.id));
        setExtended(
          dict
            .filter(([s, , py]) => {
              const syls = parseNumbered(py);
              return !syls || !inHsk.has(`${s}_${sylsToKey(syls)}`);
            })
            .slice(0, 20),
        );
      } else setExtended([]);
    } catch (err) {
      if (ticket === latest.current) setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // gõ phím: chạy tìm sau 120 ms; cập nhật ?q= để quay lại vẫn còn kết quả
  useEffect(() => {
    const t = window.setTimeout(() => {
      void run(q);
      const u = new URL(window.location.href);
      if (q.trim()) u.searchParams.set('q', q.trim());
      else u.searchParams.delete('q');
      window.history.replaceState(null, '', u);
    }, 120);
    return () => window.clearTimeout(t);
  }, [q, run]);

  // chỉ mục tải xong thêm cấp nào thì chạy lại truy vấn hiện tại
  const qRef = useRef(q);
  qRef.current = q;
  useEffect(
    () =>
      onSearchProgress((p) => {
        setProgress(p);
        if (qRef.current.trim()) void run(qRef.current);
      }),
    [run],
  );

  // dựng chỉ mục khi trình duyệt rảnh, để lần gõ đầu tiên có kết quả ngay
  useEffect(() => {
    const warm = () => void searchWords('', 1).catch(() => undefined);
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) ric(warm);
    else window.setTimeout(warm, 300);
  }, []);

  // phím / để nhảy tới ô tìm; trên máy tính tự đặt con trỏ vào ô tìm
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const loadingIndex = progress && progress.loaded < progress.total;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tra từ</h1>
        <a className="inline-flex min-h-11 items-center text-sm text-muted underline" href={url('bo-thu/')}>
          Bộ thủ →
        </a>
      </div>
      <form role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="block">
          <span className="sr-only">Tìm từ</span>
          <input
            ref={input}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chữ Hán, pinyin, Hán Việt…"
            enterKeyHint="search"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-h-12 w-full rounded-xl border border-line bg-card px-4 text-base focus:border-accent focus:outline-none"
          />
        </label>
      </form>

      {[...q.trim()].filter((c) => /\p{Script=Han}/u.test(c)).length >= 5 && (
        <p className="text-sm">
          <a className="underline" href={url(`?t=${encodeURIComponent(q.trim())}`)}>
            Đọc cả đoạn này: tách từ, pinyin, chạm từng từ để tra →
          </a>
        </p>
      )}

      {loadingIndex && (
        <p className="text-xs text-muted" role="status">
          Đang tải dữ liệu tìm kiếm: {progress.loaded}/{progress.total} gói, {fmtInt(progress.words)} từ…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-t1">
          Không tìm được: {error}. Nếu đang offline, dữ liệu tìm kiếm cần được tải một lần khi có mạng.
        </p>
      )}

      {hits === null ? (
        <div className="space-y-3 text-sm text-muted">
          <p>Tìm trong mọi từ HSK cấp 1–9 theo chữ Hán, pinyin (có dấu, có số hoặc không dấu), âm Hán Việt hoặc nghĩa. Không cần gõ dấu tiếng Việt.</p>
          <p className="flex flex-wrap gap-2">
            {EXAMPLES.map((x) => (
              <button key={x} type="button" className="rounded-full border border-line px-3 py-1 hover:border-accent" onClick={() => setQ(x)}>
                {x}
              </button>
            ))}
          </p>
          <p>
            Chưa biết đọc một chữ? Tìm theo bộ thủ ở trang{' '}
            <a className="underline" href={url('bo-thu/')}>
              Bộ thủ
            </a>
            .
          </p>
          <p className="hidden lg:block">Mẹo: bấm phím / để nhảy tới ô tìm.</p>
        </div>
      ) : hits.length === 0 && extended.length === 0 ? (
        <p className="text-muted">Không tìm thấy “{q.trim()}”.</p>
      ) : (
        <>
          {hits.length > 0 && (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-card" aria-label="Kết quả HSK">
              {hits.map((h) => (
                <li key={h.id} className="flex items-center">
                  <a
                    className="flex min-h-14 min-w-0 flex-1 items-start gap-3 py-3 pr-2 pl-4 hover:bg-accent-soft"
                    href={url(`tu/?w=${encodeURIComponent(h.id)}&l=${packKey(h.lv)}`)}
                  >
                    <Han className="shrink-0 text-2xl leading-tight">{h.s}</Han>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <Pinyin p={h.p} className="text-base" />
                        {h.hv && <span className="text-sm text-muted">{h.hv}</span>}
                        <span className="ml-auto">{h.lv ? <LevelBadge level={h.lv} /> : <Pill>ngoài HSK 2025</Pill>}</span>
                      </span>
                      <span className="line-clamp-2 text-sm">{h.vi || h.en}</span>
                    </span>
                  </a>
                  {states.get(h.id) && (
                    <span className="shrink-0 pr-3">
                      <StateBadge state={states.get(h.id)} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {extended.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">
                Từ điển mở rộng
                <Unreviewed />
              </h2>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
                {extended.map(([s, , py, glosses], i) => (
                  <li key={`${s}-${py}-${i}`}>
                    <a className="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-accent-soft" href={url(`tu/?w=${encodeURIComponent(s)}`)}>
                      <Han className="shrink-0 text-2xl leading-tight">{s}</Han>
                      <span className="min-w-0 flex-1">
                        <span className="block" lang="zh-Latn-pinyin">
                          {numberedToMarks(py)}
                        </span>
                        <span className="line-clamp-2 text-sm">{glosses.slice(0, 2).join('; ')}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
