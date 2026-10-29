/**
 * 214 bộ Khang Hy (/bo-thu/): số bộ, chữ bộ, các dạng biến thể, tên theo âm Hán Việt của chữ bộ, tên gọi khác có nguồn,
 * các chữ HSK có bộ đó (chạm để mở).
 * Số bộ và dạng biến thể theo Unicode; âm Hán Việt theo bảng Hán Việt của dự án.
 */
import { useEffect, useState } from 'react';
import type { RadicalsPack } from '../../schema/data';
import { loadRadicals } from '../../lib/data';
import { url } from '../../lib/url';
import { ErrorBox, Han, Loading } from '../ui';
import { radicalName } from './Radical';

export default function RadicalsApp() {
  const [pack, setPack] = useState<RadicalsPack | 'loading' | { error: string }>('loading');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    loadRadicals()
      .then(setPack)
      .catch((e: unknown) => setPack({ error: e instanceof Error ? e.message : String(e) }));
  }, []);
  useEffect(() => {
    if (typeof pack === 'object' && !('error' in pack) && window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
  }, [pack]);
  if (pack === 'loading') return <Loading label="Đang tải bộ thủ…" />;
  if ('error' in pack) return <ErrorBox>Không tải được bộ thủ: {pack.error}.</ErrorBox>;
  const needle = q.trim().toLowerCase();
  const list = pack.radicals.filter(
    (r) =>
      !needle ||
      String(r.n) === needle ||
      r.c === needle ||
      r.f?.includes(needle) ||
      r.hv?.some((h) => h.normalize('NFD').replace(/\p{M}/gu, '').includes(needle.normalize('NFD').replace(/\p{M}/gu, ''))) ||
      r.aka?.some(([, a]) => a.includes(needle)),
  );
  return (
    <div>
      <h1 className="text-2xl font-semibold">214 bộ thủ</h1>
      <p className="mt-1 text-muted">
        Bộ thủ theo từ điển Khang Hy. Tên bộ đọc theo âm Hán Việt của chữ bộ (ví dụ 水 → bộ Thuỷ); dạng biến thể là cách bộ viết khi làm một phần của chữ (氵).
        Chạm “chữ” để xem các chữ HSK có bộ đó.
      </p>
      <label className="mt-4 block">
        <span className="sr-only">Tìm bộ</span>
        <input
          type="search"
          className="block min-h-11 w-full rounded-xl border border-line bg-card px-3"
          placeholder="Tìm: số bộ, chữ, tên (thuy, tâm…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {list.map((r) => (
          <li
            key={r.n}
            id={`bo-${r.n}`}
            className={`flex min-h-16 flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-2 target:border-accent ${open === r.n ? 'border-accent sm:col-span-2' : 'border-line'}`}
          >
            <span className="w-8 shrink-0 text-right text-sm text-muted tabular-nums">{r.n}</span>
            <a href={url(`chu/?c=${encodeURIComponent(r.c)}`)} className="shrink-0 rounded-lg px-1 hover:bg-accent-soft" aria-label={`Chữ ${r.c}`}>
              <Han className="text-3xl">{r.c}</Han>
            </a>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{radicalName(r)}</span>
              <span className="block text-sm text-muted">
                {r.f?.length ? (
                  <>
                    dạng khác: <Han>{r.f.join(' ')}</Han>
                  </>
                ) : null}
                {r.hv && r.hv.length > 1 ? `${r.f?.length ? ' · ' : ''}cũng đọc ${r.hv.slice(1).join(', ')}` : ''}
              </span>
              {r.aka?.length ? (
                <span className="block text-sm text-muted">
                  còn gọi:{' '}
                  {r.aka.map(([f, a], i) => (
                    <span key={f + a}>
                      {i > 0 && ', '}
                      {a} (<Han>{f}</Han>)
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
            {r.ch && (
              <button
                type="button"
                aria-expanded={open === r.n}
                aria-controls={`chu-bo-${r.n}`}
                className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line px-3 text-sm hover:border-accent"
                onClick={() => setOpen((x) => (x === r.n ? null : r.n))}
              >
                {[...r.ch].length} chữ
              </button>
            )}
            {open === r.n && r.ch && (
              <div id={`chu-bo-${r.n}`} className="flex w-full flex-wrap gap-1 border-t border-line pt-2" lang="zh-CN">
                {[...r.ch].map((c) => (
                  <a
                    key={c}
                    href={url(`chu/?c=${encodeURIComponent(c)}`)}
                    className="inline-flex size-11 items-center justify-center rounded-lg text-2xl hover:bg-accent-soft"
                    aria-label={`Chữ ${c}`}
                  >
                    <Han>{c}</Han>
                  </a>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-muted">
        Nguồn: số bộ và dạng biến thể theo Unicode (CJKRadicals.txt, EquivalentUnifiedIdeograph.txt); bộ của từng chữ theo Make Me a Hanzi; âm Hán Việt
        theo bảng Hán Việt mở; tên gọi khác theo Wikipedia tiếng Việt. Xem trang Nguồn &amp; giấy phép.
      </p>
    </div>
  );
}
