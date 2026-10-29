/**
 * Đường dẫn dữ liệu nét chữ (hanzi-writer-data). Thư mục theo phiên bản nên tên tệp không cần băm:
 * đổi phiên bản → đổi thư mục → cache cũ không còn được dùng.
 * Pipeline dữ liệu kiểm tra hằng số này khớp với phiên bản trong sources.lock.json.
 */
export const STROKES_VERSION = '2.0.1';

/** Đường dẫn tương đối trong thư mục data/: 好 → `apl/strokes/2.0.1/u597d.json`. */
export function strokePath(char: string): string {
  const cp = char.codePointAt(0);
  if (cp === undefined) throw new Error('strokePath: chuỗi rỗng');
  return `apl/strokes/${STROKES_VERSION}/u${cp.toString(16)}.json`;
}
