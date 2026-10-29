/**
 * Trang chữ: /chu/?c=<chữ>. Tải bản ghi chữ, nét, từ chứa chữ và nghĩa (CVDICT) song song, hiện dần.
 */
import { useEffect, useState } from 'react';
import type { CharRec, DictEntry } from '../../schema/data';
import { loadChar, loadStrokes } from '../../lib/data';
import type { BriefEntry } from '../../lib/search-protocol';
import { lookupExtended, wordsContaining } from '../../lib/search-client';
import { url } from '../../lib/url';
import { Card, ErrorBox, Loading, useQueryParam } from '../ui';
import CharView, { type StrokeData } from './CharView';

export default function CharPage() {
  const raw = (useQueryParam('c') ?? '').trim();
  const c = raw ? String.fromCodePoint(raw.codePointAt(0)!) : '';
  const [rec, setRec] = useState<CharRec | null | undefined>(undefined);
  const [strokes, setStrokes] = useState<StrokeData | null | undefined>(undefined);
  const [words, setWords] = useState<BriefEntry[] | null | undefined>(undefined);
  const [meanings, setMeanings] = useState<DictEntry[] | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!c) return;
    document.title = `${c} · Chữ · Chữ Hán`;
    let alive = true;
    const fail = (err: unknown) => alive && setError(err instanceof Error ? err.message : String(err));
    loadChar(c)
      .then((r) => alive && setRec(r?.rec ?? null))
      .catch(fail);
    loadStrokes(c)
      .then((s) => alive && setStrokes(s ?? null))
      .catch(() => alive && setStrokes(null));
    wordsContaining(c, 3)
      .then((w) => alive && setWords(w))
      .catch(() => alive && setWords(null));
    lookupExtended(c, 60)
      .then((m) => alive && setMeanings(m))
      .catch(() => alive && setMeanings(null));
    return () => {
      alive = false;
    };
  }, [c]);

  if (!c) {
    return (
      <p className="text-muted">
        Chưa chọn chữ.{' '}
        <a className="underline" href={url('tra/')}>
          Tra từ
        </a>
      </p>
    );
  }
  if (error) return <ErrorBox>Không tải được chữ này: {error}. Nếu đang offline, hãy mở lại khi có mạng.</ErrorBox>;
  if (rec === undefined) return <Loading />;
  return (
    <Card>
      <CharView c={c} rec={rec ?? undefined} strokes={strokes} words={words} meanings={meanings} />
    </Card>
  );
}
