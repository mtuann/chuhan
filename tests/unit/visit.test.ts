import { describe, expect, it } from 'vitest';
import { VISIT_BASE, VISIT_HOST, markCounted, shouldCount, type VisitEnv } from '../../src/lib/visit';

function store(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}
const env = (o: Partial<VisitEnv> = {}): VisitEnv => ({ host: VISIT_HOST, base: VISIT_BASE, gpc: false, dnt: false, session: store(), ...o });

describe('đếm lượt truy cập', () => {
  it('chỉ đếm site thật, mỗi phiên một lần (tính từ lúc thật sự gửi)', () => {
    const session = store();
    expect(shouldCount(env({ session }))).toBe(true);
    // chưa gửi (rời trang trước khi trình duyệt rảnh): trang sau vẫn đếm
    expect(shouldCount(env({ session }))).toBe(true);
    markCounted(session);
    expect(shouldCount(env({ session }))).toBe(false);
    expect(shouldCount(env({ host: '127.0.0.1' }))).toBe(false);
    expect(shouldCount(env({ host: 'localhost' }))).toBe(false);
    expect(shouldCount(env({ base: '/khac/' }))).toBe(false);
  });

  it('không đếm khi trình duyệt bật Global Privacy Control hoặc Do Not Track', () => {
    expect(shouldCount(env({ gpc: true }))).toBe(false);
    expect(shouldCount(env({ dnt: true }))).toBe(false);
  });

  it('bộ nhớ phiên bị chặn: vẫn đếm (theo từng lần mở trang)', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(shouldCount(env({ session: broken }))).toBe(true);
    expect(shouldCount(env({ session: null }))).toBe(true);
    expect(() => markCounted(broken)).not.toThrow();
  });
});
