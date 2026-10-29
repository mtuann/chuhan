/**
 * Ghi lượt làm bài chung (src/lib/attempts.ts), rút từ ReviewSession.tsx và Drill.tsx:
 * logRegrade, logToneErrors (ReviewSession) và lưu lượt luyện ở DrillSummary (Drill).
 * W5: cắt bảng `attempts` — mỗi lần ghi giữ ATTEMPTS_CAP dòng gần nhất, trong cùng transaction.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, openDb } from '../../src/lib/db';
import { ATTEMPTS_CAP, buildDrillAttempt, logAttempt, logAttempts, type AttemptInput } from '../../src/lib/attempts';
import type { AttemptRow } from '../../src/lib/db';

beforeEach(async () => {
  await openDb(`test:attempts-${Date.now()}-${Math.random()}`);
});

/** Đợi ghi fire-and-forget hoàn tất rồi đọc bảng. */
async function readAttempts(): Promise<AttemptRow[]> {
  const t = await db();
  for (let i = 0; i < 200; i++) {
    const rows = await t.attempts.toArray();
    if (rows.length) return rows;
    await new Promise((r) => setTimeout(r, 5));
  }
  return t.attempts.toArray();
}

describe('logAttempt', () => {
  it('ghi một lượt chấm lại chữ (kind check, như WriteCard onRegrade)', async () => {
    logAttempt({ kind: 'write', itemId: '好', ok: false, data: { chamLai: true, mistakes: 1, strokes: 6 } });
    const rows = await readAttempts();
    expect(rows).toHaveLength(1);
    const [r] = rows;
    expect(r.kind).toBe('write');
    expect(r.itemId).toBe('好');
    expect(r.ok).toBe(false);
    expect(r.data).toEqual({ chamLai: true, mistakes: 1, strokes: 6 });
    expect(typeof r.id).toBe('string');
    expect(r.at).toBeGreaterThan(0);
  });

  it('không ném lỗi ra ngoài (fire-and-forget)', () => {
    expect(() => logAttempt({ kind: 'write', ok: false })).not.toThrow();
  });
});

describe('logAttempts', () => {
  it('ghi hàng loạt', async () => {
    const inputs: AttemptInput[] = [1, 2].map((chosen) => ({
      kind: 'write',
      itemId: '你_ni3',
      ok: false,
      data: { syllable: 'nǐ', expected: 3, chosen },
    }));
    logAttempts(inputs);
    const t = await db();
    for (let i = 0; i < 200; i++) {
      if ((await t.attempts.count()) === 2) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const rows = await t.attempts.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => (r.data as { chosen: number }).chosen).sort()).toEqual([1, 2]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it('mảng rỗng thì không ghi gì và không lỗi', async () => {
    expect(() => logAttempts([])).not.toThrow();
    expect(await (await db()).attempts.count()).toBe(0);
  });
});

describe('buildDrillAttempt', () => {
  it('dựng đúng bản ghi lượt luyện gõ (kind type)', () => {
    const a = buildDrillAttempt({ items: 10, right: 18, chars: 20, ms: 120_000, errors: [{ kind: 'dong-am', t: '在', got: '再' }] }, 'go-tu');
    expect(a.kind).toBe('type');
    expect(a.itemId).toBe('go-tu');
    expect(a.ok).toBe(false);
    expect(a.durMs).toBe(120_000);
    expect(a.data).toMatchObject({ mode: 'go-tu', items: 10, chars: 20, right: 18 });
    expect(a.data?.cpm).toBe(Math.round((18 * 60_000) / 120_000));
    expect(a.data?.errors).toEqual([{ kind: 'dong-am', t: '在', got: '再' }]);
  });

  it('ok khi đúng hết chữ', () => {
    const a = buildDrillAttempt({ items: 5, right: 10, chars: 10, ms: 60_000, errors: [] }, 'go-cau');
    expect(a.ok).toBe(true);
    expect(a.data?.cpm).toBe(Math.round((10 * 60_000) / 60_000));
  });
});

describe('cắt bảng attempts (W5)', () => {
  it('chưa vượt cap → không xoá gì', async () => {
    await logAttempts([
      { kind: 'type', ok: true },
      { kind: 'type', ok: false },
    ]);
    expect(await (await db()).attempts.count()).toBe(2);
  });

  it('vượt cap → chỉ giữ ATTEMPTS_CAP dòng gần nhất (theo at)', async () => {
    const t = await db();
    // seed cũ hơn hẳn "bây giờ" để lượt ghi mới chắc chắn là mới nhất
    const t0 = Date.now() - 1_000_000;
    await t.attempts.bulkAdd(
      Array.from({ length: ATTEMPTS_CAP + 100 }, (_, i) => ({
        id: `seed-${i}`,
        kind: 'type' as const,
        at: t0 + i,
        ok: true,
      })),
    );
    await logAttempt({ kind: 'type', ok: true });
    const rows = await (await db()).attempts.orderBy('at').toArray();
    expect(rows).toHaveLength(ATTEMPTS_CAP);
    // 101 dòng seed cũ nhất (seed-0..seed-100) bị xoá, lượt vừa ghi được giữ
    expect(rows[0].id).toBe('seed-101');
    // lượt vừa ghi (mới nhất) còn lại
    expect(rows.at(-1)!.at).toBeGreaterThan(t0 + ATTEMPTS_CAP + 100);
  });

  it('logAttempts: ghi hàng loạt rồi cắt về đúng cap', async () => {
    await logAttempts(
      Array.from({ length: ATTEMPTS_CAP + 50 }, (_, i) => ({
        kind: 'type' as const,
        itemId: `w${i}`,
        ok: i % 2 === 0,
      })),
    );
    expect(await (await db()).attempts.count()).toBe(ATTEMPTS_CAP);
  });

  it('id tự đặt: ghi đè cùng dòng (put) thay vì thêm dòng mới', async () => {
    await logAttempt({ id: 'sess-1', kind: 'type', ok: false, data: { n: 1 } });
    await logAttempt({ id: 'sess-1', kind: 'type', ok: true, data: { n: 2 } });
    const t = await db();
    expect(await t.attempts.count()).toBe(1);
    expect((await t.attempts.get('sess-1'))?.data).toEqual({ n: 2 });
  });

  it('ghi + cắt trong cùng transaction: không mất lượt vừa ghi khi cắt', async () => {
    const t = await db();
    const t0 = Date.now() - 1_000_000;
    await t.attempts.bulkAdd(
      Array.from({ length: ATTEMPTS_CAP }, (_, i) => ({
        id: `seed-${i}`,
        kind: 'type' as const,
        at: t0 + i,
        ok: true,
      })),
    );
    // đúng cap: ghi thêm 1 → cắt đúng 1 dòng cũ nhất, lượt mới phải còn
    await logAttempt({ kind: 'type', itemId: 'bai-1', ok: true });
    const rows = await (await db()).attempts.orderBy('at').toArray();
    expect(rows).toHaveLength(ATTEMPTS_CAP);
    expect(rows[0].id).toBe('seed-1');
    expect(rows.some((r) => r.itemId === 'bai-1')).toBe(true);
  });
});

describe('cắt bảng attempts không làm mất lịch sử (bảng daily)', () => {
  const DAY = 24 * 3600_000;
  /** 30 ngày, mỗi ngày một lượt Viết 10 phút (giả lập ghi qua logAttempt ở từng ngày). */
  async function thirtyDaysOfWriting(t: Awaited<ReturnType<typeof db>>, now: number) {
    const rows: AttemptRow[] = [];
    for (let k = 29; k >= 0; k--) rows.push({ id: `w${k}`, kind: 'write', itemId: '好', ok: true, durMs: 10 * 60_000, at: now - k * DAY, data: { grade: 'good' } });
    const { dailyFromAttempts } = await import('../../src/lib/db');
    await t.attempts.bulkPut(rows);
    await t.daily.bulkPut(dailyFromAttempts(rows));
  }

  it('30 ngày tập viết và trạng thái chữ viết không đổi sau khi cắt bởi 5.000 lượt gõ khác', async () => {
    const now = Date.now();
    const t = await db();
    await thirtyDaysOfWriting(t, now);
    // 5.000 lượt gõ mới hơn (ghi hàng loạt qua API, có cắt)
    const typing: AttemptInput[] = Array.from({ length: ATTEMPTS_CAP + 10 }, (_, i) => ({ kind: 'type', itemId: `tu${i}`, ok: true, durMs: 1000 }));
    await logAttempts(typing);
    expect(await t.attempts.where('kind').equals('type').count()).toBe(ATTEMPTS_CAP);
    // lượt Viết không bị cắt; tổng hợp theo ngày còn đủ 30 ngày
    expect(await t.attempts.where('kind').equals('write').count()).toBe(30);
    expect((await t.daily.toArray()).filter((d) => d.ms > 0).length).toBeGreaterThanOrEqual(30);
  });

  it('cộng thời gian và tổng chữ gõ vào daily; ghi đè cùng id thì không cộng hai lần', async () => {
    const t = await db();
    await logAttempt({ kind: 'type', itemId: 'doan', ok: true, durMs: 60_000, data: { mode: 'doan', right: 10, chars: 12 } });
    await logAttempt({ id: 'p1', kind: 'type', itemId: 'doan', ok: false, durMs: 30_000, data: { mode: 'doan', right: 5 } });
    await logAttempt({ id: 'p1', kind: 'type', itemId: 'doan', ok: true, durMs: 90_000, data: { mode: 'doan', right: 20 } });
    const days = await t.daily.toArray();
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ ms: 150_000, typeRounds: 2, typeChars: 30 });
    // lượt dài hơn 5 phút chỉ tính 5 phút (như streak)
    await logAttempt({ kind: 'type', ok: true, durMs: 60 * 60_000 });
    expect((await t.daily.toArray())[0].ms).toBe(150_000 + 5 * 60_000);
    // cắt lượt cũ không đổi daily
    await logAttempts(Array.from({ length: ATTEMPTS_CAP }, () => ({ kind: 'type' as const, ok: false })));
    expect((await t.attempts.toArray()).filter((r) => r.itemId === 'doan')).toHaveLength(0);
    expect((await t.daily.toArray())[0].typeChars).toBe(30);
  });
});
