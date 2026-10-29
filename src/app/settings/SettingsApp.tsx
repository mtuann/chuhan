/**
 * Trang Cài đặt (/toi/cai-dat/): cấp đã biết, cách hiện pinyin và Hán Việt khi đọc, giọng đọc. Mỗi thay đổi lưu ngay
 * vào IndexedDB; giọng đọc áp dụng ngay khi bấm Nghe thử.
 */
import { useEffect, useRef, useState } from 'react';
import { getSetting, setSetting, SETTING_DEFAULTS, type SettingValues } from '../../lib/settings';
import { loadVoices, rankVoice, speak, type VoiceLike } from '../../lib/audio';
import { levelLabel } from '../../lib/text';
import { Card, Loading, SpeakerIcon, btn } from '../ui';

type Settings = Pick<SettingValues, 'knownLevel' | 'docPinyin' | 'docHv' | 'voiceURI'>;

/** Default của trang Cài đặt: trỏ về registry (`SETTING_DEFAULTS`) — một nơi duy nhất. */
const DEFAULTS: Settings = {
  knownLevel: SETTING_DEFAULTS.knownLevel,
  docPinyin: SETTING_DEFAULTS.docPinyin,
  docHv: SETTING_DEFAULTS.docHv,
  voiceURI: SETTING_DEFAULTS.voiceURI,
};

const KNOWN_LEVELS = [1, 2, 3, 4, 5, 6];
const PINYIN_VI = { all: 'Hiện hết', new: 'Chỉ từ chưa biết', off: 'Tắt (chạm để xem)' } as const;

const selectCls = 'mt-2 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm';

/** Tên giọng thân thiện: tên gốc + dấu hiệu chạy được khi ngoại tuyến. */
const friendlyName = (v: VoiceLike): string => `${v.name}${v.localService ? ' · ngoại tuyến' : ''}`;

/** Công tắc bật/tắt tự làm (không có component chung). */
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => void onChange(!on)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${on ? 'border-accent bg-accent' : 'border-line'}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}

export default function SettingsApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [voices, setVoices] = useState<VoiceLike[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [playing, setPlaying] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    // giá trị hiện tại (kể cả khi người dùng đã đổi trước đó), chưa có thì lấy mặc định
    (async () => {
      const [knownLevel, docPinyin, docHv, voiceURI] = await Promise.all([
        getSetting('knownLevel'),
        getSetting('docPinyin'),
        getSetting('docHv'),
        getSetting('voiceURI'),
      ]);
      if (alive) setSettings({ knownLevel, docPinyin, docHv, voiceURI });
    })().catch(() => {
      if (alive) setSettings(DEFAULTS);
    });
    // giọng zh-CN của máy, đã lọc và xếp hạng như khi đọc thật
    loadVoices()
      .then((vs) => {
        if (!alive) return;
        setVoices(
          vs
            .map((v) => ({ v, r: rankVoice(v) }))
            .filter((x) => x.r > 0)
            .sort((a, b) => b.r - a.r || a.v.name.localeCompare(b.v.name))
            .map((x) => x.v),
        );
      })
      .catch(() => {
        if (alive) setVoices([]);
      });
    return () => {
      alive = false;
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  if (!settings) return <Loading label="Đang tải cài đặt…" />;

  const flashSaved = () => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1500);
  };

  /** Mỗi thay đổi lưu ngay vào IndexedDB. */
  const update = async <K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> => {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    // Ghim K2 = union key cụ thể: Settings là Pick của SettingValues nên
    // Settings[K] luôn khớp SettingValues[K] theo từng key (tránh giới hạn
    // suy luận generic của TS qua Pick).
    await setSetting<keyof Settings>(key, value);
    flashSaved();
  };

  const reset = async (): Promise<void> => {
    const keys = Object.keys(DEFAULTS) as (keyof Settings)[];
    await Promise.all(keys.map((k) => setSetting(k, DEFAULTS[k])));
    setSettings(DEFAULTS);
    flashSaved();
  };

  const preview = async (): Promise<void> => {
    setPlaying(true);
    try {
      await speak('你好，我是中文语音。');
    } catch {
      // máy không đọc được: bỏ qua, người dùng vẫn đổi được giọng
    } finally {
      setPlaying(false);
    }
  };

  const voiceGone =
    settings.voiceURI !== '' && voices !== null && !voices.some((v) => v.voiceURI === settings.voiceURI);

  return (
    <div className="space-y-4">
      <p role="status" aria-live="polite" className="h-5 text-sm font-semibold text-accent">
        {saved ? 'Đã lưu ✓' : ''}
      </p>

      <Card>
        <label htmlFor="set-known" className="text-sm font-semibold">
          Tôi đã biết
        </label>
        <select id="set-known" value={settings.knownLevel} onChange={(e) => void update('knownLevel', Number(e.target.value))} className={selectCls}>
          <option value={0}>Chưa chọn</option>
          {KNOWN_LEVELS.map((n) => (
            <option key={n} value={n}>
              Mọi từ {n === 1 ? 'HSK 1' : `HSK 1–${n}`}
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-muted">
          Khi đọc, từ các cấp này coi như đã biết: không gạch chân, ẩn pinyin ở chế độ "chỉ từ chưa biết". Từ bạn đánh dấu riêng (đang học, đã biết)
          luôn được ưu tiên. Cấp {levelLabel(7)} không có ở đây vì quá rộng.
        </p>
      </Card>

      <Card>
        <label htmlFor="set-pinyin" className="text-sm font-semibold">
          Pinyin khi đọc
        </label>
        <select id="set-pinyin" value={settings.docPinyin} onChange={(e) => void update('docPinyin', e.target.value as Settings['docPinyin'])} className={selectCls}>
          {(Object.keys(PINYIN_VI) as (keyof typeof PINYIN_VI)[]).map((k) => (
            <option key={k} value={k}>
              {PINYIN_VI[k]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-muted">Đổi nhanh ngay trên trang Đọc và Xem cách viết.</p>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Hán Việt dưới từ chưa biết</p>
            <p className="mt-1 text-sm text-muted">Âm Hán Việt nhỏ dưới mỗi từ chưa biết khi đọc.</p>
          </div>
          <Toggle on={settings.docHv} onChange={(v) => void update('docHv', v)} label="Hán Việt dưới từ chưa biết" />
        </div>
      </Card>

      <Card>
        <label htmlFor="set-voice" className="text-sm font-semibold">
          Giọng đọc
        </label>
        <select
          id="set-voice"
          value={settings.voiceURI}
          onChange={(e) => void update('voiceURI', e.target.value)}
          className={selectCls}
          disabled={voices === null}
        >
          <option value="">Tự động (giọng tốt nhất)</option>
          {voices?.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {friendlyName(v)}
            </option>
          ))}
        </select>
        {voiceGone && <p className="mt-1 text-sm text-t1">Giọng đã chọn không còn trên máy; đang dùng giọng tự động.</p>}
        {voices !== null && voices.length === 0 && (
          <p className="mt-1 text-sm text-muted">Máy chưa có giọng đọc tiếng Trung: cài giọng 中文 (Trung Quốc) trong phần Ngôn ngữ / Giọng nói của máy rồi mở lại trang.</p>
        )}
        <div className="mt-3">
          <button type="button" className={btn} onClick={() => void preview()} disabled={playing}>
            <SpeakerIcon /> {playing ? 'Đang đọc…' : 'Nghe thử'}
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">Giọng đã chọn dùng cho mọi lần đọc bằng giọng máy trong buổi học.</p>
      </Card>

      <div>
        <button type="button" className={btn} onClick={() => void reset()}>
          Khôi phục mặc định
        </button>
      </div>
    </div>
  );
}
