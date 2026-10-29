/**
 * Thử thách 1 phút: gõ liên tục các từ hay gặp (cấp ≤ cấp đã chọn), gõ đúng là sang từ sau, đếm số chữ đúng mỗi phút.
 * Kỷ lục lưu trên máy (bảng `bests`, id `toc-do-<cấp>`); lượt gõ vẫn ghi vào `attempts` (kind `type`) cho thống kê.
 */
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from '../../lib/live-query';
import { logAttempt } from '../../lib/attempts';
import { recordBest } from '../../lib/bests';
import type { ImeLexicon } from '../../lib/ime';
import { perMinute, type TypedChar } from '../../lib/typing';
import { Han, btn, btnPrimary } from '../ui';
import { ImeBox } from './ImeBox';
import { speedWords, type DrillItem } from './sources';

const isHan = (c: string) => /\p{Script=Han}/u.test(c);

export function SpeedTest({ lex, level, seconds, showKeys, backHref }: { lex: ImeLexicon | null; level: number; seconds: number; showKeys: boolean; backHref: string }) {
  const [words, setWords] = useState<DrillItem[] | null>(null);
  const [phase, setPhase] = useState<'ready' | 'run' | 'done'>('ready');
  const [at, setAt] = useState(0);
  const [typed, setTyped] = useState<TypedChar[]>([]);
  const [chars, setChars] = useState(0);
  const [left, setLeft] = useState(seconds);
  const [skipped, setSkipped] = useState(0);
  const [errors, setErrors] = useState(0);
  const [miss, setMiss] = useState<{ got: string; want: DrillItem } | null>(null);
  const startAt = useRef(0);
  const bestBefore = useRef(0);
  const best = useLiveQuery((t) => t.bests.get(`toc-do-${level}`).then((r) => r?.cpm ?? 0), [level], 0);

  useEffect(() => {
    let alive = true;
    speedWords(level)
      .then((w) => alive && setWords(w))
      .catch(() => alive && setWords([]));
    return () => {
      alive = false;
    };
  }, [level]);

  useEffect(() => {
    if (phase !== 'run') return;
    const id = window.setInterval(() => {
      const l = Math.max(0, seconds - Math.floor((Date.now() - startAt.current) / 1000));
      setLeft(l);
      if (l === 0) setPhase('done');
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, seconds]);

  const saved = useRef(false);
  useEffect(() => {
    if (phase !== 'done' || saved.current) return;
    saved.current = true;
    void logAttempt({
      kind: 'type',
      itemId: `toc-do-${level}`,
      ok: true,
      durMs: seconds * 1000,
      data: { mode: 'toc-do', level, chars, words: at - skipped, skipped, errors, cpm: perMinute(chars, seconds * 1000) },
    });
    // kỷ lục ghi song song vào bảng `bests` (không bị cắt như attempts)
    void recordBest({ mode: 'toc-do', level, cpm: perMinute(chars, seconds * 1000), chars, words: at - skipped });
  }, [phase, level, chars, at, skipped, errors, seconds]);

  const word = words?.[at % Math.max(1, words.length)];
  const onChange = (v: TypedChar[]) => {
    if (phase !== 'run' || !word) return;
    const han = v.filter((x) => isHan(x.c)).map((x) => x.c).join('');
    if (han === word.zh) {
      setChars((c) => c + word.target.length);
      setAt((a) => a + 1);
      setTyped([]);
      setMiss(null);
    } else if (!word.zh.startsWith(han)) {
      // chọn nhầm chữ: báo ngay, xoá để gõ lại
      setErrors((e) => e + 1);
      setMiss({ got: han, want: word });
      setTyped([]);
    } else setTyped(v);
  };
  const skip = () => {
    setSkipped((s) => s + 1);
    setAt((a) => a + 1);
    setTyped([]);
    setMiss(null);
  };

  if (!words) return <p className="text-muted">Đang chuẩn bị từ…</p>;
  if (!words.length) return <p className="text-muted">Chưa có từ cho cấp này.</p>;

  if (phase === 'ready')
    return (
      <div className="space-y-4 rounded-2xl border border-line bg-card p-5 text-center">
        <p className="text-lg">
          Gõ càng nhiều từ càng tốt trong <b>{seconds} giây</b>. Gõ đúng là sang từ sau.
        </p>
        <p className="text-sm text-muted">Kỷ lục của bạn ở cấp này: {best ? `${best} chữ/phút` : 'chưa có'}</p>
        <button
          type="button"
          className={btnPrimary}
          onClick={() => {
            startAt.current = Date.now();
            bestBefore.current = best;
            setPhase('run');
          }}
        >
          Bắt đầu
        </button>
      </div>
    );

  if (phase === 'done') {
    const cpm = perMinute(chars, seconds * 1000);
    return (
      <div className="space-y-4 rounded-2xl border border-line bg-card p-5 text-center">
        <p className="text-sm text-muted">Hết giờ!</p>
        <p className="text-5xl font-semibold tabular-nums">{cpm}</p>
        <p>
          chữ/phút · {at - skipped} từ đúng{errors ? ` · chọn nhầm ${errors} lần` : ''}
          {skipped ? ` · bỏ qua ${skipped}` : ''}
        </p>
        <p className="text-sm font-semibold">
          {bestBefore.current && cpm > bestBefore.current ? `Kỷ lục mới! (trước: ${bestBefore.current} chữ/phút)` : bestBefore.current ? `Kỷ lục: ${bestBefore.current} chữ/phút` : ''}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              saved.current = false;
              setAt(0);
              setChars(0);
              setSkipped(0);
              setErrors(0);
              setMiss(null);
              setTyped([]);
              setLeft(seconds);
              setWords((w) => (w ? [...w.slice(at), ...w.slice(0, at)] : w));
              setPhase('ready');
            }}
          >
            Thử lại
          </button>
          <a className={btn} href={backHref}>
            Về Gõ chữ
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="tabular-nums" aria-live="off">
          ⏱ <b className="text-lg">{left}</b> giây
        </span>
        <span className="tabular-nums">
          <b className="text-lg">{chars}</b> chữ
        </span>
      </div>
      {word && (
        <div className="rounded-2xl border border-line bg-card p-5 text-center">
          <Han className="text-5xl">{word.zh}</Han>
          {showKeys && <p className="mt-1 font-mono text-lg text-muted">{word.keys}</p>}
        </div>
      )}
      {miss && (
        <p role="status" className="text-center text-sm text-t1">
          Chọn nhầm <Han className="text-lg">{miss.got}</Han>, cần <Han className="text-lg">{miss.want.zh}</Han> ({miss.want.hv}) · gõ lại
        </p>
      )}
      <ImeBox lex={lex} value={typed} onChange={onChange} label="Gõ từ" showInfo={false} autoFocus />
      <button type="button" className={btn} onClick={skip}>
        Bỏ qua từ này
      </button>
    </div>
  );
}
