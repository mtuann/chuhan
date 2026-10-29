/**
 * Đọc (trang chủ; ?t=… để mở sẵn một đoạn, ?doan=<mã> mở đoạn văn đã lưu ở Gõ theo đoạn văn): dán một đoạn tiếng Trung
 * bất kỳ (tin nhắn, thực đơn, đoạn sách), app tách từ, ghi pinyin theo ngữ cảnh, tô màu thanh, gợi ý Hán Việt, gạch chân
 * từ chưa biết; chạm để tra và đánh dấu "Đang học" / "Đã biết" (lưu kèm câu gặp từ). Văn bản chỉ nằm trên máy.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSetting, setSetting } from '../../lib/settings';
import { coverage, type HskEntry, type ReadTok } from '../../lib/reader';
import { fmtInt } from '../../lib/text';
import { url } from '../../lib/url';
import { SpeakSentence } from '../word/Sentence';
import { getPassage, savePassage } from '../typing/passages';
import { ErrorBox, Loading, btn, btnPrimary, useQueryParam } from '../ui';
import { loadHsk, readText } from './readText';
import { ReaderText } from './ReaderText';
import { ReaderControls, ReaderSheet, UnknownWords, useMark, useReaderPrefs } from './shared';
import { useIsKnown } from '../mine/parts';
import ResumeBar from '../practice/ResumeBar';
import { ToastHost } from '../toast';

const MAX_CHARS = 5000;
const HISTORY = 10;
const EXAMPLE = '明天下午三点在学校门口见，别迟到！';

interface Saved {
  text: string;
  at: number;
}

export default function PasteApp() {
  const q = useQueryParam('t');
  const [text, setText] = useState(q ?? '');
  const [doc, setDoc] = useState<{ text: string; toks: ReadTok[] } | null>(null);
  const [editing, setEditing] = useState(!q && !new URLSearchParams(window.location.search).get('doan'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefs = useReaderPrefs();
  const [history, setHistory] = useState<Saved[]>([]);
  const [sheet, setSheet] = useState<number | null>(null);
  const { known, states } = useIsKnown();
  const { keepContext, markMany } = useMark('doc');
  const hskRef = useRef<Map<string, HskEntry[]> | null>(null);

  useEffect(() => {
    getSetting('docHistory')
      .then(setHistory)
      .catch(() => undefined);
    // tải trước từ điển HSK khi người học còn đang dán
    void loadHsk()
      .then((h) => (hskRef.current = h))
      .catch(() => undefined);
  }, []);

  const read = useCallback(async (raw: string) => {
    const t = raw.trim().slice(0, MAX_CHARS);
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      const toks = await readText(t);
      hskRef.current = await loadHsk();
      setDoc({ text: t, toks });
      setEditing(false);
      setSheet(null);
      setHistory((h) => {
        const next = [{ text: t, at: Date.now() }, ...h.filter((x) => x.text !== t)].slice(0, HISTORY);
        void setSetting('docHistory', next).catch(() => undefined);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  // ?t=… : đọc ngay; ?doan=<mã>: đoạn văn đã lưu trên máy (không đưa văn bản lên địa chỉ trang)
  const fromTyping = useQueryParam('doan');
  useEffect(() => {
    if (q) void read(q);
    else if (fromTyping)
      void getPassage(fromTyping)
        .then((p) => {
          if (!p) return;
          setText(p.text);
          return read(p.text);
        })
        .catch(() => undefined);
  }, [q, fromTyping, read]);

  const isKnown = useCallback((t: ReadTok) => t.kind === 'word' && t.ids.some((id) => known(id, t.lv)), [known]);
  const learning = useCallback((t: ReadTok) => t.kind === 'word' && states.get(t.ids[0]) === 'hoc', [states]);
  const cov = useMemo(() => (doc ? coverage(doc.toks, known) : null), [doc, known]);
  const markAll = (st: 'hoc' | 'biet') => {
    if (!doc || !cov) return;
    void markMany(
      doc.toks,
      cov.unknown.filter((u) => u.kind === 'word').map((u) => doc.toks.indexOf(u)),
      st,
    );
  };

  /** Đổi cách đọc của token thứ i sang từ `id` (cùng chữ). */
  const pick = (i: number, id: string) => {
    if (!doc) return;
    const t = doc.toks[i];
    const list = t.kind === 'word' ? hskRef.current?.get(t.t) : undefined;
    const e = list?.find((x) => x.id === id);
    if (t.kind !== 'word' || !e) return;
    const toks = [...doc.toks];
    toks[i] = { ...t, p: e.p, hv: e.hv, m: e.m, lv: e.lv, ids: [id, ...t.ids.filter((x) => x !== id)] };
    setDoc({ ...doc, toks });
  };

  const tok = doc && sheet !== null ? doc.toks[sheet] : null;
  const closeSheet = useCallback(() => setSheet(null), []);
  // (mọi hook phải gọi trước lệnh `return` sớm của màn nhập, nếu không React báo lỗi #310)
  // giữ object tuỳ chọn ổn định để ReaderText không tính lại danh sách token mỗi lần cha render
  const readerOpts = useMemo(
    () => ({
      pinyin: prefs.pinyin,
      hv: prefs.hv,
      known: isKnown,
      learning,
      onTap: setSheet,
    }),
    [prefs.pinyin, prefs.hv, isKnown, learning],
  );

  // ---------------------------------------------------------------- màn nhập

  if (editing || !doc)
    return (
      <div className="space-y-4">
        <ResumeBar />
        <h1 className="text-2xl font-semibold">Đọc</h1>
        <p className="-mt-2 text-muted">
          Dán hoặc gõ một đoạn tiếng Trung bất kỳ: tin nhắn, thực đơn, đoạn sách, phụ đề. App tách từ, ghi pinyin theo ngữ cảnh, tô màu thanh,
          gợi ý Hán Việt; chạm vào từ để xem nghĩa. Văn bản chỉ nằm trên máy bạn.
        </p>
        <label className="block">
          <span className="text-sm font-semibold">Văn bản tiếng Trung</span>
          <textarea
            className="mt-1 block w-full rounded-xl border border-line bg-card p-3 text-xl"
            lang="zh-CN"
            rows={6}
            value={text}
            maxLength={MAX_CHARS}
            placeholder={EXAMPLE}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnPrimary} disabled={busy || !text.trim()} onClick={() => void read(text)}>
            {busy ? 'Đang tách từ…' : 'Đọc'}
          </button>
          {typeof navigator !== 'undefined' && navigator.clipboard?.readText && (
            <button
              type="button"
              className={btn}
              onClick={() =>
                void navigator.clipboard
                  .readText()
                  .then((t) => t && setText(t))
                  .catch(() => undefined)
              }
            >
              Dán từ bộ nhớ tạm
            </button>
          )}
          {!text && (
            <button type="button" className="text-sm text-muted underline" onClick={() => setText(EXAMPLE)}>
              Thử một câu ví dụ
            </button>
          )}
          {doc && (
            <button type="button" className="text-sm text-muted underline" onClick={() => setEditing(false)}>
              Quay lại bài đang đọc
            </button>
          )}
        </div>
        <p className="text-xs text-muted">Mẹo: trên iPhone, giữ ngón tay trên chữ trong ảnh (Văn bản trực tiếp) để chép chữ từ ảnh chụp thực đơn, biển hiệu rồi dán vào đây.</p>
        {busy && <Loading label="Đang tải từ điển (lần đầu mất vài giây)…" />}
        {error && <ErrorBox>Không đọc được văn bản: {error}</ErrorBox>}
        {history.length > 0 && (
          <section aria-labelledby="gan-day">
            <h2 id="gan-day" className="text-sm font-semibold text-muted">
              Đã đọc gần đây
            </h2>
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {history.map((h) => (
                <li key={h.at} className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    className="han min-w-0 flex-1 truncate text-left text-lg"
                    lang="zh-CN"
                    onClick={() => {
                      setText(h.text);
                      void read(h.text);
                    }}
                  >
                    {h.text.replace(/\s+/g, ' ')}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-sm text-muted underline"
                    aria-label={`Xoá khỏi danh sách: ${h.text.slice(0, 12)}`}
                    onClick={() =>
                      setHistory((list) => {
                        const next = list.filter((x) => x.at !== h.at);
                        void setSetting('docHistory', next).catch(() => undefined);
                        return next;
                      })
                    }
                  >
                    Xoá
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );

  // ---------------------------------------------------------------- màn đọc

  const pct = cov && cov.total ? Math.round((100 * cov.known) / cov.total) : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => setEditing(true)}>
          ✎ Sửa văn bản
        </button>
        <SpeakSentence text={doc.text} label="Nghe cả đoạn" slow />
        <button
          type="button"
          className={btn}
          onClick={() =>
            void savePassage(doc.text)
              .then((p) => window.location.assign(url(`go/?che-do=doan&id=${p.id}`)))
              .catch(() => window.location.assign(url('go/?che-do=doan')))
          }
        >
          ⌨ Gõ đoạn này
        </button>
        <a className={btn} href={url(`viet/cau/?t=${encodeURIComponent(doc.text.slice(0, 200))}`)}>
          ✎ Xem cách viết
        </a>
      </div>

      {cov && cov.total > 0 && (
        <p aria-live="polite">
          Bạn đã biết <b>{fmtInt(cov.known)}</b>/{fmtInt(cov.total)} từ ({pct}%)
          {cov.unknown.length > 0 && <span className="text-muted"> · {fmtInt(cov.unknown.length)} từ chưa biết</span>}
        </p>
      )}

      <ReaderControls {...prefs} />

      <div className="rounded-2xl border border-line bg-card p-4">
        <ReaderText toks={doc.toks} o={readerOpts} />
      </div>
      <p className="text-xs text-muted">
        Gạch chấm: từ chưa biết. Nền nhạt: từ đang học. Dấu ? trên pinyin: máy đoán cách đọc, chạm để chọn cách khác. Tách từ và cách đọc do máy
        làm, có thể sai ở tên riêng, từ hiếm. Đặt cấp đã biết ở Tôi → Cài đặt.
      </p>

      {cov && (
        <UnknownWords cov={cov} states={states} onOpen={(u) => setSheet(doc.toks.indexOf(u))} onMarkAll={markAll} />
      )}

      <ReaderSheet
        tok={tok}
        alts={tok?.kind === 'word' ? (hskRef.current?.get(tok.t) ?? []).filter((e) => e.id !== tok.ids[0]) : []}
        state={tok?.kind === 'word' ? states.get(tok.ids[0]) : undefined}
        onClose={closeSheet}
        onMark={(st) => st && sheet !== null && keepContext(doc.toks, sheet)}
        onPick={(id) => sheet !== null && pick(sheet, id)}
      />
      <ToastHost />
    </div>
  );
}
