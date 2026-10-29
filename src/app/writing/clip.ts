/**
 * Hanzi Writer ghi cả địa chỉ trang vào clip-path của từng nét (url("https://…/?t=…#mask-3")). Trang đổi địa chỉ
 * (history.replaceState) thì mặt nạ không còn khớp và nét vẽ tràn ra ngoài: đổi về dạng tương đối url(#mask-3).
 */
export function relativeClipPaths(root: Element | null) {
  root?.querySelectorAll('[clip-path]').forEach((n) => {
    const v = n.getAttribute('clip-path') ?? '';
    if (v.startsWith('url(#')) return;
    const m = /#([^"')]+)["']?\)\s*$/.exec(v);
    if (m) n.setAttribute('clip-path', `url(#${m[1]})`);
  });
}
