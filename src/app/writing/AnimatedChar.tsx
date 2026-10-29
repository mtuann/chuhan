/**
 * Một ô 田字格 có animation nét (Hanzi Writer, tải động). Khi dữ liệu nét đã tải, báo bộ điều khiển cho trang;
 * không có dữ liệu nét thì báo `null` và hiện chữ tĩnh bằng phông chữ.
 */
import { useEffect, useRef, useState } from 'react';
import type HanziWriter from 'hanzi-writer';
import { loadStrokes } from '../../lib/data';
import type { CharAnim } from '../../lib/stroke-runner';
import { relativeClipPaths } from './clip';

export const SPEEDS = {
  cham: { label: 'Chậm', factor: 0.5, strokeAnimationSpeed: 0.5, delayBetweenStrokes: 450, strokeFadeDuration: 300 },
  vua: { label: 'Vừa', factor: 1, strokeAnimationSpeed: 1, delayBetweenStrokes: 220, strokeFadeDuration: 250 },
  nhanh: { label: 'Nhanh', factor: 2.2, strokeAnimationSpeed: 2.2, delayBetweenStrokes: 80, strokeFadeDuration: 150 },
} as const;
export type SpeedKey = keyof typeof SPEEDS;

export interface CharHandle extends CharAnim {
  strokes: number;
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const padOf = (size: number) => Math.max(3, Math.round(size * 0.06));


/** Kẻ ô 田字格: hai đường giữa nét đứt. */
export function TianGrid() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full text-line" viewBox="0 0 100 100" preserveAspectRatio="none">
      <line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function AnimatedChar({
  c,
  size,
  speed,
  outline,
  radical,
  onReady,
}: {
  c: string;
  size: number;
  speed: SpeedKey;
  outline: boolean;
  radical: boolean;
  onReady: (h: CharHandle | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const [failed, setFailed] = useState(false);
  const ready = useRef(onReady);
  ready.current = onReady;
  const opts = useRef({ size, outline, radical });
  opts.current = { size, outline, radical };

  useEffect(() => {
    let alive = true;
    (async () => {
      const { default: HW } = await import('hanzi-writer');
      const el = box.current;
      if (!alive || !el) return;
      el.innerHTML = '';
      const sp = SPEEDS[speed];
      const o = opts.current;
      const w: HanziWriter = HW.create(el, c, {
        width: o.size,
        height: o.size,
        padding: padOf(o.size),
        showOutline: o.outline,
        showCharacter: false,
        strokeAnimationSpeed: sp.strokeAnimationSpeed,
        delayBetweenStrokes: sp.delayBetweenStrokes,
        strokeFadeDuration: sp.strokeFadeDuration,
        strokeColor: cssVar('--ink', '#1a1a19'),
        outlineColor: cssVar('--line', '#e4e2dc'),
        radicalColor: o.radical ? cssVar('--accent', '#9a6b12') : null,
        charDataLoader: (ch, onLoad, onError) => {
          loadStrokes(ch)
            .then((d) => (d ? onLoad(d) : onError(new Error('Không có dữ liệu nét'))))
            .catch(onError);
        },
        onLoadCharDataSuccess: (data) => {
          if (!alive) return;
          writer.current = w;
          // nét được dựng ngay sau lúc này
          setTimeout(() => relativeClipPaths(box.current), 0);
          ready.current({
            strokes: data.strokes.length,
            animate: () =>
              new Promise<void>((resolve) => {
                relativeClipPaths(box.current);
                void w.animateCharacter({ onComplete: () => resolve() });
              }),
            hide: () => void w.hideCharacter(),
            show: () => void w.showCharacter(),
            pause: () => void w.pauseAnimation(),
            resume: () => void w.resumeAnimation(),
          });
        },
        onLoadCharDataError: () => {
          if (!alive) return;
          setFailed(true);
          ready.current(null);
        },
      });
    })().catch(() => {
      if (!alive) return;
      setFailed(true);
      ready.current(null);
    });
    return () => {
      alive = false;
      void writer.current?.pauseAnimation();
      writer.current = null;
    };
  }, [c, speed]);

  useEffect(() => {
    writer.current?.updateDimensions({ width: size, height: size, padding: padOf(size) });
    relativeClipPaths(box.current);
  }, [size]);
  useEffect(() => {
    const w = writer.current;
    if (!w) return;
    void (outline ? w.showOutline() : w.hideOutline());
  }, [outline]);
  useEffect(() => {
    void writer.current?.updateColor('radicalColor', radical ? cssVar('--accent', '#9a6b12') : null);
  }, [radical]);

  if (failed)
    return (
      <span className="han flex size-full items-center justify-center text-muted" lang="zh-CN" style={{ fontSize: Math.round(size * 0.7) }} title="Chưa có dữ liệu nét cho chữ này">
        {c}
      </span>
    );
  return <div ref={box} className="relative size-full" />;
}
