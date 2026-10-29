/**
 * Dùng chung cho trang Gõ chữ (/go/): cách ra đề + ô chọn chấm dấu câu.
 * Nhỏ, nạp cùng trang đầu; phần luyện nặng (Drill) tách chunk riêng, chỉ tải khi vào chế độ.
 */

/** Cách ra đề: nhìn chữ, nghe, nhìn nghĩa (từ), nhìn pinyin (câu). */
export type PromptKind = 'chu' | 'nghe' | 'nghia' | 'pinyin';
export const PROMPT_VI: Record<PromptKind, string> = { chu: 'Nhìn chữ', nghe: 'Nghe', nghia: 'Nhìn nghĩa', pinyin: 'Nhìn pinyin' };

/** Bấm nút không lấy mất con trỏ khỏi ô gõ (bàn phím điện thoại không bị đóng). */
export const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

/** Ô chọn chấm cả dấu câu (bài gõ câu). */
export function PunctToggle({ punct, setPunct }: { punct: boolean; setPunct: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm" onMouseDown={keepFocus}>
      <input type="checkbox" className="size-5" checked={punct} onChange={(e) => setPunct(e.target.checked)} />
      Chấm cả dấu câu (，、。？！：“”…)
    </label>
  );
}
