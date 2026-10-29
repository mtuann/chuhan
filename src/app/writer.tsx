/**
 * Ô 田字格 dùng Hanzi Writer (tải động để trang mở nhanh): xem nét, tô theo nét mờ, viết không có nét mờ.
 */
import { useEffect, useRef, useState } from 'react';
import type HanziWriter from 'hanzi-writer';
import { strokeUrl } from '../lib/data';
import { relativeClipPaths } from './writing/clip';

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export interface QuizResult {
  /** tổng số lần viết sai */
  mistakes: number;
  strokes: number;
  /** đã phải hiện gợi ý (sai 3 lần cùng một nét) */
  hint: boolean;
}

export interface WriterControl {
  animate(): Promise<void>;
  /** `outline`: hiện nét mờ để tô; `hintAfter`: số lần sai một nét thì hiện gợi ý */
  quiz(opts: { outline: boolean; hintAfter: number; onDone: (r: QuizResult) => void }): void;
  showChar(): void;
}

/** Ô viết chữ `char`. `onReady` nhận bộ điều khiển khi dữ liệu nét đã tải. */
export function WriterBox({
  char,
  max = 280,
  outline = true,
  showChar = false,
  onReady,
  onError,
}: {
  char: string;
  max?: number;
  outline?: boolean;
  showChar?: boolean;
  onReady?: (c: WriterControl) => void;
  onError?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const ready = useRef(onReady);
  ready.current = onReady;
  const fail = useRef(onError);
  fail.current = onError;

  useEffect(() => {
    let alive = true;
    let writer: HanziWriter | null = null;
    (async () => {
      const el = box.current;
      if (!el) return;
      const { default: HW } = await import('hanzi-writer');
      if (!alive) return;
      el.innerHTML = '';
      const size = Math.max(180, Math.min(max, el.clientWidth || max));
      writer = HW.create(el, char, {
        width: size,
        height: size,
        padding: 14,
        showOutline: outline,
        showCharacter: showChar,
        charDataLoader: (ch, onLoad, onErr) => {
          fetch(strokeUrl(ch))
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then(onLoad)
            .catch((e) => {
              if (alive) {
                setFailed(true);
                fail.current?.();
              }
              onErr(e);
            });
        },
        onLoadCharDataSuccess: () => {
          if (!alive || !writer) return;
          const w = writer;
          setTimeout(() => relativeClipPaths(el), 0);
          ready.current?.({
            animate: () =>
              new Promise<void>((resolve) => {
                w.cancelQuiz();
                w.showCharacter();
                void w.animateCharacter({ onComplete: () => resolve() });
              }),
            quiz: ({ outline: ol, hintAfter, onDone }) => {
              let hint = false;
              let strokes = 0;
              w.cancelQuiz();
              w.hideCharacter();
              if (ol) w.showOutline();
              else w.hideOutline();
              void w.quiz({
                showHintAfterMisses: hintAfter,
                onMistake: (d) => {
                  if (d.mistakesOnStroke >= hintAfter) hint = true;
                },
                onCorrectStroke: (d) => {
                  strokes = d.strokeNum + d.strokesRemaining + 1;
                },
                onComplete: (d) => onDone({ mistakes: d.totalMistakes, strokes, hint }),
              });
            },
            showChar: () => {
              w.cancelQuiz();
              w.showCharacter();
            },
          });
        },
        strokeColor: cssVar('--ink', '#1a1a19'),
        outlineColor: cssVar('--line', '#e4e2dc'),
        drawingColor: cssVar('--accent', '#9a6b12'),
        highlightColor: cssVar('--t3', '#02629c'),
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 200,
      });
    })().catch(() => {
      if (alive) {
        setFailed(true);
        fail.current?.();
      }
    });
    return () => {
      alive = false;
      writer?.cancelQuiz();
    };
  }, [char, max, outline, showChar]);

  if (failed) return <p className="text-sm text-muted">Chưa có dữ liệu nét cho chữ này (cần mạng lần đầu).</p>;
  return (
    <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-xl border border-line bg-paper" style={{ maxWidth: max }}>
      {/* kẻ ô 田字格: hai đường giữa nét đứt */}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full text-line" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div ref={box} className="relative size-full touch-none" aria-label={`Ô viết chữ ${char}`} />
    </div>
  );
}
