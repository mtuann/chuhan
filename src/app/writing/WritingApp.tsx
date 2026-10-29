/**
 * Tập viết (/viet/?cap=1, /viet/?chu=学习): 1.200 chữ viết tay của đề thi HSK 2025 theo cấp (ít nét trước),
 * hoặc các chữ tự chọn. Mỗi chữ ba bước: xem nét → tô theo nét mờ → tự viết (trên màn hình hoặc ra giấy rồi tự chấm).
 * Kết quả lưu trong bảng `attempts` (kind `write`): chữ đã tập, lần chấm gần nhất.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from '../../lib/live-query';
import type { CharRec, PackKey, WordRec } from '../../schema/data';
import { loadChar, loadLevelList, loadManifest, loadWords } from '../../lib/data';
import { logAttempt } from '../../lib/attempts';
import { getSetting, setSetting } from '../../lib/settings';
import { GRADE_VI, gradeWriting, type WriteGrade } from '../../lib/grade';
import { fmtInt, levelLabel, wordGloss } from '../../lib/text';
import { url } from '../../lib/url';
import { lastWrites, mainHanviet, mainReadings, practiceQueue, uniqueHan, writeCounts, type LastWrite } from '../../lib/writing';
import { WriterBox, type QuizResult, type WriterControl } from '../writer';
import { ErrorBox, Han, LevelTabs, Loading, NumberedSyllable, ShowMoreButton, btn, btnPrimary, useQueryParam } from '../ui';
import ResumeBar from '../practice/ResumeBar';
import { recordPractice } from '../practice/resume';
import { VietNav } from './VietNav';

type Level = Exclude<PackKey, 'x'>;
const BATCH = 10;
/** grid chữ hiện dần, 100 chữ một lần */
const PAGE = 100;

const STATUS: Record<WriteGrade | 'none', { label: string; mark: string; cls: string }> = {
  good: { label: 'đã viết đúng', mark: '✓', cls: 'text-t2' },
  hard: { label: 'viết được, còn lỗi', mark: '~', cls: 'text-accent' },
  again: { label: 'cần luyện thêm', mark: '!', cls: 'text-t1' },
  none: { label: 'chưa luyện', mark: '', cls: '' },
};

export default function WritingApp() {
  const chu = useQueryParam('chu');
  const cap = useQueryParam('cap');
  const custom = useMemo(() => (chu ? uniqueHan(chu) : null), [chu]);
  const [levels, setLevels] = useState<{ level: Level; n: number }[] | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [list, setList] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<string[] | null>(null);
  const [shown, setShown] = useState(PAGE);
  const attempts = useLiveQuery((t) => t.attempts.where('kind').equals('write').toArray(), [], undefined);
  const last = useMemo(() => lastWrites(attempts ?? []), [attempts]);

  useEffect(() => {
    if (custom) return;
    Promise.all([loadManifest(), getSetting('vietCap')])
      .then(([m, saved]) => {
        const ls = (Object.entries(m.counts.writing) as [Level, number][]).filter(([, n]) => n > 0).map(([l, n]) => ({ level: l, n }));
        setLevels(ls);
        const want = (cap ?? saved) as Level;
        setLevel(ls.some((x) => x.level === want) ? want : (ls[0]?.level ?? '1'));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [custom, cap]);

  useEffect(() => {
    if (custom) {
      setList(custom);
      setShown(PAGE);
      return;
    }
    if (!level) return;
    let alive = true;
    setList(null);
    loadLevelList(level)
      .then((l) => alive && setList(l.writing))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [custom, level]);

  if (error)
    return (
      <>
        <VietNav current="tap" />
        <ErrorBox>Không tải được danh sách chữ: {error}</ErrorBox>
      </>
    );
  if (!list || !attempts)
    return (
      <>
        <VietNav current="tap" />
        <Loading />
      </>
    );

  const listName = custom ? 'Chữ bạn chọn' : levelLabel(Number(level));

  /** Bắt đầu một lượt luyện: ghi "lần luyện gần nhất" cho thanh Tiếp tục rồi mở bài. */
  const beginSession = (q: string[]) => {
    void recordPractice({
      label: custom ? 'Tập viết · Chữ tự chọn' : `Tập viết · ${listName}`,
      url: url(custom ? `viet/?chu=${encodeURIComponent(chu ?? '')}` : `viet/?cap=${level}`),
    });
    setSession(q);
  };

  if (session)
    return (
      <Practice
        key={session.join('')}
        queue={session}
        listName={listName}
        last={last}
        onExit={() => setSession(null)}
        onMore={() => beginSession(practiceQueue(list, lastWrites(attempts), BATCH))}
      />
    );

  const counts = writeCounts(list, last);
  const next = practiceQueue(list, last, BATCH);
  return (
    <div className="space-y-4">
      <ResumeBar />
      <VietNav current="tap" />
      {custom ? (
        <p className="text-sm">
          <a className="text-muted underline" href={url('viet/')}>
            ← Chữ viết tay theo cấp
          </a>
        </p>
      ) : (
        <>
          <p className="text-muted">Chữ viết tay của đề thi HSK 2025: 1.200 chữ, xếp từ ít nét đến nhiều nét.</p>
          {levels && (
            <LevelTabs
              tabs={levels.map(({ level: l, n }) => ({ key: l, label: levelLabel(Number(l)), count: fmtInt(n) }))}
              active={level}
              onSelect={(l) => {
                setLevel(l);
                setShown(PAGE);
                void setSetting('vietCap', l).catch(() => undefined);
                history.replaceState(null, '', `?cap=${l}`);
              }}
            />
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${btnPrimary} !min-h-12 !px-6 !text-base`}
          disabled={!next.length}
          onClick={() => beginSession(next)}
        >
          ▶ {counts.good === list.length ? `Ôn lại ${next.length} chữ` : `Luyện ${next.length} chữ tiếp theo`}
        </button>
        <a className={btn} href={url(custom ? `viet/in/?chu=${encodeURIComponent(list.join(''))}` : `viet/in/?cap=${level}`)}>
          In 田字格
        </a>
      </div>

      <h2 className="text-lg font-semibold">
        {listName} · {fmtInt(list.length)} chữ
      </h2>
      <p className="text-sm" aria-live="polite">
        <span className="text-t2">✓ Đã viết đúng {fmtInt(counts.good)}</span>
        {' · '}
        <span className="text-accent">~ Còn lỗi {fmtInt(counts.hard)}</span>
        {' · '}
        <span className="text-t1">! Cần luyện thêm {fmtInt(counts.again)}</span>
        {' · '}
        <span className="text-muted">Chưa luyện {fmtInt(counts.none)}</span>
      </p>

      <ul className="grid grid-cols-5 gap-2 sm:grid-cols-8" aria-label={`Danh sách chữ: ${listName}`}>
        {list.slice(0, shown).map((c) => {
          const st = STATUS[last.get(c)?.grade ?? 'none'];
          return (
            <li key={c}>
              <button
                type="button"
                className="relative flex aspect-square w-full items-center justify-center rounded-lg border border-line bg-card hover:border-accent"
                aria-label={`${c}: ${st.label}`}
                onClick={() => beginSession([c])}
              >
                <Han className="text-3xl">{c}</Han>
                {st.mark && <span className={`absolute top-0.5 right-1 text-xs font-semibold ${st.cls}`}>{st.mark}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <ShowMoreButton remaining={list.length - shown} unit="chữ" onMore={() => setShown((x) => x + PAGE)} />
    </div>
  );
}

// ---------------------------------------------------------------- một lượt luyện

function Practice({ queue, listName, last, onExit, onMore }: { queue: string[]; listName: string; last: ReadonlyMap<string, LastWrite>; onExit: () => void; onMore: () => void }) {
  const [k, setK] = useState(0);
  const [results, setResults] = useState<WriteGrade[]>([]);
  // chữ đã từng tự viết thì vào thẳng bước 3
  const startStep = useRef(new Map(queue.map((c) => [c, last.has(c) ? 3 : 1])));

  if (k >= queue.length) {
    const n = (g: WriteGrade) => results.filter((x) => x === g).length;
    return (
      <div className="space-y-4">
        <ResumeBar />
        <h2 className="text-xl font-semibold">Xong {queue.length} chữ</h2>
        <p>
          <span className="text-t2">Nhớ {n('good')}</span> · <span className="text-accent">Khó {n('hard')}</span> · <span className="text-t1">Quên {n('again')}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={onMore}>
            ▶ Luyện tiếp
          </button>
          <button type="button" className={btn} onClick={onExit}>
            Về danh sách
          </button>
        </div>
      </div>
    );
  }

  const c = queue[k];
  return (
    <>
      <ResumeBar />
      <PracticeChar
        key={c}
        c={c}
        pos={queue.length > 1 ? `Chữ ${k + 1}/${queue.length}` : ''}
        listName={listName}
        step0={startStep.current.get(c) ?? 1}
        isLast={k === queue.length - 1}
        onExit={onExit}
        onDone={(g) => {
          setResults((r) => [...r, g]);
          setK(k + 1);
        }}
      />
    </>
  );
}

/** Từ có chữ `c` để gợi ý khi tự viết: ưu tiên từ hai chữ của cấp chữ đọc, rồi cấp sau. */
async function contextWord(c: string, rec?: CharRec): Promise<WordRec | undefined> {
  const lv = rec?.lv.r25 ?? rec?.lv.w25;
  if (!lv) return undefined;
  for (const l of [lv, lv + 1].filter((x) => x <= 7)) {
    const words = await loadWords(String(l) as PackKey).catch(() => [] as WordRec[]);
    const has = words.filter((w) => w.s.includes(c) && w.s !== c && [...w.s].length <= 3);
    has.sort((a, b) => [...a.s].length - [...b.s].length);
    if (has[0]) return has[0];
  }
  return undefined;
}

type Step = 1 | 2 | 3;
const STEPS: [Step, string][] = [
  [1, 'Xem nét'],
  [2, 'Tô theo nét mờ'],
  [3, 'Tự viết'],
];

function PracticeChar({
  c,
  pos,
  listName,
  step0,
  isLast,
  onExit,
  onDone,
}: {
  c: string;
  pos: string;
  listName: string;
  step0: number;
  isLast: boolean;
  onExit: () => void;
  onDone: (g: WriteGrade) => void;
}) {
  const [step, setStep] = useState<Step>(step0 === 3 ? 3 : 1);
  const [rec, setRec] = useState<CharRec | undefined>();
  const [ctx, setCtx] = useState<WordRec | undefined>();
  const [noData, setNoData] = useState(false);
  const [round, setRound] = useState(0);
  const [traced, setTraced] = useState<QuizResult | null>(null);
  const [result, setResult] = useState<{ grade: WriteGrade; how: 'quiz' | 'paper' | 'gaveup'; q?: QuizResult } | null>(null);
  const [mode, setMode] = useState<'quiz' | 'paper' | 'gaveup'>('quiz');
  const [paperShown, setPaperShown] = useState(false);
  const ctrl = useRef<WriterControl | null>(null);
  const started = useRef(Date.now());

  useEffect(() => {
    let alive = true;
    loadChar(c)
      .then(async (x) => {
        if (!alive) return;
        setRec(x?.rec);
        const w = await contextWord(c, x?.rec);
        if (alive) setCtx(w);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [c]);

  const save = async (grade: WriteGrade, how: 'quiz' | 'paper' | 'gaveup', q?: QuizResult) => {
    setResult({ grade, how, q });
    await logAttempt({
      kind: 'write',
      itemId: c,
      ok: grade === 'good',
      durMs: Math.min(5 * 60_000, Date.now() - started.current),
      data: { grade, how, list: listName, ...(q ? { mistakes: q.mistakes, strokes: q.strokes, hint: q.hint } : {}) },
    });
  };

  const goStep = (s: Step) => {
    setStep(s);
    setTraced(null);
    setResult(null);
    setMode('quiz');
    setPaperShown(false);
    setRound((r) => r + 1);
  };

  const readings = mainReadings(rec);
  const hv = mainHanviet(rec);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 text-sm">
        <button type="button" className="text-muted underline" onClick={onExit}>
          ← Tập viết · {listName}
        </button>
        <span className="text-muted">{pos}</span>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Bước">
        {STEPS.map(([s, label]) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={s === step}
            className={`${btn} !min-h-9 !px-3 ${s === step ? '!border-accent !bg-accent-soft font-semibold' : ''}`}
            onClick={() => goStep(s)}
          >
            {s}. {label}
          </button>
        ))}
      </div>

      <div className="text-center">
        <p className="text-xl">
          {step < 3 && <Han className="mr-3 text-3xl">{c}</Han>}
          {readings.map((r, i) => (
            <span key={r}>
              {i > 0 && <span className="text-muted">, </span>}
              <NumberedSyllable s={r} />
            </span>
          ))}
          {hv.length > 0 && <span className="ml-3 text-lg">{hv.join(', ')}</span>}
        </p>
        {step === 3 && ctx && (
          <p className="mt-1">
            <Han className="text-xl">{[...ctx.s].map((ch) => (ch === c ? '＿' : ch)).join('')}</Han>
            <span className="ml-2 text-muted">{wordGloss(ctx)}</span>
          </p>
        )}
        {!rec && step === 3 && <p className="mt-1 text-sm text-muted">Chữ ngoài danh sách HSK: nhìn chữ ở bước 1 rồi tự viết lại.</p>}
        <p className="mt-2 text-sm text-muted">
          {step === 1
            ? 'Xem thứ tự nét. Chạm "Xem lại" để xem thêm lần nữa.'
            : step === 2
              ? 'Tô theo nét mờ, đúng thứ tự nét. Sai một lần sẽ có gợi ý.'
              : mode === 'paper'
                ? 'Viết ra giấy rồi lật để so.'
                : 'Tự viết chữ, không có nét mờ. Sai 3 lần một nét sẽ có gợi ý.'}
        </p>
      </div>

      {noData ? (
        <p className="text-center text-sm text-muted">Chưa có dữ liệu nét cho chữ này.</p>
      ) : (
        <WriterBox
          key={`${step}-${round}-${mode}`}
          char={c}
          max={240}
          outline={step < 3}
          showChar={false}
          onError={() => setNoData(true)}
          onReady={(w) => {
            ctrl.current = w;
            if (step === 1) void w.animate();
            if (step === 2) w.quiz({ outline: true, hintAfter: 1, onDone: setTraced });
            if (step === 3 && mode === 'quiz') w.quiz({ outline: false, hintAfter: 3, onDone: (q) => void save(gradeWriting(q.mistakes, q.strokes, q.hint), 'quiz', q) });
            if (step === 3 && mode === 'gaveup') void w.animate();
          }}
        />
      )}

      {step === 1 && (
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className={btn} onClick={() => void ctrl.current?.animate()}>
            ↺ Xem lại
          </button>
          <button type="button" className={btnPrimary} onClick={() => goStep(2)}>
            Tiếp: Tô theo nét mờ →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2 text-center">
          {traced && (
            <p role="status">
              Tô xong: {traced.mistakes} lỗi / {traced.strokes} nét.
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className={btn} onClick={() => goStep(2)}>
              ↺ Tô lại
            </button>
            <button type="button" className={traced ? btnPrimary : btn} onClick={() => goStep(3)}>
              Tiếp: Tự viết →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3 text-center">
          {!result && mode === 'quiz' && (
            <p className="flex flex-wrap justify-center gap-4 text-sm">
              <button
                type="button"
                className="text-muted underline"
                onClick={() => {
                  setMode('gaveup');
                  void save('again', 'gaveup');
                }}
              >
                Không nhớ
              </button>
              <button type="button" className="text-muted underline" onClick={() => setMode('paper')}>
                Viết ra giấy
              </button>
            </p>
          )}
          {!result && mode === 'paper' && !paperShown && (
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                setPaperShown(true);
                void ctrl.current?.animate();
              }}
            >
              Lật để so
            </button>
          )}
          {!result && mode === 'paper' && paperShown && (
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className={btn} onClick={() => void save('again', 'paper')}>
                Viết sai
              </button>
              <button type="button" className={btnPrimary} onClick={() => void save('good', 'paper')}>
                Viết đúng
              </button>
            </div>
          )}
          {result && (
            <>
              <p role="status">
                {result.q ? `${result.q.mistakes} lỗi / ${result.q.strokes} nét${result.q.hint ? ', đã cần gợi ý' : ''} → ` : ''}
                <b>{GRADE_VI[result.grade]}</b>
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className={btn} onClick={() => goStep(3)}>
                  ↺ Viết lại
                </button>
                <button type="button" className={btnPrimary} onClick={() => onDone(result.grade)}>
                  {isLast ? 'Xong' : 'Chữ tiếp →'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <p className="text-center text-sm">
        <a className="text-muted underline" href={url(`chu/?c=${encodeURIComponent(c)}`)}>
          Trang chữ {c}
        </a>
      </p>
    </div>
  );
}
