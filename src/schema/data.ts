/**
 * Schema dữ liệu sinh ra bởi pipeline (public/data/). Dùng chung cho pipeline (kiểm tra khi xuất),
 * test hợp đồng dữ liệu và kiểu TypeScript của app (`z.infer`, chỉ import kiểu nên zod không vào bundle).
 *
 * Quy ước cấp: 1–6 là cấp HSK; 7 là nhóm 7–9. Khoá `x` là các từ/chữ không có trong HSK 2025
 * (chỉ có trong chuẩn 2021 hoặc HSK 2.0).
 */
import { z } from 'zod';

export const DATA_VERSION = 1;

/** Cấp HSK 2025 dùng trong app; 7 = nhóm 7–9. */
export const E25_LEVELS = ['1', '2', '3', '4', '5', '6', '7'] as const;
export const PACK_KEYS = [...E25_LEVELS, 'x'] as const;
export const PackKey = z.enum(PACK_KEYS);
export type PackKey = z.infer<typeof PackKey>;

const Lv7 = z.number().int().min(1).max(7);
const Lv6 = z.number().int().min(1).max(6);

/** `<giản thể>_<pinyin số liền>`, ví dụ `爱好_ai4hao4`, `一点儿_yi1dian3r5`. */
export const WordId = z.string().regex(/^[^_\s]+_(?:[a-z]+[1-5])+$/u, 'id từ không hợp lệ');

/** Trạng thái nội dung AI soạn (spec 00 mục 6): `draft` hiện nhãn "chưa duyệt". */
export const ContentStatus = z.enum(['draft', 'reviewed', 'checked']);
export type ContentStatus = z.infer<typeof ContentStatus>;
export const ContentBy = z.enum(['ai', 'owner']);

export const WordRec = z
  .object({
    id: WordId,
    /** Giản thể. */
    s: z.string().min(1),
    /** Phồn thể, chỉ có khi khác giản thể. */
    t: z.string().min(1).optional(),
    /** Pinyin hiển thị: theo đề cương 2025 (có biến điệu 一/不 như sách), từ khác theo dạng chuẩn từ điển. */
    p: z.string().min(1),
    lv: z
      .object({
        /** Cấp theo đề cương thi 2025 (cấp chính). */
        e25: Lv7.optional(),
        /** Cấp theo chuẩn 2021 (GF0025-2021). */
        s21: Lv7.optional(),
        /** Cấp HSK 2.0 (2012). */
        h20: Lv6.optional(),
      })
      .strict(),
    /** Các cấp 2025 khác mà mục này xuất hiện lại (thường với từ loại khác). */
    also: z.array(Lv7).optional(),
    /** Từ loại theo đề cương (名, 动, 形…). */
    pos: z.array(z.string().min(1)).optional(),
    /** Nghĩa tiếng Việt (CVDICT, máy dịch từ CC-CEDICT; chưa duyệt). */
    vi: z.array(z.string().min(1)).optional(),
    /** Nghĩa tiếng Anh. */
    en: z.array(z.string().min(1)).optional(),
    /** Âm Hán Việt theo từng âm tiết; mỗi phần tử là danh sách cách đọc, cách đầu là mặc định; null nếu không có. */
    hv: z.array(z.array(z.string().min(1)).min(1).nullable()).optional(),
    /** Vị trí âm tiết có âm Hán Việt chỉ khớp theo chữ (không khớp được pinyin) — nên hiện mờ. */
    hva: z.array(z.number().int().min(0)).optional(),
    /** Lượng từ đi kèm (giản thể). */
    cl: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type WordRec = z.infer<typeof WordRec>;

export const WordPack = z
  .object({
    v: z.literal(DATA_VERSION),
    level: PackKey,
    chunk: z.number().int().min(0),
    words: z.array(WordRec),
  })
  .strict();
export type WordPack = z.infer<typeof WordPack>;

export const CharRec = z
  .object({
    c: z.string().min(1),
    lv: z
      .object({
        /** Cấp chữ đọc 2025. */
        r25: Lv7.optional(),
        /** Cấp chữ viết tay 2025. */
        w25: Lv7.optional(),
        /** Cấp chữ chuẩn 2021 và cấp viết tay 2021. */
        s21: Lv7.optional(),
        sw21: Lv7.optional(),
      })
      .strict(),
    /** Phồn thể tương ứng (có thể nhiều), chỉ khi khác chữ gốc. */
    t: z.array(z.string().regex(/^.$/u, 'mỗi dạng phồn thể là một chữ')).optional(),
    /** Số nét (theo dữ liệu nét). */
    sc: z.number().int().min(1).optional(),
    /** Có dữ liệu nét để vẽ/viết thử. */
    st: z.literal(1).optional(),
    /** Bộ (Make Me a Hanzi). */
    rad: z.string().min(1).optional(),
    /** Cấu tạo dạng IDS, ví dụ ⿰女子. */
    dec: z.string().min(1).optional(),
    /** Loại chữ và gợi ý nguồn gốc (tiếng Anh, Make Me a Hanzi). */
    et: z
      .object({
        t: z.enum(['ideographic', 'pictographic', 'pictophonetic']),
        h: z.string().min(1).optional(),
        s: z.string().min(1).optional(),
        p: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    /** Nghĩa ngắn tiếng Anh (Make Me a Hanzi). */
    def: z.string().min(1).optional(),
    /** Các cách đọc pinyin (dạng số, ví dụ `hao3`). */
    py: z.array(z.string().regex(/^[a-z]+[1-5]$/)).optional(),
    /** Âm Hán Việt theo từng cách đọc: `{ hao3: ['hảo'], hao4: ['hiếu'] }`; khoá `*` khi không gắn với pinyin nào. */
    hv: z.record(z.string(), z.array(z.string().min(1)).min(1)).optional(),
  })
  .strict();
export type CharRec = z.infer<typeof CharRec>;

export const CharPack = z
  .object({
    v: z.literal(DATA_VERSION),
    level: PackKey,
    chunk: z.number().int().min(0),
    chars: z.array(CharRec),
  })
  .strict();
export type CharPack = z.infer<typeof CharPack>;

/** Danh sách chữ theo cấp: chữ đọc và chữ viết tay (từ của cấp nằm trong các gói từ, xem Manifest.words). */
export const LevelList = z
  .object({
    v: z.literal(DATA_VERSION),
    level: PackKey,
    chars: z.array(z.string().min(1)),
    writing: z.array(z.string().min(1)),
  })
  .strict();
export type LevelList = z.infer<typeof LevelList>;

/** Dòng tìm kiếm gọn: [id, cấp 2025 (0 nếu không có), pinyin hiển thị, Hán Việt mặc định, nghĩa Việt ngắn, nghĩa Anh ngắn]. */
/**
 * Một từ trong gói tìm kiếm: [id, cấp (0 = ngoài HSK 2025), pinyin, Hán Việt, nghĩa Việt ngắn, nghĩa Anh ngắn] và có thể
 * thêm hạng tần suất (số nhỏ là từ hay gặp; theo complete-hsk-vocabulary) để xếp chữ gợi ý của bộ gõ.
 */
export const SearchRow = z
  .tuple([WordId, z.number().int().min(0).max(7), z.string().min(1), z.string(), z.string(), z.string()])
  .rest(z.number().int().min(1));
export type SearchRow = z.infer<typeof SearchRow>;
export const SearchPack = z
  .object({ v: z.literal(DATA_VERSION), level: PackKey, chunk: z.number().int().min(0), rows: z.array(SearchRow) })
  .strict();
export type SearchPack = z.infer<typeof SearchPack>;

/** Mục từ điển mở rộng (CVDICT): [giản thể, phồn thể hoặc "" nếu giống, pinyin số có cách, các nghĩa tiếng Việt]. */
export const DictEntry = z.tuple([z.string().min(1), z.string(), z.string(), z.array(z.string().min(1)).min(1)]);
export type DictEntry = z.infer<typeof DictEntry>;
export const DictShard = z
  .object({ v: z.literal(DATA_VERSION), shard: z.string().regex(/^[0-9a-f]{2}$/), entries: z.array(DictEntry) })
  .strict();
export type DictShard = z.infer<typeof DictShard>;

export { dictShardOf } from './dict-shard';

/**
 * Một token của câu: `[chữ]` dấu câu · `[chữ, pinyin]` tên riêng · `[chữ, pinyin, id từ]`.
 * Pinyin lấy từ dữ liệu (đã biến điệu 一/不 theo ngữ cảnh, viết hoa đầu câu và tên riêng), không do AI viết.
 */
export const Token = z.union([
  z.tuple([z.string().min(1)]),
  z.tuple([z.string().min(1), z.string().min(1)]),
  z.tuple([z.string().min(1), z.string().min(1), WordId]),
]);
export type Token = z.infer<typeof Token>;
// ------------------------------------------------------------------ bộ thủ (Unicode + dữ liệu Hán Việt)

/** Một bộ Khang Hy (1–214). */
export const RadicalRec = z
  .object({
    n: z.number().int().min(1).max(214),
    /** chữ thống nhất của bộ (水) */
    c: z.string().min(1),
    /** các dạng khác của bộ có trong dữ liệu chữ (氵, 氺) */
    f: z.array(z.string().min(1)).optional(),
    /** âm Hán Việt của chữ bộ (dữ liệu Hán Việt; có thể nhiều) */
    hv: z.array(z.string().min(1)).optional(),
    /** tên gọi khác có nguồn (content/radicals.yaml): [dạng bộ, tên], ví dụ ["亻", "nhân đứng"] */
    aka: z.array(z.tuple([z.string().min(1), z.string().min(1)])).optional(),
    /** chữ HSK có bộ này (viết liền), cấp thấp trước, cùng cấp thì ít nét trước */
    ch: z.string().min(1).optional(),
  })
  .strict();
export type RadicalRec = z.infer<typeof RadicalRec>;
export const RadicalsPack = z
  .object({
    v: z.literal(DATA_VERSION),
    radicals: z.array(RadicalRec).length(214),
    /** dạng bộ trong dữ liệu chữ (trường `rad`) → số bộ */
    forms: z.record(z.string(), z.number().int().min(1).max(214)),
    /** chữ có 阝 bên phải (都, 那): bộ 邑 số 163; 阝 bên trái (陈, 院) là bộ 阜 số 170 */
    cityRight: z.array(z.string().min(1)),
  })
  .strict();
export type RadicalsPack = z.infer<typeof RadicalsPack>;

// ------------------------------------------------------------------ âm thanh người thật (audio-cmn, CC BY-SA)

/** Âm tiết có dấu số, ü viết v: "ma3", "lve4". */
export const SyllableKey = z.string().regex(/^[a-z]+[1-4]$/);

/** Ghi chú phát âm cho người Việt trong bảng pinyin (content/pinyin.yaml). */
export const PinyinNote = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    /** phụ âm đầu hoặc vần mà ghi chú áp dụng ("zh", "er"); rỗng = ghi chú chung */
    sounds: z.array(z.string().regex(/^[a-z]+$/)),
    title: z.string().min(1),
    text: z.string().min(1),
    /** cặp âm tiết để nghe so sánh */
    pairs: z.array(z.tuple([SyllableKey, SyllableKey])),
  })
  .strict();
export type PinyinNote = z.infer<typeof PinyinNote>;
export const PinyinNotesPack = z
  .object({ v: z.literal(DATA_VERSION), status: ContentStatus, by: ContentBy, notes: z.array(PinyinNote).min(1) })
  .strict();
export type PinyinNotesPack = z.infer<typeof PinyinNotesPack>;
export const AudioIndex = z
  .object({
    v: z.literal(DATA_VERSION),
    /** âm tiết (giọng Chen Wang): tệp `<dir><key>.mp3` */
    s: z.object({ dir: z.string(), keys: z.array(SyllableKey) }).strict(),
    /** từ và chữ HSK (giọng Yue Tan), chỉ những từ có một cách đọc: id từ → tên tệp (không đuôi) */
    w: z.object({ dir: z.string(), ids: z.record(WordId, z.string().regex(/^[0-9a-f]{8}$/)) }).strict(),
  })
  .strict();
export type AudioIndex = z.infer<typeof AudioIndex>;

const Chunked = z.object({ per: z.number().int().min(1), files: z.array(z.string().min(1)).min(1) }).strict();
/** Gói từ: các khối xếp theo id tăng dần; `first[i]` là id đầu tiên của khối i (tìm khối chứa một id bằng tìm nhị phân). */
const WordChunks = Chunked.extend({ first: z.array(WordId) }).strict();

export const Manifest = z
  .object({
    v: z.literal(DATA_VERSION),
    /** Băm của toàn bộ dữ liệu xuất ra; đổi khi bất kỳ tệp nào đổi. */
    hash: z.string().regex(/^[0-9a-f]{16}$/),
    strokes: z.object({ version: z.string(), dir: z.string() }).strict(),
    levels: z.record(PackKey, z.string()),
    words: z.record(PackKey, WordChunks),
    chars: z.record(PackKey, Chunked),
    search: z.record(PackKey, Chunked),
    dict: z.object({ dir: z.string(), files: z.record(z.string(), z.string()) }).strict(),
    /** Số lượng để hiển thị và kiểm tra nhanh. */
    counts: z
      .object({
        words: z.record(PackKey, z.number().int()),
        chars: z.record(PackKey, z.number().int()),
        writing: z.record(z.enum(E25_LEVELS), z.number().int()),
        dict: z.number().int(),
        strokes: z.number().int(),
      })
      .strict(),
    /** Dung lượng (byte, chưa nén) cần tải để học offline từng cấp: gói từ, chữ, tìm kiếm, nét chữ. */
    offlineBytes: z.record(z.enum(E25_LEVELS), z.number().int()),
    /** 214 bộ Khang Hy. */
    radicals: z.string(),
    /** Ghi chú phát âm của bảng pinyin. */
    pinyinNotes: z.string(),
    /** Chỉ mục âm thanh người thật. */
    audio: z.string(),
  })
  .strict();
export type Manifest = z.infer<typeof Manifest>;
