/**
 * Âm thanh: giọng có sẵn của máy (Web Speech API, chỉ zh-CN, chuẩn đại lục) và bản ghi người thật
 * (audio-cmn: âm tiết giọng Chen Wang, từ HSK giọng Yue Tan).
 */
import { syllableAudioUrl, wordAudioUrl } from './data';
import { getSetting } from './db';

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  voiceURI: string;
}

/** Bộ giọng "cho vui" của Apple (đọc được nhiều thứ tiếng, kém tự nhiên): không chọn làm mặc định. */
const NOVELTY = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;
/** Giọng chất lượng tốt đã biết trên các hệ điều hành. */
const GOOD = /(tingting|ting-ting|li-mu|limu|yu-shu|yushu|lili|xiaoxiao|xiaoyi|yunxi|yunyang|huihui|yaoyao|kangkang)/i;

/** Giọng tiếng Phổ thông đại lục (zh-CN và các cách viết tương đương). */
export function isMandarinCN(lang: string): boolean {
  const l = lang.replace(/_/g, '-').toLowerCase();
  return l === 'zh-cn' || l.startsWith('zh-cn-') || l === 'zh-hans-cn' || l === 'cmn-hans-cn' || l === 'cmn-cn' || l === 'zh-hans';
}

/** Điểm xếp hạng giọng; -1 = không dùng. */
export function rankVoice(v: VoiceLike): number {
  if (!isMandarinCN(v.lang)) return -1;
  let score = 50;
  if (NOVELTY.test(v.name)) score -= 40;
  if (/natural|neural|premium|enhanced/i.test(v.name)) score += 30;
  if (GOOD.test(v.name)) score += 20;
  if (/google/i.test(v.name)) score += 15; // tự nhiên nhưng cần mạng
  if (v.localService) score += 10; // chạy được khi offline
  return score;
}

/** Giọng nên dùng: giọng đã chọn trong Cài đặt nếu còn, không thì giọng zh-CN xếp hạng cao nhất. */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], preferredURI?: string | null): T | undefined {
  if (preferredURI) {
    const v = voices.find((x) => x.voiceURI === preferredURI);
    if (v) return v;
  }
  return [...voices]
    .map((v) => ({ v, r: rankVoice(v) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => b.r - a.r || a.v.name.localeCompare(b.v.name))[0]?.v;
}

/**
 * Tối đa `n` giọng máy cho một từ: giọng đã chọn trong Cài đặt đứng đầu (nếu máy còn giọng đó), rồi các giọng zh-CN
 * xếp hạng cao nhất. Thuần để test.
 */
export function wordVoiceOrder<T extends VoiceLike>(voices: readonly T[], preferredURI?: string | null, n = 2): T[] {
  const ranked = voices
    .map((v) => ({ v, r: rankVoice(v) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => b.r - a.r || a.v.name.localeCompare(b.v.name))
    .map((x) => x.v);
  const pref = preferredURI ? voices.find((x) => x.voiceURI === preferredURI) : undefined;
  return (pref ? [pref, ...ranked.filter((v) => v !== pref)] : ranked).slice(0, n);
}

const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

let voicesP: Promise<SpeechSynthesisVoice[]> | null = null;
/** Danh sách giọng (một số trình duyệt nạp không đồng bộ). */
export function loadVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  if (!supported()) return Promise.resolve([]);
  voicesP ??= new Promise((resolve) => {
    const now = window.speechSynthesis.getVoices();
    if (now.length) return resolve(now);
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', done);
    setTimeout(done, timeoutMs);
  });
  return voicesP;
}

/** Giọng zh-CN sẽ dùng, hoặc undefined nếu máy không có. */
export async function chineseVoice(preferredURI?: string | null): Promise<SpeechSynthesisVoice | undefined> {
  return pickVoice(await loadVoices(), preferredURI);
}

/**
 * Đọc `text` bằng giọng zh-CN. Trả về khi đọc xong; bị ngắt (bấm đọc cái khác) không coi là lỗi.
 * `rate` 1 = bình thường, 0,75 = chậm.
 */
export async function speak(text: string, opts: { rate?: number; voice?: SpeechSynthesisVoice } = {}): Promise<void> {
  if (!supported()) throw new Error('Trình duyệt không đọc được văn bản');
  const preferredURI = await getSetting<string>('voiceURI', '');
  const voice = opts.voice ?? (await chineseVoice(preferredURI));
  return new Promise((resolve, reject) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? 'zh-CN';
    if (voice) u.voice = voice;
    u.rate = opts.rate ?? 1;
    u.onend = () => resolve();
    u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? resolve() : reject(new Error(e.error)));
    stopAll();
    window.speechSynthesis.speak(u);
  });
}

/* ---------- bản ghi người thật ---------- */

let player: HTMLAudioElement | null = null;
/** Mỗi lệnh phát/dừng tăng số này: lệnh phát cũ đang tải dở thì bỏ, không phát chồng. */
let playToken = 0;
/** Kết thúc lời hứa của lần phát đang dở khi bị dừng (để nút "đang phát" không kẹt). */
let settle: (() => void) | null = null;

/**
 * Tệp âm thanh đã tải: src → object URL. Tải bằng fetch thường (không có Range) để service worker
 * lưu được trọn tệp, và Safari phát lại được khi offline. Giữ tối đa 120 tệp gần nhất.
 */
const blobs = new Map<string, Promise<string>>();
const MAX_BLOBS = 120;

function blobUrl(src: string): Promise<string> {
  const hit = blobs.get(src);
  if (hit) {
    blobs.delete(src);
    blobs.set(src, hit);
    return hit;
  }
  const p = fetch(src).then(async (res) => {
    if (!res.ok) throw new Error(`Không tải được âm thanh (HTTP ${res.status})`);
    return URL.createObjectURL(await res.blob());
  });
  blobs.set(src, p);
  p.catch(() => blobs.delete(src));
  while (blobs.size > MAX_BLOBS) {
    const [k, old] = blobs.entries().next().value!;
    blobs.delete(k);
    void old.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
  }
  return p;
}

/** Dừng mọi âm thanh đang phát (bản ghi và giọng máy). */
export function stopAll() {
  playToken++;
  settle?.();
  settle = null;
  if (player) {
    player.onended = null;
    player.onerror = null;
    player.pause();
  }
  if (supported()) window.speechSynthesis.cancel();
}

/** Phát một tệp mp3; xong (hoặc bị dừng) thì trả về. `rate` 0,75 = chậm, giữ cao độ. */
export async function playUrl(src: string, rate = 1): Promise<void> {
  stopAll();
  const token = playToken;
  const u = await blobUrl(src);
  if (token !== playToken) return; // đã bị dừng, hoặc có lệnh phát khác trong lúc tải
  player ??= new Audio();
  const el = player;
  el.src = u;
  el.playbackRate = rate;
  el.preservesPitch = true;
  return new Promise((resolve, reject) => {
    settle = resolve;
    el.onended = () => {
      settle = null;
      resolve();
    };
    el.onerror = () => {
      settle = null;
      reject(new Error('Không phát được âm thanh'));
    };
    el.play().catch((err: unknown) => {
      settle = null;
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

/** Một mẫu WAV im lặng rất ngắn, dùng để "mở khoá" âm thanh trên iPhone/iPad. */
const SILENT = 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA==';

/**
 * iPhone/iPad chỉ cho phát âm thanh bắt đầu từ một lần chạm. Lần chạm (hoặc phím) đầu tiên trên trang
 * phát một mẫu im lặng bằng chính phần tử audio sẽ dùng, và (trên iOS) một câu đọc rỗng: sau đó app
 * tự phát được câu hỏi kế tiếp mà không cần chạm thêm.
 */
function installAudioUnlock() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // iPadOS báo là Macintosh nhưng có màn hình cảm ứng
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const unlock = () => {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    player ??= new Audio();
    const el = player;
    if (!el.src) {
      el.src = SILENT;
      el.play()
        .then(() => {
          if (el.src.startsWith('data:')) el.pause();
        })
        .catch(() => undefined);
    }
    if (ios && supported()) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}
installAudioUnlock();

/** Một giọng đọc được cho một từ: bản ghi người thật hoặc một giọng máy. */
export interface WordVoice {
  id: string;
  label: string;
  human: boolean;
  play: (rate?: number) => Promise<void>;
}

/**
 * Các giọng đọc được từ này: bản ghi người thật trước (nếu có), rồi tối đa 2 giọng máy zh-CN: giọng đã chọn trong Cài
 * đặt đứng đầu, rồi giọng tốt nhất.
 * Rỗng = máy không đọc được từ này (tạm dừng thẻ Nghe của từ).
 */
export async function voicesForWord(text: string, wordId?: string): Promise<WordVoice[]> {
  const out: WordVoice[] = [];
  const human = wordId ? await wordAudioUrl(wordId).catch(() => undefined) : undefined;
  if (human) out.push({ id: 'human', label: 'Người đọc', human: true, play: (rate) => playUrl(human, rate) });
  // giọng máy: giọng đã chọn trong Cài đặt trước (trước đây bị bỏ qua vì tự xếp hạng lại)
  const preferredURI = await getSetting<string>('voiceURI', '').catch(() => '');
  for (const v of wordVoiceOrder(await loadVoices(), preferredURI)) out.push({ id: v.voiceURI, label: v.name, human: false, play: (rate) => speak(text, { rate, voice: v }) });
  return out;
}

/** Phát âm tiết có thanh ("ma3") bằng bản ghi; false nếu không có bản ghi. */
export async function playSyllable(key: string, rate = 1): Promise<boolean> {
  const u = await syllableAudioUrl(key).catch(() => undefined);
  if (!u) return false;
  await playUrl(u, rate).catch(() => undefined);
  return true;
}
