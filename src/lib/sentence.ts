/** Câu dạng token (câu gặp từ khi đọc): chữ viết liền, gom token để xuống dòng đúng kiểu chữ Hán. */
import type { Token } from '../schema/data';

/** Câu viết liền (để hiện và đọc bằng giọng máy). */
export const sentenceText = (s: { tk: readonly Token[] }) => s.tk.map((t) => t[0]).join('');

const OPENING = /^[“‘（《]/;

/**
 * Gom token để xuống dòng đúng kiểu chữ Hán: dấu câu đóng (，。！？…) dính vào từ đứng trước, dấu mở (“《) dính vào
 * từ đứng sau, nên không có dòng nào bắt đầu bằng dấu phẩy, dấu chấm.
 */
export function groupTokens(tk: readonly Token[]): number[][] {
  const groups: number[][] = [];
  let open: number[] = [];
  tk.forEach((t, i) => {
    if (t.length === 1 && OPENING.test(t[0])) open.push(i);
    else if (t.length === 1 && groups.length && !open.length) groups[groups.length - 1].push(i);
    else {
      groups.push([...open, i]);
      open = [];
    }
  });
  if (open.length) groups.push(open);
  return groups;
}
