/** UUIDv7: 48 bit thời điểm (ms) + ngẫu nhiên, nên sắp theo id cũng gần đúng thứ tự thời gian. */
function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

let lastMs = -1;
let seq = 0;

/** UUIDv7 (RFC 9562). Cùng một ms thì tăng dần nhờ bộ đếm 12 bit, giữ đúng thứ tự tạo. */
export function uuidv7(now = Date.now()): string {
  if (now === lastMs) seq = (seq + 1) & 0xfff;
  else {
    lastMs = now;
    seq = 0;
  }
  const b = randomBytes(16);
  const ms = BigInt(now);
  for (let i = 0; i < 6; i++) b[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = 0x70 | ((seq >> 8) & 0x0f);
  b[7] = seq & 0xff;
  b[8] = 0x80 | (b[8] & 0x3f);
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
