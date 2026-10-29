/**
 * Ghép đường dẫn với base của site (ví dụ '/chuhan/').
 * Luôn trả về đường dẫn bắt đầu bằng '/', và giữ dấu '/' cuối nếu path có.
 */
export function joinBase(base: string, path = ''): string {
  const b = '/' + base.replace(/^\/+|\/+$/g, '');
  const p = path.replace(/^\/+/, '');
  if (b === '/') return '/' + p;
  return p ? `${b}/${p}` : `${b}/`;
}

/** Đường dẫn trong site hiện tại (dùng trong trang Astro và trong ứng dụng React). */
export function url(path = ''): string {
  return joinBase(import.meta.env.BASE_URL, path);
}

