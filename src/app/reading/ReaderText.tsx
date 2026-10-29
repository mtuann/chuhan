/**
 * Hiện văn bản đã tách từ (trang Đọc): mỗi từ một cột (pinyin có màu thanh ở trên, chữ giữa, gợi ý Hán Việt dưới), từ
 * chưa biết gạch chân chấm, từ đang học nền nhạt, chạm vào từ để tra. Mỗi câu có nút nghe.
 */
import { useMemo } from 'react';
import { tokText, type ReadTok } from '../../lib/reader';
import { SpeakerIcon, TONE_CLASS, colorizePinyin, useWordVoices } from '../ui';

export type PinyinMode = 'all' | 'new' | 'off';

/** Token kèm vị trí trong cả văn bản (để chạm vào và đổi cách đọc). */
export interface PlacedTok {
  i: number;
  tok: ReadTok;
}

export interface ReaderOpts {
  pinyin: PinyinMode;
  /** gợi ý âm Hán Việt dưới từ chưa biết */
  hv: boolean;
  known: (t: ReadTok) => boolean;
  /** từ đang học (nền nhạt) */
  learning: (t: ReadTok) => boolean;
  onTap: (i: number) => void;
}

function TokPinyin({ p, alt }: { p: string; alt: boolean }) {
  return (
    <span lang="zh-Latn-pinyin" className="block text-center text-[0.7rem] leading-tight whitespace-nowrap">
      {colorizePinyin(p).map((x, k) => (
        <span key={k} className={x.tone ? TONE_CLASS[x.tone] : undefined}>
          {x.text}
        </span>
      ))}
      {alt && (
        <sup className="text-muted" title="Máy đoán cách đọc; chạm vào từ để xem cách đọc khác">
          ?
        </sup>
      )}
    </span>
  );
}

const OPENING = /^[“‘《〈「『【（(]$/u;

/** Dấu câu đóng đi liền với từ đứng trước, dấu mở đi liền với từ đứng sau (không bị đẩy xuống đầu dòng). */
function groups(toks: PlacedTok[]): PlacedTok[][] {
  const out: PlacedTok[][] = [];
  for (const x of toks) {
    const last = out[out.length - 1];
    const prev = last?.[last.length - 1]?.tok;
    const closing = x.tok.kind === 'punct' && !OPENING.test(x.tok.t) && prev && prev.kind !== 'space';
    const afterOpen = prev?.kind === 'punct' && OPENING.test(prev.t);
    if (last && (closing || afterOpen)) last.push(x);
    else out.push([x]);
  }
  return out;
}

function Tok({ x, o }: { x: PlacedTok; o: ReaderOpts }) {
  const t = x.tok;
  if (t.kind === 'space') return <span className="inline-block w-2" aria-hidden="true" />;
  if (t.kind === 'break') return null;
  // dấu câu, chữ Latinh: cùng ba hàng như từ (pinyin, chữ, Hán Việt) để thẳng hàng với chữ Hán
  if (t.kind === 'punct' || t.kind === 'other')
    return (
      <span className="inline-flex flex-col items-center">
        {o.pinyin !== 'off' && <span className="block text-[0.7rem] leading-tight">&nbsp;</span>}
        <span className={t.kind === 'other' ? 'px-0.5' : 'han'}>{t.t}</span>
        {o.hv && <span className="block text-[0.65rem] leading-tight">&nbsp;</span>}
      </span>
    );
  const known = o.known(t);
  const proper = t.kind === 'dict' && t.proper;
  const learning = o.learning(t);
  const p = t.kind === 'char' ? '' : t.p;
  const showP = p && (o.pinyin === 'all' || (o.pinyin === 'new' && !known && !proper));
  const hv = t.kind === 'word' && o.hv && !known && t.hv ? t.hv : '';
  const label = `${t.t}${p ? ` ${p}` : ''}${!known && !proper ? ', chưa biết' : ''}${learning ? ', đang học' : ''}: tra từ`;
  return (
    <button
      type="button"
      className={`inline-flex flex-col items-center rounded-md px-0.5 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent ${learning ? 'bg-accent-soft/60' : ''}`}
      onClick={() => o.onTap(x.i)}
      aria-label={label}
      data-i={x.i}
    >
      {o.pinyin !== 'off' && (showP ? <TokPinyin p={p} alt={t.kind !== 'char' && t.alt} /> : <span className="block text-[0.7rem] leading-tight">&nbsp;</span>)}
      <span
        className={`han ${!known && !proper ? 'underline decoration-dotted decoration-2 underline-offset-4' : ''}`}
      >
        {t.t}
      </span>
      {o.hv && <span className="block text-center text-[0.65rem] leading-tight whitespace-nowrap text-muted">{hv || ' '}</span>}
    </button>
  );
}

const SENT_END = /[。！？!?…]/;
const CLOSING = /^[”’》〉」』】）)]$/u;

/** Chia một đoạn thành câu; dấu đóng ngay sau dấu hết câu (。”) vẫn thuộc câu trước. */
function splitSentences(para: PlacedTok[]): PlacedTok[][] {
  const out: PlacedTok[][] = [[]];
  for (const x of para) {
    const cur = out[out.length - 1];
    if (!cur.length && out.length > 1 && x.tok.kind === 'punct' && CLOSING.test(x.tok.t)) out[out.length - 2].push(x);
    else cur.push(x);
    if (x.tok.kind === 'punct' && SENT_END.test(x.tok.t)) out.push([]);
  }
  return out.filter((sent) => sent.some((x) => x.tok.kind !== 'space'));
}

/** Nút nghe nhỏ ở cuối câu (giọng máy); máy không có giọng tiếng Trung thì ẩn. */
function MiniSpeak({ text, n }: { text: string; n: number }) {
  const voices = useWordVoices(text);
  if (!voices?.length) return null;
  return (
    <button
      type="button"
      className="ml-1 inline-flex size-8 items-center justify-center self-end rounded-full text-muted hover:bg-accent-soft hover:text-ink"
      aria-label={`Nghe câu ${n}`}
      onClick={() => void voices[0].play(1).catch(() => undefined)}
    >
      <SpeakerIcon />
    </button>
  );
}

/** Văn bản: đoạn (theo dòng) → câu (nút nghe ở cuối câu) → từ. Danh sách token (hàng nghìn spans) chỉ tính lại khi
 *  văn bản hoặc tuỳ chọn hiển thị đổi; cha cần giữ `o` ổn định (useMemo) để memo có tác dụng. */
export function ReaderText({ toks, o, className = '' }: { toks: ReadTok[]; o: ReaderOpts; className?: string }) {
  const body = useMemo(() => {
    const paras: PlacedTok[][] = [[]];
    toks.forEach((tok, i) => {
      if (tok.kind === 'break') paras.push([]);
      else paras[paras.length - 1].push({ i, tok });
    });
    let n = 0;
    return paras
      .filter((para) => para.length)
      .map((para, pi) => (
        <p key={pi} className="flex flex-wrap items-end gap-x-0.5 gap-y-2 text-2xl leading-normal">
          {splitSentences(para).map((sent) => {
            n++;
            const text = sent.map((x) => tokText(x.tok)).join('').trim();
            return (
              <span key={sent[0].i} className="contents">
                {groups(sent).map((g) => (
                  <span key={g[0].i} className="inline-flex items-end">
                    {g.map((x) => (
                      <Tok key={x.i} x={x} o={o} />
                    ))}
                  </span>
                ))}
                <MiniSpeak text={text} n={n} />
              </span>
            );
          })}
        </p>
      ));
  }, [toks, o]);
  return (
    <div className={`space-y-4 ${className}`} lang="zh-CN">
      {body}
    </div>
  );
}
