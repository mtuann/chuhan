/**
 * "Lần luyện gần nhất" của tab Luyện: thanh Tiếp tục (ResumeBar) trên các trang luyện đọc lại để quay lại nhanh.
 * Chỉ lưu nhãn + url (không lưu từng câu/chữ), dạng { label, url, at }.
 */
import { getSetting, setSetting } from '../../lib/settings';

export interface LastPractice {
  /** nhãn tiếng Việt thân thiện, vd. 'Gõ câu · HSK 4' */
  label: string;
  /** đường dẫn đầy đủ (đã gồm base của site), vd. url('go/?che-do=cau') */
  url: string;
  /** thời điểm ghi */
  at: number;
}

/**
 * Ghi lần luyện gần nhất. Cờ "đã ẩn thanh Tiếp tục" chỉ được xóa khi lần luyện thật sự
 * khác lần trước (label/url thay đổi): đổi radio ở màn hình chọn (chưa bấm Bắt đầu),
 * hay gọi ghi trùng, không làm thanh hiện lại.
 */
export async function recordPractice(p: { label: string; url: string }): Promise<void> {
  try {
    const prev = await getSetting('lastPractice');
    const row: LastPractice = { ...p, at: Date.now() };
    await setSetting('lastPractice', row);
    if (!prev || prev.label !== p.label || prev.url !== p.url) {
      await setSetting('lastPracticeDismissed', false);
    }
  } catch {
    // lưu thất bại (ví dụ IndexedDB bị chặn): bỏ qua, trang vẫn chạy bình thường
  }
}
