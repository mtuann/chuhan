/**
 * Trang từ: /tu/?w=<id hoặc chữ giản thể>&l=<cấp>.
 * `w` là id (爱好_ai4hao4) thì mở đúng mục; là chữ (只) thì hiện mọi cách đọc có trong HSK;
 * không có trong HSK thì tra từ điển mở rộng (CVDICT, máy dịch).
 */
import { useEffect, useState } from 'react';
import type { DictEntry, PackKey, WordRec } from '../../schema/data';
import { loadWord } from '../../lib/data';
import { numberedToMarks } from '../../lib/pinyin';
import { lookupExtended, resolveWord } from '../../lib/search-client';
import type { BriefEntry } from '../../lib/search-protocol';
import { isHan, packKey } from '../../lib/text';
import { url } from '../../lib/url';
import { Card, ErrorBox, Han, Loading, Unreviewed, useQueryParam } from '../ui';
import WordView from './WordView';
import { ToastHost } from '../toast';

type State =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'words'; words: WordRec[] }
  | { kind: 'extended'; s: string; entries: DictEntry[] }
  | { kind: 'error'; message: string };

const PACK_KEYS = new Set(['1', '2', '3', '4', '5', '6', '7', 'x']);

const loadAll = async (brief: BriefEntry[]) =>
  (await Promise.all(brief.map((b) => loadWord(b.id, packKey(b.lv))))).filter((x): x is WordRec => !!x);

/**
 * Tải từ cần hiện. `onMore` nhận danh sách đầy đủ khi tìm thêm được cách đọc khác ở cấp cao hơn
 * (trang hiện ngay cách đọc tìm thấy đầu tiên, không chờ tải hết chỉ mục).
 */
async function load(w: string, l: string | null, onMore: (words: WordRec[]) => void): Promise<State> {
  const hint = l && PACK_KEYS.has(l) ? (l as PackKey) : undefined;
  if (w.includes('_')) {
    let word = hint ? await loadWord(w, hint) : undefined;
    if (!word) {
      // chưa biết cấp: hỏi chỉ mục tìm kiếm
      const found = (await resolveWord(w.slice(0, w.indexOf('_')))).find((e) => e.id === w);
      if (found) word = await loadWord(found.id, packKey(found.lv));
    }
    if (word) return { kind: 'words', words: [word] };
    w = w.slice(0, w.indexOf('_'));
  }
  const first = await resolveWord(w);
  if (first.length) {
    const words = await loadAll(first);
    if (words.length) {
      resolveWord(w, true)
        .then(async (all) => {
          if (all.length > first.length) onMore(await loadAll(all));
        })
        .catch(() => undefined);
      return { kind: 'words', words };
    }
  }
  const entries = (await lookupExtended(w, 50)).filter((e) => e[0] === w);
  return { kind: 'extended', s: w, entries };
}

export default function WordPage() {
  const w = (useQueryParam('w') ?? '').trim();
  const l = useQueryParam('l');
  const [state, setState] = useState<State>(w ? { kind: 'loading' } : { kind: 'empty' });

  useEffect(() => {
    if (!w) return;
    let alive = true;
    load(w, l, (words) => alive && setState({ kind: 'words', words }))
      .then((s) => alive && setState(s))
      .catch((err: unknown) => alive && setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) }));
    return () => {
      alive = false;
    };
  }, [w, l]);

  useEffect(() => {
    if (state.kind === 'words') document.title = `${state.words[0].s} · Từ · Chữ Hán`;
    if (state.kind === 'extended') document.title = `${state.s} · Từ · Chữ Hán`;
  }, [state]);

  switch (state.kind) {
    case 'loading':
      return <Loading />;
    case 'empty':
      return (
        <p className="text-muted">
          Chưa chọn từ.{' '}
          <a className="underline" href={url('tra/')}>
            Tra từ
          </a>
        </p>
      );
    case 'error':
      return (
        <ErrorBox>
          Không tải được từ này: {state.message}. Nếu đang offline, hãy mở lại khi có mạng.
        </ErrorBox>
      );
    case 'words':
      return (
        <div className="space-y-6">
          <h1 className="sr-only">Từ {state.words[0].s}</h1>
          {state.words.length > 1 && (
            <p className="text-sm text-muted">
              <Han>{state.words[0].s}</Han> có {state.words.length} mục trong HSK (cách đọc hoặc nghĩa khác nhau).
            </p>
          )}
          {state.words.map((word) => (
            <Card key={word.id}>
              <WordView word={word} />
            </Card>
          ))}
          <ToastHost />
        </div>
      );
    case 'extended':
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">
            <Han>{state.s}</Han>
          </h1>
          {state.entries.length === 0 ? (
            <p className="text-muted">
              Không có trong HSK và từ điển mở rộng.{' '}
              <a className="underline" href={url(`tra/?q=${encodeURIComponent(state.s)}`)}>
                Tìm gần đúng
              </a>
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">Không có trong danh sách HSK. Kết quả từ điển mở rộng:</p>
              {state.entries.map((e, i) => (
                <ExtendedEntry key={i} e={e} />
              ))}
            </>
          )}
        </div>
      );
  }
}

export function ExtendedEntry({ e }: { e: DictEntry }) {
  const [s, t, py, glosses] = e;
  return (
    <Card>
      <p className="text-3xl">
        {[...s].map((c, i) =>
          isHan(c) ? (
            <a key={i} href={url(`chu/?c=${encodeURIComponent(c)}`)} className="hover:text-accent">
              <Han>{c}</Han>
            </a>
          ) : (
            <span key={i}>{c}</span>
          ),
        )}
        {t && <Han className="ml-3 text-lg text-muted">{t}</Han>}
      </p>
      <p className="mt-1 text-lg" lang="zh-Latn-pinyin">
        {numberedToMarks(py)}
      </p>
      <p className="mt-2 text-sm font-semibold text-muted">
        Từ điển mở rộng
        <Unreviewed />
      </p>
      <ol className="mt-1 list-decimal space-y-1 pl-6 text-sm">
        {glosses.slice(0, 6).map((g, i) => (
          <li key={i}>{g}</li>
        ))}
      </ol>
    </Card>
  );
}
