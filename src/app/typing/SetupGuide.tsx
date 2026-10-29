/** Hướng dẫn cài bộ gõ tiếng Trung trên máy và tắt bộ gõ tiếng Việt khi gõ pinyin. */
import type { ReactNode } from 'react';

const STEPS: { os: string; steps: ReactNode; sw: string }[] = [
  {
    os: 'Windows 10, 11',
    steps: (
      <>
        Cài đặt (Settings) → Thời gian &amp; ngôn ngữ → Ngôn ngữ &amp; khu vực → Thêm ngôn ngữ → chọn <b>Tiếng Trung (Giản thể, Trung Quốc)</b>. Bộ gõ
        Microsoft Pinyin được cài kèm.
      </>
    ),
    sw: 'Đổi bộ gõ: Windows + Space. Trong Microsoft Pinyin, phím Shift chuyển giữa chữ Trung và chữ Latinh.',
  },
  {
    os: 'macOS',
    steps: (
      <>
        Cài đặt hệ thống → Bàn phím → Nguồn đầu vào (Input Sources) → Sửa… → dấu + → <b>Tiếng Trung, Giản thể</b> → <b>Bính âm – Giản thể</b> (Pinyin –
        Simplified).
      </>
    ),
    sw: 'Đổi bộ gõ: Control + Space hoặc phím 🌐 (fn).',
  },
  {
    os: 'iPhone, iPad',
    steps: (
      <>
        Cài đặt → Cài đặt chung → Bàn phím → Bàn phím → Thêm bàn phím mới → <b>Tiếng Trung (Giản thể)</b> → <b>Bính âm – QWERTY</b>.
      </>
    ),
    sw: 'Đổi bàn phím: phím quả địa cầu 🌐.',
  },
  {
    os: 'Android (Gboard)',
    steps: (
      <>
        Mở cài đặt Gboard → Ngôn ngữ → Thêm bàn phím → <b>中文（简体）</b> (Tiếng Trung giản thể) → <b>Bính âm</b> (Pinyin), chọn kiểu QWERTY.
      </>
    ),
    sw: 'Đổi bàn phím: phím quả địa cầu hoặc giữ phím cách.',
  },
];

export function SetupGuide() {
  return (
    <section aria-labelledby="cai-bo-go" className="rounded-2xl border border-line p-4">
      <h2 id="cai-bo-go" className="font-semibold">
        Cài bộ gõ tiếng Trung trên máy của bạn
      </h2>
      <p className="mt-1 text-sm text-muted">
        Bộ gõ của máy cũng gõ pinyin rồi chọn chữ như ô gõ ở trên. Dùng nó ngay trong các bài luyện ở đây cũng được: chữ Hán gõ vào được nhận luôn.
      </p>
      <div className="mt-3 space-y-2">
        {STEPS.map((s) => (
          <details key={s.os} className="rounded-xl border border-line bg-card px-3 py-2 text-sm">
            <summary className="min-h-9 cursor-pointer py-1 font-semibold">{s.os}</summary>
            <p className="mt-1">{s.steps}</p>
            <p className="mt-1 text-muted">{s.sw}</p>
          </details>
        ))}
        <details className="rounded-xl border border-line bg-card px-3 py-2 text-sm">
          <summary className="min-h-9 cursor-pointer py-1 font-semibold">Đang dùng Unikey, EVKey (Telex, VNI)</summary>
          <p className="mt-1">
            Bộ gõ tiếng Việt biến s, f, r, x, j thành dấu và dd thành đ, nên gõ “xuexi” sẽ ra chữ Việt có dấu. Trước khi gõ pinyin, chuyển sang chế độ
            tiếng Anh: bấm vào biểu tượng V ở khay hệ thống để thành E, hoặc dùng phím tắt chuyển Việt–Anh (Unikey mặc định là Ctrl + Shift). Trên macOS,
            iPhone, Android: đổi sang bàn phím tiếng Anh hoặc bàn phím tiếng Trung.
          </p>
        </details>
      </div>
    </section>
  );
}
