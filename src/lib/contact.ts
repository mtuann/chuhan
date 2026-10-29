/**
 * Góp ý và ủng hộ, dùng chung cho trang Giới thiệu và tab Tôi: tài khoản nhận ủng hộ, ảnh mã VietQR, email góp ý.
 * Email lưu dạng base64 và chỉ giải mã lúc chạy (`wireContact`), để máy quét thư rác đọc HTML, JS không thấy địa chỉ.
 */
export const DONATE = { name: 'NGUYEN MINH TUAN', bank: 'Techcombank', number: '7979 3979 7979' } as const;
/** Đường dẫn ảnh mã VietQR trong site (ghép với base bằng `url`). */
export const DONATE_QR = 'img/ung-ho-vietqr.png';
export const DONATE_QR_ALT = `Mã VietQR chuyển khoản ${DONATE.bank}, chủ tài khoản ${DONATE.name}, số tài khoản ${DONATE.number}`;
const EMAIL_B64 = 'dmlzaGM2QGdtYWlsLmNvbQ==';

/**
 * Gắn email vào các liên kết `a[data-email]` (`data-email="text"` thì hiện cả địa chỉ) và cho các nút
 * `button[data-copy]` chép vào bộ nhớ tạm (`data-copy="email"` là địa chỉ email, còn lại chép đúng giá trị).
 */
export function wireContact(root: ParentNode = document): void {
  const addr = atob(EMAIL_B64);
  const mailto = `mailto:${addr}?subject=${encodeURIComponent('[Chữ Hán] Góp ý')}`;
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a[data-email]')) {
    a.href = mailto;
    if (a.dataset.email === 'text') a.textContent = addr;
  }
  for (const b of root.querySelectorAll<HTMLButtonElement>('button[data-copy]')) {
    const label = b.textContent;
    b.addEventListener('click', () => {
      const v = b.dataset.copy === 'email' ? addr : (b.dataset.copy ?? '');
      void navigator.clipboard
        ?.writeText(v)
        .then(() => {
          b.textContent = '✓ Đã chép';
          setTimeout(() => (b.textContent = label), 2000);
        })
        .catch(() => undefined);
    });
  }
}
