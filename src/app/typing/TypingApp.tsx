/**
 * Gõ chữ (/go/): gõ tiếng Trung bằng pinyin như người Trung Quốc gõ trên điện thoại, máy tính. Trang đầu có ô gõ
 * thử, các bài luyện (gõ từ, gõ theo đoạn văn tự dán, bẫy cùng âm, thử thách 1 phút), lỗi hay gặp của bạn, cách dùng
 * và cách gõ dấu câu tiếng Trung, hướng dẫn cài bộ gõ tiếng Trung trên máy.
 * Chế độ: ?che-do=tu|doan|bay|toc-do.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from '../../lib/live-query';
import { type AttemptRow } from '../../lib/db';
import { getSetting, setSetting } from '../../lib/settings';
import type { ImeLexicon } from '../../lib/ime';
import { summarizeErrors, type TypedChar, type TypingError } from '../../lib/typing';
import { url } from '../../lib/url';
import { levelLabel } from '../../lib/text';
import { ErrorBox, Han, Loading, btn, btnPrimary, useQueryParam } from '../ui';
import ResumeBar from '../practice/ResumeBar';
import { recordPractice } from '../practice/resume';
import { PunctSlip, charInfo } from './CheckView';
import type { DrillResult } from './Drill';
import { PunctGuide } from './PunctGuide';
import { ImeBox, useImeLexicon } from './ImeBox';
import { type PassagePinyin } from './PassageMode';
import { PROMPT_VI, type PromptKind } from './prompt';
import { SetupGuide } from './SetupGuide';
import { homophoneItems, namesOf, wordItems, type DrillItem, type WordSource } from './sources';

/** Các chế độ luyện nặng tách thành chunk riêng, chỉ tải khi vào chế độ đó. */
const LazyDrill = lazy(() => import('./Drill').then((m) => ({ default: m.Drill })));
const LazyDrillSummary = lazy(() => import('./Drill').then((m) => ({ default: m.DrillSummary })));
const LazyPassageMode = lazy(() => import('./PassageMode').then((m) => ({ default: m.PassageMode })));
const LazySpeedTest = lazy(() => import('./SpeedTest').then((m) => ({ default: m.SpeedTest })));

const HOME = 'go/';

/**
 * Nhãn "lần luyện gần nhất" cho từng chế độ gõ; null = trang đầu (chỉ xem, chưa luyện).
 * Url giữ nguyên query để quay lại đúng chế độ.
 */
function typingResume(mode: string, nguon: string | null, prefs: Prefs): { label: string; url: string } | null {
  const href = (m: string) => url(`go/?che-do=${m}${nguon ? `&nguon=${encodeURIComponent(nguon)}` : ''}`);
  switch (mode) {
    case 'tu':
      return {
        label: nguon === 'loi' ? 'Gõ từ · Chữ hay gõ sai' : `Gõ từ · ${prefs.wordSrc === 'hoc' ? 'Từ đang học' : levelLabel(Number(prefs.wordSrc) || 1)}`,
        url: href('tu'),
      };
    case 'doan':
      return { label: 'Gõ theo đoạn văn', url: href('doan') };
    case 'bay':
      return { label: `Bẫy cùng âm · ${levelLabel(prefs.trapLevel)}`, url: href('bay') };
    case 'toc-do':
      return { label: 'Thử thách 1 phút', url: href('toc-do') };
    default:
      return null;
  }
}

// ---------------------------------------------------------------- cài đặt

export interface Prefs {
  showInfo: boolean;
  wordSrc: string;
  wordPrompt: PromptKind;
  trapLevel: number;
  speedLevel: number;
  speedKeys: boolean;
  passPinyin: PassagePinyin;
  /** chấm cả dấu câu khi gõ theo đoạn văn */
  punct: boolean;
}
const DEFAULTS: Prefs = {
  showInfo: true,
  wordSrc: '1',
  wordPrompt: 'chu',
  trapLevel: 1,
  speedLevel: 1,
  speedKeys: true,
  passPinyin: 'all',
  punct: true,
};

function usePrefs(): [Prefs, (p: Partial<Prefs>) => void, boolean] {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  // prefs đã tải xong từ máy chưa (để không ghi "lần luyện gần nhất" với DEFAULTS tạm thời)
  const [ready, setReady] = useState(false);
  useEffect(() => {
    getSetting('typing')
      .then((p) => {
        setPrefs({ ...DEFAULTS, ...p });
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);
  const update = useCallback((p: Partial<Prefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      void setSetting('typing', next).catch(() => undefined);
      return next;
    });
  }, []);
  return [prefs, update, ready];
}

// ---------------------------------------------------------------- khung chung

function Header({ title, back = HOME, backLabel = 'Gõ chữ' }: { title: string; back?: string; backLabel?: string }) {
  return (
    <div className="mb-4">
      <p className="text-sm">
        <a className="text-muted underline" href={url(back)}>
          ← {backLabel}
        </a>
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
    </div>
  );
}

function Radios<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string, boolean?])[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold">{label}</p>
      <div role="radiogroup" aria-label={label} className="mt-1 flex flex-wrap gap-2">
        {options.map(([v, text, disabled]) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={`min-h-11 rounded-lg border px-3 text-sm disabled:opacity-40 ${value === v ? 'border-accent bg-accent font-semibold text-accent-ink' : 'border-line bg-card hover:border-accent'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function InfoToggle({ prefs, update }: { prefs: Prefs; update: (p: Partial<Prefs>) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" className="size-5" checked={prefs.showInfo} onChange={(e) => update({ showInfo: e.target.checked })} />
      Hiện âm Hán Việt và nghĩa trong danh sách gợi ý (tắt đi để luyện như khi thi)
    </label>
  );
}

/** Một lượt luyện: chuẩn bị đề → làm → kết quả; "Gõ lại đề sai" dùng lại các đề sai. */
function Round({
  title,
  kind,
  load,
  prefs,
  update,
  mode,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  kind: PromptKind;
  load: () => Promise<DrillItem[]>;
  prefs: Prefs;
  update: (p: Partial<Prefs>) => void;
  mode: string;
}) {
  const [items, setItems] = useState<DrillItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DrillResult | null>(null);
  const [round, setRound] = useState(0);
  const names = useMemo(() => namesOf((items ?? []).flatMap((x) => (x.tk ? [x.tk] : []))), [items]);
  const { lex } = useImeLexicon(names);
  useEffect(() => {
    let alive = true;
    setItems(null);
    load()
      .then((x) => alive && setItems(x))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [load, round]);
  if (error) return <ErrorBox>Không tải được đề: {error}</ErrorBox>;
  if (!items) return <Loading label="Đang soạn đề…" />;
  if (!items.length) return <p className="text-muted">Chưa có đề cho lựa chọn này.</p>;
  if (result)
    return (
      <LazyDrillSummary
        result={result}
        mode={mode}
        lex={lex}
        backHref={url(HOME)}
        onAgain={() => {
          setResult(null);
          setRound((r) => r + 1);
        }}
        onMissed={() => {
          setItems(result.missed);
          setResult(null);
        }}
      />
    );
  return (
    <LazyDrill
      key={`${round}-${items.map((x) => x.key).join()}`}
      title={title}
      subtitle={subtitle}
      items={items}
      kind={kind}
      lex={lex}
      showInfo={prefs.showInfo}
      setShowInfo={(v) => update({ showInfo: v })}
      punct={prefs.punct}
      setPunct={(v) => update({ punct: v })}
      closeHref={url(HOME)}
      onFinish={setResult}
    />
  );
}

// ---------------------------------------------------------------- các chế độ

function WordMode({ prefs, update }: { prefs: Prefs; update: (p: Partial<Prefs>) => void }) {
  const fromErrors = useQueryParam('nguon') === 'loi';
  const [started, setStarted] = useState(fromErrors);
  const learning = useLiveQuery((t) => t.words.where('st').equals('hoc').count(), [], 0);
  const errorChars = useLiveQuery(
    (t) =>
      t.attempts
        .where('kind')
        .equals('type')
        .reverse()
        .sortBy('at')
        .then((rows) => summarizeErrors(typingErrorsOf(rows), 12).chars.map((c) => c.t)),
    [],
    [] as string[],
  );
  const src: WordSource = fromErrors ? { kind: 'loi', chars: errorChars } : prefs.wordSrc === 'hoc' ? { kind: 'hoc' } : { kind: 'cap', level: Number(prefs.wordSrc) };
  const srcKey = JSON.stringify(src);
  const load = useCallback(() => wordItems(JSON.parse(srcKey) as WordSource), [srcKey]);
  if (started && (!fromErrors || errorChars.length))
    return <Round title={fromErrors ? 'Chữ hay gõ sai' : 'Gõ từ'} kind={prefs.wordPrompt} load={load} prefs={prefs} update={update} mode="tu" />;
  return (
    <div className="space-y-5">
      <Header title="Gõ từ" />
      <p className="text-muted">Mỗi lượt 10 từ. Nhìn chữ để luyện nhớ cách gõ, nghe để luyện nghe ra pinyin, nhìn nghĩa để luyện nhớ chữ.</p>
      {learning < 5 && (
        <p className="text-sm text-muted">Đánh dấu "Đang học" ít nhất 5 từ (khi đọc hoặc tra từ) để luyện gõ đúng các từ của bạn.</p>
      )}
      <Radios
        label="Từ"
        value={prefs.wordSrc}
        onChange={(v) => update({ wordSrc: v })}
        options={[
          ['hoc', `Từ bạn đang học (${learning})`, learning < 5],
          ['1', 'HSK 1'],
          ['2', 'HSK 2'],
          ['3', 'HSK 3'],
          ['4', 'HSK 4'],
          ['5', 'HSK 5'],
          ['6', 'HSK 6'],
          ['7', 'HSK 7'],
        ]}
      />
      <Radios
        label="Đề"
        value={prefs.wordPrompt}
        onChange={(v) => update({ wordPrompt: v })}
        options={(['chu', 'nghe', 'nghia'] as const).map((k) => [k, PROMPT_VI[k]] as const)}
      />
      <InfoToggle prefs={prefs} update={update} />
      <button type="button" className={btnPrimary} onClick={() => setStarted(true)}>
        Bắt đầu
      </button>
    </div>
  );
}

function HanHv({ lex, c }: { lex: ImeLexicon | null; c: string }) {
  const hv = lex?.charInfo.get(c)?.hv;
  return (
    <>
      <Han>{c}</Han>
      {hv ? ` ${hv}` : ''}
    </>
  );
}

function TrapMode({ prefs, update }: { prefs: Prefs; update: (p: Partial<Prefs>) => void }) {
  const [started, setStarted] = useState(false);
  const { lex } = useImeLexicon();
  const load = useCallback(() => homophoneItems(prefs.trapLevel), [prefs.trapLevel]);
  if (started) return <Round title="Bẫy cùng âm" subtitle="Gõ đúng chữ theo nghĩa" kind="pinyin" load={load} prefs={prefs} update={update} mode="bay" />;
  return (
    <div className="space-y-5">
      <Header title="Bẫy cùng âm" />
      <p className="text-muted">
        Gõ pinyin không có dấu thanh nên <Han>在</Han> và <Han>再</Han> (cùng gõ zai), <Han>买</Han> và <Han>卖</Han> (cùng gõ mai) ra chung một danh
        sách. Mỗi đề cho pinyin, âm Hán Việt và nghĩa: gõ rồi chọn đúng chữ. Mẹo của người Việt: chữ cùng âm tiếng Trung thường khác âm Hán Việt (
        <HanHv lex={lex} c="在" />, <HanHv lex={lex} c="再" />; <HanHv lex={lex} c="买" />, <HanHv lex={lex} c="卖" />
        ), danh sách gợi ý có âm Hán Việt để phân biệt.
      </p>
      <Radios
        label="Từ đến"
        value={prefs.trapLevel}
        onChange={(v) => update({ trapLevel: v })}
        options={[
          [1, 'HSK 1'],
          [2, 'HSK 2'],
          [3, 'HSK 3'],
          [4, 'HSK 4'],
          [5, 'HSK 5'],
          [6, 'HSK 6'],
          [7, 'HSK 7'],
        ]}
      />
      <InfoToggle prefs={prefs} update={update} />
      <button type="button" className={btnPrimary} onClick={() => setStarted(true)}>
        Bắt đầu
      </button>
    </div>
  );
}

function SpeedMode({ prefs, update }: { prefs: Prefs; update: (p: Partial<Prefs>) => void }) {
  const seconds = Math.min(300, Math.max(5, Number(useQueryParam('giay') ?? 60) || 60));
  const { lex } = useImeLexicon();
  return (
    <div className="space-y-5">
      <Header title="Thử thách 1 phút" />
      <Radios
        label="Từ"
        value={prefs.speedLevel}
        onChange={(v) => update({ speedLevel: v })}
        options={[
          [1, 'HSK 1'],
          [2, 'HSK 1–2'],
          [3, 'HSK 1–3'],
          [4, 'HSK 1–4'],
          [5, 'HSK 1–5'],
          [6, 'HSK 1–6'],
          [7, 'HSK 1–7'],
        ]}
      />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-5" checked={prefs.speedKeys} onChange={(e) => update({ speedKeys: e.target.checked })} />
        Hiện cách gõ dưới chữ
      </label>
      <LazySpeedTest key={prefs.speedLevel} lex={lex} level={prefs.speedLevel} seconds={seconds} showKeys={prefs.speedKeys} backHref={url(HOME)} />
    </div>
  );
}

// ---------------------------------------------------------------- trang đầu

/** Lỗi gõ rút từ các dòng attempts (tối đa 60 lượt, mỗi lượt 80 lỗi). Thuần để dùng trong querier. */
const typingErrorsOf = (rows: AttemptRow[]): TypingError[] =>
  rows.slice(0, 60).flatMap((r) => ((r.data as { errors?: TypingError[] })?.errors ?? []).slice(0, 80));

const MODES: { id: string; name: string; desc: ReactNode }[] = [
  { id: 'tu', name: 'Gõ từ', desc: 'Nhìn chữ, nghe hoặc nhìn nghĩa rồi gõ ra từ; theo cấp HSK hoặc các từ bạn đang học.' },
  { id: 'doan', name: 'Gõ theo đoạn văn', desc: 'Dán một đoạn tiếng Trung bất kỳ (hoặc đoạn đang đọc) rồi gõ lại từng câu, chấm ngay khi gõ; tiến độ lưu để gõ tiếp.' },
  {
    id: 'bay',
    name: 'Bẫy cùng âm',
    desc: (
      <>
        <Han>在</Han> hay <Han>再</Han>, <Han>买</Han> hay <Han>卖</Han>: gõ đúng chữ theo nghĩa, nhớ chữ nhờ âm Hán Việt.
      </>
    ),
  },
  { id: 'toc-do', name: 'Thử thách 1 phút', desc: 'Gõ được bao nhiêu chữ một phút; kỷ lục lưu trên máy.' },
];

const finePointer = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;

function Playground({ showInfo }: { showInfo: boolean }) {
  const { lex, error } = useImeLexicon();
  const [typed, setTyped] = useState<TypedChar[]>([]);
  const [copied, setCopied] = useState(false);
  const text = typed.map((x) => x.c).join('');
  return (
    <section aria-labelledby="go-thu" className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <h2 id="go-thu" className="font-semibold">
        Gõ thử
      </h2>
      {error && <ErrorBox>Không tải được từ điển gợi ý: {error}</ErrorBox>}
      {/* chỉ tự đặt con trỏ khi có chuột, bàn phím: trên điện thoại bàn phím bật lên sẽ che các bài luyện bên dưới */}
      <ImeBox lex={lex} value={typed} onChange={setTyped} label="Gõ thử tiếng Trung" placeholder="Gõ thử: nihao rồi bấm phím cách" showInfo={showInfo} autoFocus={finePointer} />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <li>Không gõ dấu thanh</li>
        <li>
          ü gõ bằng <kbd className="font-mono font-semibold text-ink">v</kbd>: <Han>女</Han> = nv
        </li>
        <li>Chọn chữ: phím số, phím cách hoặc chạm</li>
        <li>
          Gõ tắt: xs → <Han>学生</Han>
        </li>
        <li>
          Gõ cả câu: woaini → <Han>我爱你</Han>
        </li>
        <li>Sửa giữa câu: chạm vào chữ (hoặc phím ← →) để đặt con trỏ; chạm vào chữ đã gõ để đổi sang chữ cùng âm</li>
        <li>
          Dấu câu: phím <kbd className="font-mono font-semibold text-ink">, . ? ! \</kbd> ra <Han>，。？！、</Han> (
          <a className="underline" href="#dau-cau">
            cách dùng
          </a>
          )
        </li>
      </ul>
      {text && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btn}
            onClick={() =>
              void navigator.clipboard
                ?.writeText(text)
                .then(() => setCopied(true))
                .catch(() => undefined)
            }
          >
            {copied ? '✓ Đã chép' : 'Chép'}
          </button>
          <a className={btn} href={url(`tra/?q=${encodeURIComponent(text)}`)}>
            Tra từ
          </a>
          <a className={btn} href={url(`?t=${encodeURIComponent(text)}`)}>
            Đọc đoạn này
          </a>
          <button
            type="button"
            className={btn}
            onClick={() => {
              setTyped([]);
              setCopied(false);
            }}
          >
            Xoá
          </button>
        </div>
      )}
    </section>
  );
}

function MyErrors() {
  const { lex } = useImeLexicon();
  const errors = useLiveQuery((t) => t.attempts.where('kind').equals('type').reverse().sortBy('at').then(typingErrorsOf), [], [] as TypingError[]);
  const sum = useMemo(() => summarizeErrors(errors), [errors]);
  if (!sum.swaps.length && !sum.sounds.length && !sum.puncts.length) return null;
  return (
    <section aria-labelledby="loi-cua-ban" className="space-y-2 rounded-2xl border border-line p-4">
      <h2 id="loi-cua-ban" className="font-semibold">
        Lỗi hay gặp của bạn
      </h2>
      <ul className="space-y-1 text-sm">
        {sum.swaps.map((s) => (
          <li key={`${s.t}${s.got}`}>
            Cần <Han className="text-lg">{s.t}</Han> ({charInfo(lex, s.t)}) mà chọn <Han className="text-lg">{s.got}</Han> ({charInfo(lex, s.got)}) · {s.n}{' '}
            lần
          </li>
        ))}
        {sum.sounds.map((s) => (
          <li key={s.key}>
            Gõ nhầm âm <b>{s.key}</b> · {s.n} lần
          </li>
        ))}
        {sum.puncts.map((s) => (
          <li key={`p${s.t}${s.got}`}>
            <PunctSlip t={s.t} got={s.got} /> · {s.n} lần
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {sum.chars.length > 0 && (
          <a className={btn} href={url(`${HOME}?che-do=tu&nguon=loi`)}>
            Luyện lại các chữ hay sai
          </a>
        )}
        {sum.puncts.length > 0 && (
          <a className={btn} href="#dau-cau">
            Cách dùng dấu câu
          </a>
        )}
      </div>
    </section>
  );
}

/** Số chữ đã gõ đúng và kỷ lục tốc độ (mọi cấp). */
function MyStats() {
  // tổng lượt, tổng chữ: bảng `daily` (không bị cắt như `attempts`); kỷ lục: bảng `bests`
  const stats = useLiveQuery(
    (t) =>
      Promise.all([t.daily.toArray(), t.bests.toArray()]).then(([days, bests]) => ({
        rounds: days.reduce((n, d) => n + (d.typeRounds ?? 0), 0),
        chars: days.reduce((n, d) => n + (d.typeChars ?? 0), 0),
        best: bests.filter((b) => b.mode === 'toc-do').reduce((m, b) => Math.max(m, b.cpm), 0),
      })),
    [],
    { rounds: 0, chars: 0, best: 0 },
  );
  if (!stats.rounds) return null;
  return (
    <p className="text-sm">
      Bạn đã gõ đúng <b>{stats.chars.toLocaleString('vi-VN')}</b> chữ qua {stats.rounds} lượt
      {stats.best ? (
        <>
          {' '}
          · kỷ lục <b>{stats.best}</b> chữ/phút
        </>
      ) : null}
    </p>
  );
}

function Landing({ prefs }: { prefs: Prefs }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Gõ chữ</h1>
      <p className="-mt-3 text-muted">
        Gõ tiếng Trung bằng pinyin như người Trung Quốc gõ trên điện thoại và máy tính: nhắn WeChat, tìm trên Baidu, Taobao, làm bài thi trên máy. Mỗi
        chữ gợi ý có pinyin, âm Hán Việt và nghĩa để chọn đúng chữ cùng âm.
      </p>
      <Playground showInfo={prefs.showInfo} />
      <section aria-labelledby="che-do">
        <h2 id="che-do" className="text-sm font-semibold text-muted">
          Luyện gõ
        </h2>
        <MyStats />
        <ul className="mt-2 grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => (
            <li key={m.id}>
              <a href={url(`${HOME}?che-do=${m.id}`)} className="block h-full rounded-2xl border border-line bg-card p-4 hover:border-accent">
                <h3 className="font-semibold">{m.name}</h3>
                <p className="text-sm text-muted">{m.desc}</p>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <MyErrors />
      <PunctGuide />
      <SetupGuide />
    </div>
  );
}

export default function TypingApp() {
  const mode = useQueryParam('che-do');
  const nguon = useQueryParam('nguon');
  const [prefs, update, prefsReady] = usePrefs();
  useEffect(() => {
    const names: Record<string, string> = {
      tu: 'Gõ từ',
      doan: 'Gõ theo đoạn văn',
      bay: 'Bẫy cùng âm',
      'toc-do': 'Thử thách 1 phút',
    };
    document.title = `${mode && names[mode] ? `${names[mode]} · ` : ''}Gõ chữ · Chữ Hán`;
  }, [mode]);
  // ghi lần luyện gần nhất để thanh "Tiếp tục" ở các trang luyện quay lại đúng chế độ gõ;
  // chỉ ghi sau khi prefs đã tải xong (bỏ qua lần chạy đầu với DEFAULTS để không ghi nhãn sai tạm thời)
  useEffect(() => {
    if (!mode || !prefsReady) return;
    const r = typingResume(mode, nguon, prefs);
    if (r) void recordPractice({ label: r.label, url: r.url });
  }, [mode, nguon, prefs.wordSrc, prefs.trapLevel, prefsReady]);
  const body =
    mode === 'tu' ? (
      <WordMode prefs={prefs} update={update} />
    ) : mode === 'doan' ? (
      <LazyPassageMode
        pinyin={prefs.passPinyin}
        setPinyin={(p) => update({ passPinyin: p })}
        showInfo={prefs.showInfo}
        setShowInfo={(v) => update({ showInfo: v })}
        punct={prefs.punct}
        setPunct={(v) => update({ punct: v })}
      />
    ) : mode === 'bay' ? (
      <TrapMode prefs={prefs} update={update} />
    ) : mode === 'toc-do' ? (
      <SpeedMode prefs={prefs} update={update} />
    ) : (
      <Landing prefs={prefs} />
    );
  return (
    <>
      <ResumeBar />
      <Suspense fallback={<Loading label="Đang tải…" />}>{body}</Suspense>
    </>
  );
}
