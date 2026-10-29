/**
 * Tiện ích pinyin dùng chung cho app và pipeline dữ liệu.
 *
 * Hai dạng viết:
 * - dạng dấu: "àihào", "nǚ’ér", "Zhōngguó" (cách viết trong đề cương);
 * - dạng số: "ai4 hao4", "nv3 er2", "lv4" (ü viết `v`; CC-CEDICT viết `u:`), thanh nhẹ là 5.
 *
 * Một âm tiết được tách thành `base` (chữ thường, không dấu, ü → v) và `tone` (1–5).
 */

export type Tone = 1 | 2 | 3 | 4 | 5;
export interface Syl {
  base: string;
  tone: Tone;
}

/**
 * Mọi âm tiết hợp lệ (ü viết v), lấy từ CVDICT/CC-CEDICT; thêm n, ng, hm, hng (嗯, 哼) và r (儿 hoá).
 * Các âm `r m n ng hm hng` là âm đặc biệt: chỉ dùng khi không còn cách tách nào khác.
 */
const SYLLABLE_LIST =
  'a ai an ang ao ba bai ban bang bao bei ben beng bi bia bian biang biao bie bin bing biu bo bu ca cai can cang cao ce cen ceng ' +
  'cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo ci cong cou cu cuan cui cun ' +
  'cuo da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo e ei en eng er fa fan fang ' +
  'fei fen feng fiao fo fou fu ga gai gan gang gao ge gei gen geng ging gong gou gu gua guai guan guang gui gun guo ha hai han hang ' +
  'hao he hei hen heng hm hng hong hou hu hua huai huan huang hui hun huo ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue ' +
  'jun ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo la lai lan lang lao le lei leng li lia lian ' +
  'liang liao lie lin ling liu lo long lou lu luan lun luo lv lve m ma mai man mang mao me mei men meng mi mian miao mie min ming ' +
  'miu mo mou mu n na nai nan nang nao ne nei nen neng ng ni nian niang niao nie nin ning niu nong nou nu nuan nun nuo nv nve o ou ' +
  'pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu qi qia qian qiang qiao qie qin qing qiong qiu qu quan que ' +
  'qun r ran rang rao re ren reng ri rong rou ru ruan rui run ruo sa sai san sang sao se sei sen seng sha shai shan shang shao she ' +
  'shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si song sou su suan sui sun suo ta tai tan tang tao te tei ' +
  'teng ti tian tiao tie ting tong tou tu tuan tui tun tuo wa wai wan wang wei wen weng wo wu xi xia xian xiang xiao xie xin xing ' +
  'xiong xiu xu xuan xue xun ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun za zai zan zang zao ze zei zen zeng zha ' +
  'zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo';

export const SYLLABLES: ReadonlySet<string> = new Set(SYLLABLE_LIST.split(' '));
const SPECIAL = new Set(['r', 'm', 'n', 'ng', 'hm', 'hng']);

// ---------------------------------------------------------------- dạng số → dạng dấu

const MARKS: Record<string, string> = {
  a: 'āáǎàa', e: 'ēéěèe', i: 'īíǐìi', o: 'ōóǒòo', u: 'ūúǔùu', ü: 'ǖǘǚǜü',
  A: 'ĀÁǍÀA', E: 'ĒÉĚÈE', I: 'ĪÍǏÌI', O: 'ŌÓǑÒO', U: 'ŪÚǓÙU', Ü: 'ǕǗǙǛÜ',
};
const VOWELS = 'aeiouüAEIOUÜ';
/** Dấu thanh dạng tổ hợp (combining) theo thanh 1–4. */
const COMBINING = ['\u0304', '\u0301', '\u030C', '\u0300'];

/** "hao3" → "hǎo", "lv4"/"lu:4" → "lǜ", "de5" → "de", "ng2" → "ńg". Không phải âm tiết dạng số thì trả nguyên. */
export function syllableToMarks(syllable: string): string {
  const m = /^([A-Za-züÜ:]+?)([1-5])$/.exec(syllable);
  if (!m) return syllable;
  const body = m[1].replace(/u:/g, 'ü').replace(/U:/g, 'Ü').replace(/v/g, 'ü').replace(/V/g, 'Ü');
  const tone = Number(m[2]);
  if (tone === 5) return body;
  const lower = body.toLowerCase();
  let idx = lower.search(/[ae]/);
  if (idx < 0) idx = lower.indexOf('ou');
  if (idx < 0) {
    for (let i = body.length - 1; i >= 0; i--) {
      if (VOWELS.includes(body[i])) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) {
    // Âm tiết không nguyên âm (m, n, ng, hm, hng): dấu đặt trên m/n đầu tiên.
    const j = lower.search(/[mn]/);
    if (j < 0) return body;
    return (body.slice(0, j + 1) + COMBINING[tone - 1] + body.slice(j + 1)).normalize('NFC');
  }
  const ch = body[idx];
  const marked = MARKS[ch]?.[tone - 1];
  if (!marked) return body;
  return body.slice(0, idx) + marked + body.slice(idx + 1);
}

/** Chuyển cả chuỗi: "ai4hao4" → "àihào", "ni3 hao3" → "nǐ hǎo". */
export function numberedToMarks(pinyin: string): string {
  return pinyin.replace(/[A-Za-züÜ:]+[1-5]/g, (s) => syllableToMarks(s));
}

/** Lấy thanh điệu (1–5) của từng âm tiết trong pinyin dạng số. */
export function tonesOf(pinyin: string): number[] {
  return [...pinyin.matchAll(/[A-Za-züÜ:]+([1-5])/g)].map((m) => Number(m[1]));
}

/**
 * Tách pinyin dạng số thành âm tiết: "ai4 hao4", "ai4hao4", "nv3'er2", "Nu:3", "lü3", "r5".
 * Trả `null` nếu có phần không phải âm tiết dạng số (ví dụ chữ cái Latin trong "A cai4").
 */
export function parseNumbered(pinyin: string): Syl[] | null {
  const out: Syl[] = [];
  const rest = pinyin.replace(/[A-Za-züÜ:]+?[1-5]/g, (s) => {
    const tone = Number(s.slice(-1)) as Tone;
    const base = s.slice(0, -1).toLowerCase().replace(/u:/g, 'v').replace(/ü/g, 'v');
    out.push({ base, tone });
    return ' ';
  });
  return /^[\s'’,·\-]*$/.test(rest) && out.length > 0 ? out : null;
}

/** Ghép âm tiết thành dạng số liền nhau dùng trong id: [{ai,4},{hao,4}] → "ai4hao4". */
export function sylsToKey(syls: readonly Syl[]): string {
  return syls.map((s) => s.base + s.tone).join('');
}

/** Ghép âm tiết thành dạng số có cách: "ai4 hao4". */
export function sylsToNumbered(syls: readonly Syl[]): string {
  return syls.map((s) => s.base + s.tone).join(' ');
}

/**
 * Ghép âm tiết thành cách viết hiển thị liền một từ, đặt dấu nháy trước âm tiết bắt đầu bằng a/o/e:
 * [{nv,3},{er,2}] → "nǚ’ér"; âm r (儿 hoá) dính vào âm trước: [{yi,1},{dian,3},{r,5}] → "yīdiǎnr".
 */
export function sylsToDisplay(syls: readonly Syl[]): string {
  let out = '';
  syls.forEach((s, i) => {
    const marked = syllableToMarks(s.base + s.tone);
    if (i > 0 && s.base !== 'r' && /^[aoe]/.test(s.base)) out += '’';
    out += marked;
  });
  return out;
}

// ---------------------------------------------------------------- dạng dấu → âm tiết

const TONE_OF_COMBINING: Record<string, Tone> = { '\u0304': 1, '\u0301': 2, '\u030C': 3, '\u0300': 4 };

/** Một "chữ cái" pinyin sau khi phân rã NFD: chữ gốc (ü → v), thanh nếu có, và chuỗi gốc để cắt lại. */
interface Letter {
  ch: string;
  tone: Tone | 0;
  raw: string;
}

function toLetters(chunk: string): Letter[] | null {
  const out: Letter[] = [];
  for (const c of chunk.normalize('NFD')) {
    const t = TONE_OF_COMBINING[c];
    if (t) {
      if (!out.length) return null;
      out[out.length - 1].tone = t;
      out[out.length - 1].raw += c;
      continue;
    }
    if (c === '\u0308') {
      // dấu hai chấm của ü
      const last = out[out.length - 1];
      if (!last || last.ch !== 'u') return null;
      last.ch = 'v';
      last.raw += c;
      continue;
    }
    if (c === '\u0302') {
      // ê (rất hiếm): coi như e
      if (!out.length) return null;
      out[out.length - 1].raw += c;
      continue;
    }
    const lower = c.toLowerCase();
    if (!/^[a-z]$/.test(lower)) return null;
    out.push({ ch: lower === 'ü' ? 'v' : lower, tone: 0, raw: c });
  }
  return out;
}

export interface MarkedSyl extends Syl {
  /** Âm tiết đúng như viết trong nguồn, ví dụ "Zhōng", "nǚ". */
  text: string;
}

/** Ranh giới bắt buộc giữa các âm tiết: khoảng trắng, dấu nháy, gạch nối. */
const BOUNDARY = /[\s'’‘\-·]+/;

/**
 * Tách pinyin dạng dấu (có thể viết liền) thành âm tiết.
 * - `expected`: số âm tiết mong muốn (thường là số chữ Hán; 儿 hoá tính là một âm `r`).
 * - Âm tiết không đứng đầu thì không được bắt đầu bằng a/o/e (quy tắc dấu nháy của pinyin).
 * - Trong các cách tách hợp lệ, chọn cách ít âm đặc biệt nhất, rồi ít âm tiết nhất.
 * Trả `null` nếu không tách được.
 */
export function splitMarked(input: string, expected?: number, opts: { lenient?: boolean } = {}): MarkedSyl[] | null {
  const chunks = input.trim().split(BOUNDARY).filter(Boolean);
  const letterChunks: Letter[][] = [];
  for (const c of chunks) {
    const l = toLetters(c);
    if (!l) return null;
    letterChunks.push(l);
  }
  // Với mỗi chunk, liệt kê các cách tách (giới hạn) theo số âm tiết; rồi ghép các chunk sao cho tổng = expected.
  type Option = { syls: MarkedSyl[]; special: number };
  const perChunk: Map<number, Option>[] = letterChunks.map((letters) => chunkOptions(letters, !!opts.lenient));
  // Quy hoạch động trên các chunk: best[k] = phương án tốt nhất với k âm tiết.
  let best = new Map<number, Option>([[0, { syls: [], special: 0 }]]);
  for (const opts of perChunk) {
    const next = new Map<number, Option>();
    for (const [k, a] of best) {
      for (const [n, b] of opts) {
        const cand: Option = { syls: [...a.syls, ...b.syls], special: a.special + b.special };
        const cur = next.get(k + n);
        if (!cur || cand.special < cur.special) next.set(k + n, cand);
      }
    }
    best = next;
  }
  if (!best.size) return null;
  if (expected !== undefined) return best.get(expected)?.syls ?? null;
  let pick: Option | undefined;
  let pickN = Infinity;
  for (const [n, o] of best) {
    if (!pick || o.special < pick.special || (o.special === pick.special && n < pickN)) {
      pick = o;
      pickN = n;
    }
  }
  return pick?.syls ?? null;
}

/**
 * Mọi cách tách một chunk (không có ranh giới bên trong), gom theo số âm tiết, giữ cách ít âm đặc biệt nhất.
 * `lenient`: cho phép âm tiết bắt đầu bằng a/o/e ở giữa chunk (nguồn quên dấu nháy, ví dụ "téngài"), tính là âm đặc biệt.
 */
function chunkOptions(letters: Letter[], lenient: boolean): Map<number, { syls: MarkedSyl[]; special: number }> {
  const n = letters.length;
  // memo[i]: Map<số âm tiết, phương án> cho phần letters[i..]
  const memo: Array<Map<number, { syls: MarkedSyl[]; special: number }> | undefined> = new Array(n + 1);
  memo[n] = new Map([[0, { syls: [], special: 0 }]]);
  for (let i = n - 1; i >= 0; i--) {
    const res = new Map<number, { syls: MarkedSyl[]; special: number }>();
    let base = '';
    for (let j = i; j < n && j - i < 6; j++) {
      base += letters[j].ch;
      if (!SYLLABLES.has(base)) continue;
      const vowelStart = i > 0 && /^[aoe]/.test(base);
      if (vowelStart && !lenient) continue;
      const isSpecial = SPECIAL.has(base) || vowelStart;
      // Âm r chỉ đứng cuối chunk và sau một âm tiết khác (儿 hoá) hoặc đứng một mình.
      if (base === 'r' && j !== n - 1) continue;
      const rest = memo[j + 1];
      if (!rest) continue;
      let tone: Tone = 5;
      let raw = '';
      for (let k = i; k <= j; k++) {
        if (letters[k].tone) tone = letters[k].tone as Tone;
        raw += letters[k].raw;
      }
      const syl: MarkedSyl = { base, tone, text: raw.normalize('NFC') };
      for (const [cnt, opt] of rest) {
        const cand = { syls: [syl, ...opt.syls], special: opt.special + (isSpecial ? 1 : 0) };
        const cur = res.get(cnt + 1);
        if (!cur || cand.special < cur.special) res.set(cnt + 1, cand);
      }
    }
    memo[i] = res;
  }
  return memo[0] ?? new Map();
}

/**
 * Cắt pinyin dạng dấu theo một cách tách đã biết (ví dụ lấy từ từ điển): ("gǎnēn", ["gan","en"]) → gǎn | ēn.
 * Bỏ qua ranh giới trong chuỗi nguồn; trả `null` nếu chữ cái không khớp đúng các âm tiết đã cho.
 */
export function alignMarked(input: string, bases: readonly string[]): MarkedSyl[] | null {
  const letters = toLetters(input.trim().split(BOUNDARY).join(''));
  if (!letters || letters.map((l) => l.ch).join('') !== bases.join('')) return null;
  const out: MarkedSyl[] = [];
  let k = 0;
  for (const base of bases) {
    const part = letters.slice(k, k + base.length);
    k += base.length;
    let tone: Tone = 5;
    for (const l of part) if (l.tone) tone = l.tone as Tone;
    out.push({ base, tone, text: part.map((l) => l.raw).join('').normalize('NFC') });
  }
  return out;
}

/** Bỏ dấu thanh và dấu cách để so khớp/tìm kiếm: "Nǚ’ér" → "nver", "ai4 hao4" → "aihao". */
export function toneless(pinyin: string): string {
  return pinyin
    .normalize('NFD')
    .replace(/u\u0308|ü/gi, 'v')
    .replace(/u:/gi, 'v')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[1-5\s'’‘\-·]/g, '')
    .toLowerCase();
}
