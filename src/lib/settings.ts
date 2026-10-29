/**
 * Registry cài đặt (bảng `settings` trong IndexedDB): MỘT nơi khai báo kiểu và giá trị mặc định cho mọi key.
 */
import { getSetting as dbGetSetting, setSetting as dbSetSetting } from './db';
import type { LastPractice } from '../app/practice/resume';
import type { PinyinMode } from '../app/reading/ReaderText';
import type { SavedPassage } from '../app/typing/passages';
import type { Prefs as TypingPrefs } from '../app/typing/TypingApp';
import type { PrintOpts } from '../app/writing/PrintApp';
import type { Opts as SentenceOpts } from '../app/writing/SentenceApp';

/** Kiểu giá trị của từng key trong bảng `settings`. */
export interface SettingValues {
  /** giọng đọc đã chọn ('' = tự động chọn giọng tốt nhất) */
  voiceURI: string;
  /** đã biết mọi từ HSK 1…N (0: chưa chọn): từ các cấp này coi như đã biết khi đọc */
  knownLevel: number;
  /** tuỳ chọn trang In chữ (chỉ lưu phần đã đổi) */
  vietIn: Partial<PrintOpts>;
  /** tuỳ chọn trang Xem cách viết (chỉ lưu phần đã đổi) */
  vietCau: Partial<SentenceOpts>;
  /** câu đang xem cách viết */
  vietCauText: string;
  /** cấp đang chọn ở trang Tập viết */
  vietCap: string;
  /** lịch sử văn bản đã đọc (trang Đọc) */
  docHistory: { text: string; at: number }[];
  /** tuỳ chọn trang Gõ chữ (chỉ lưu phần đã đổi) */
  typing: Partial<TypingPrefs>;
  /** đoạn văn đã lưu ở Gõ theo đoạn văn */
  typingPassages: SavedPassage[];
  /** chế độ hiện pinyin ở trang Đọc */
  docPinyin: PinyinMode;
  /** hiện gợi ý Hán Việt ở trang Đọc */
  docHv: boolean;
  /** lần luyện gần nhất (thanh "Tiếp tục") */
  lastPractice: LastPractice | null;
  /** đã bấm × ẩn thanh "Tiếp tục" */
  lastPracticeDismissed: boolean;
}

export type SettingKey = keyof SettingValues;

/**
 * Giá trị mặc định DUY NHẤT cho mọi key trong bảng `settings`.
 */
export const SETTING_DEFAULTS: SettingValues = {
  voiceURI: '',
  knownLevel: 0,
  vietIn: {},
  vietCau: {},
  vietCauText: '',
  vietCap: '1',
  docHistory: [],
  typing: {},
  typingPassages: [],
  docPinyin: 'new',
  docHv: true,
  lastPractice: null,
  lastPracticeDismissed: false,
};

/**
 * Đọc một cài đặt; chưa lưu thì trả về default trong registry.
 * Default dạng object/mảng được sao chép nông mỗi lần đọc, để nơi gọi
 * không vô tình làm bẩn default dùng chung.
 */
export function getSetting<K extends SettingKey>(key: K): Promise<SettingValues[K]> {
  const d = SETTING_DEFAULTS[key];
  const fallback =
    d !== null && typeof d === 'object'
      ? ((Array.isArray(d) ? [...d] : { ...d }) as SettingValues[K])
      : d;
  return dbGetSetting(key, fallback);
}

/** Lưu một cài đặt (đúng kiểu của key). */
export function setSetting<K extends SettingKey>(key: K, value: SettingValues[K]): Promise<void> {
  return dbSetSetting(key, value);
}
