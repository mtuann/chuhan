/** Mã tệp từ điển của một chuỗi: byte thấp của mã Unicode chữ đầu, ví dụ 爱 (U+7231) → "31". Không phụ thuộc zod để app dùng được. */
export function dictShardOf(text: string): string {
  const cp = text.codePointAt(0) ?? 0;
  return (cp & 0xff).toString(16).padStart(2, '0');
}
