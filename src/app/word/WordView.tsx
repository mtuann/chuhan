/**
 * Một từ (trang từ): chữ (chạm để xem trang chữ), pinyin có màu thanh, nghe, Hán Việt, nghĩa (CVDICT), lượng từ,
 * đánh dấu "Đang học" / "Đã biết", câu bạn gặp khi đọc, cách viết. "Chi tiết": nghĩa tiếng Anh, cấp theo các chuẩn, nguồn.
 */
import { useCallback, useState } from 'react';
import { useLiveQuery } from '../../lib/live-query';
import type { WordRec } from '../../schema/data';
import { hvString, isHan, levelLabel, posLabel } from '../../lib/text';
import { url } from '../../lib/url';
import { MarkButtons, useWordStates } from '../mine/parts';
import { SentenceView, WordSheet } from './Sentence';
import { Han, LevelBadge, Pill, Pinyin, SpeakButtons, Unreviewed, btn } from '../ui';

const MAX_VI = 4;

/** Âm Hán Việt theo từng chữ (cách đọc khác hiện khi trỏ chuột; âm chỉ khớp theo chữ thì mờ). */
function HanViet({ word }: { word: WordRec }) {
  const parts = (word.hv ?? []).map((r, i) => ({ r, i })).filter((x) => x.r);
  if (!parts.length) return null;
  return (
    <p className="text-lg">
      <span className="mr-2 text-sm text-muted">Hán Việt</span>
      {parts.map((x, k) => {
        const approx = word.hva?.includes(x.i);
        return (
          <span key={x.i}>
            {k > 0 && ' '}
            <span
              className={approx ? 'opacity-60' : ''}
              title={approx ? 'Âm theo chữ, chưa chắc khớp cách đọc này' : x.r!.length > 1 ? `Cách đọc khác: ${x.r!.slice(1).join(', ')}` : undefined}
            >
              {x.r![0]}
            </span>
          </span>
        );
      })}
    </p>
  );
}

export default function WordView({ word }: { word: WordRec }) {
  const [moreVi, setMoreVi] = useState(false);
  const [lookup, setLookup] = useState<string | null>(null);
  const { states } = useWordStates();
  const context = useLiveQuery((t) => t.contexts.get(word.id), [word.id], undefined);
  const chars = [...word.s];
  const vi = word.vi ?? [];
  const shownVi = moreVi ? vi : vi.slice(0, MAX_VI);
  const altHv = (word.hv ?? [])
    .map((r, i) => (r && r.length > 1 ? `${chars[i]}: ${r.join(', ')}` : null))
    .filter(Boolean);
  const closeSheet = useCallback(() => setLookup(null), []);
  const item = { id: word.id, lv: word.lv.e25, s: word.s, p: word.p, hv: hvString(word), vi: vi[0] };

  return (
    <article className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {word.lv.e25 !== undefined ? <LevelBadge level={word.lv.e25} /> : <Pill>Ngoài HSK 2025</Pill>}
        {(word.pos ?? []).map((p) => (
          <Pill key={p}>{posLabel(p)}</Pill>
        ))}
      </div>

      <div>
        <h2 className="sr-only">
          {word.s} ({word.p})
        </h2>
        <p className="flex flex-wrap gap-x-1 text-6xl leading-tight font-normal sm:text-7xl">
          {chars.map((c, i) =>
            isHan(c) ? (
              <a
                key={i}
                href={url(`chu/?c=${encodeURIComponent(c)}`)}
                className="rounded-lg hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
                aria-label={`Xem chữ ${c}`}
              >
                <Han>{c}</Han>
              </a>
            ) : (
              <span key={i}>{c}</span>
            ),
          )}
        </p>
        <p className="mt-2 text-2xl">
          <Pinyin p={word.p} />
        </p>
      </div>

      <SpeakButtons text={word.s} label={word.p} wordId={word.id} />

      <HanViet word={word} />

      <section aria-labelledby={`nghia-${word.id}`}>
        <h2 id={`nghia-${word.id}`} className="text-sm font-semibold text-muted">
          Nghĩa
          {vi.length > 0 && <Unreviewed />}
        </h2>
        {vi.length ? (
          <>
            <ol className="mt-1 list-decimal space-y-1 pl-6">
              {shownVi.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ol>
            {vi.length > MAX_VI && (
              <button type="button" className="mt-1 text-sm text-accent underline" onClick={() => setMoreVi((x) => !x)}>
                {moreVi ? 'Thu gọn' : `Xem thêm ${vi.length - MAX_VI} nghĩa`}
              </button>
            )}
          </>
        ) : (
          <p className="mt-1 text-muted">
            Chưa có nghĩa tiếng Việt.{word.en?.length ? ` Tiếng Anh: ${word.en.slice(0, 3).join('; ')}` : ''}
          </p>
        )}
        {word.cl?.length ? (
          <p className="mt-2 text-sm">
            <span className="text-muted">Lượng từ: </span>
            {word.cl.map((c, i) => (
              <span key={c}>
                {i > 0 && ', '}
                <a className="underline decoration-line underline-offset-4" href={url(`tu/?w=${encodeURIComponent(c)}`)}>
                  <Han>{c}</Han>
                </a>
              </span>
            ))}
          </p>
        ) : null}
      </section>

      <MarkButtons item={item} state={states.get(word.id)} src="tu" />

      {context && (
        <section aria-labelledby={`gap-${word.id}`}>
          <h2 id={`gap-${word.id}`} className="text-sm font-semibold text-muted">
            Câu bạn gặp khi đọc
          </h2>
          <div className="mt-2 rounded-xl border border-line px-4 py-3">
            <SentenceView tk={context.tk} onWord={setLookup} />
          </div>
        </section>
      )}

      {chars.some(isHan) && (
        <div className="flex flex-wrap gap-2">
          <a className={btn} href={url(`viet/cau/?t=${encodeURIComponent(word.s)}`)}>
            ✎ Xem cách viết
          </a>
          <a className={btn} href={url(`viet/?chu=${encodeURIComponent(word.s)}`)}>
            Tập viết
          </a>
        </div>
      )}

      <details className="rounded-xl border border-line px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold">Chi tiết</summary>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {word.en?.length ? (
            <>
              <dt className="text-muted">Tiếng Anh</dt>
              <dd>{word.en.slice(0, 6).join('; ')}</dd>
            </>
          ) : null}
          {word.t ? (
            <>
              <dt className="text-muted">Phồn thể</dt>
              <dd>
                <Han className="text-lg">{word.t}</Han>
              </dd>
            </>
          ) : null}
          <dt className="text-muted">Cấp</dt>
          <dd>
            {word.lv.e25 !== undefined ? `Đề cương 2025: ${levelLabel(word.lv.e25)}` : 'Không có trong đề cương 2025'}
            {word.also?.length ? ` (gặp lại ở ${word.also.map((l) => levelLabel(l)).join(', ')})` : ''}
            {word.lv.s21 !== undefined && ` · Chuẩn 2021: cấp ${word.lv.s21 === 7 ? '7–9' : word.lv.s21}`}
            {word.lv.h20 !== undefined && ` · HSK 2.0: cấp ${word.lv.h20}`}
          </dd>
          {altHv.length ? (
            <>
              <dt className="text-muted">Hán Việt khác</dt>
              <dd>{altHv.join(' · ')}</dd>
            </>
          ) : null}
          <dt className="text-muted">Nguồn</dt>
          <dd>
            Nghĩa Việt: CVDICT (CC BY-SA 4.0, máy dịch) · Nghĩa Anh: CC-CEDICT · Hán Việt:
            hanviet-pinyin-wordlist ·{' '}
            <a className="underline" href={url('ban-quyen/')}>
              chi tiết
            </a>
          </dd>
        </dl>
      </details>
      <WordSheet wordId={lookup} onClose={closeSheet} />
    </article>
  );
}

