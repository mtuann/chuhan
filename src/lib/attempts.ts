/**
 * Ghi lượt luyện (bảng `attempts`: tập viết, gõ): điểm chung cho mọi component.
 * Không bao giờ ném lỗi, không chặn giao diện (fire-and-forget được: `void logAttempt(...)`).
 *
 * Bảng `attempts` append-only nên được CẮT sau mỗi lần ghi: giữ ATTEMPTS_CAP lượt gần nhất (không tính lượt Viết).
 * Thứ gì cần giữ lâu dài thì không đọc từ lượt cũ:
 * - thời gian luyện mỗi ngày, tổng lượt, tổng chữ gõ: bảng `daily`, cộng dồn ngay khi ghi lượt;
 * - trạng thái chữ viết tay (lượt `write`): KHÔNG bao giờ bị cắt (mỗi chữ vài lượt, 1.200 chữ);
 * - kỷ lục gõ: bảng `bests`.
 * Các thống kê còn đọc `attempts` chỉ cần lượt gần đây (lỗi gõ ≤60 lượt).
 */
import { addContribution, attemptContribution, db, type AppDB, type AttemptRow, type DailyRow } from './db';
import { uuidv7 } from './ids';
import { perMinute, type TypingError } from './typing';

/** Số lượt (không tính lượt Viết) giữ lại: ~vài tháng luyện nặng; mỗi dòng chỉ vài trăm byte. */
export const ATTEMPTS_CAP = 5000;

export interface AttemptInput {
  /**
   * id tự đặt thay vì UUIDv7 mới. Dùng khi muốn ghi đè cùng một dòng (ngữ nghĩa `put`),
   * ví dụ lượt gõ theo đoạn văn cập nhật liên tục trong một phiên.
   */
  id?: string;
  kind: AttemptRow['kind'];
  /** id từ, chữ hoặc âm tiết được hỏi */
  itemId?: string;
  ok: boolean;
  durMs?: number;
  data?: Record<string, unknown>;
}

/** Cắt bảng `attempts`: giữ ATTEMPTS_CAP lượt gần nhất (theo `at`), không xoá lượt Viết. Chạy trong transaction của lần ghi. */
export async function pruneAttempts(t: AppDB, cap = ATTEMPTS_CAP): Promise<void> {
  const n = (await t.attempts.count()) - (await t.attempts.where('kind').equals('write').count());
  if (n > cap) {
    const old = await t.attempts
      .orderBy('at')
      .filter((r) => r.kind !== 'write')
      .limit(n - cap)
      .primaryKeys();
    await t.attempts.bulkDelete(old);
  }
}

/**
 * Ghi các lượt và cộng vào bảng `daily` (lượt ghi đè cùng id thì trừ phần cũ trước). Chạy trong transaction
 * ('rw', attempts, daily).
 */
async function putAttemptsTx(t: AppDB, rows: AttemptRow[]): Promise<void> {
  const old = await t.attempts.bulkGet(rows.map((r) => r.id));
  const days = new Map<string, DailyRow>();
  const touched = new Set([...rows.map((r) => attemptContribution(r).day), ...old.flatMap((o) => (o ? [attemptContribution(o).day] : []))]);
  for (const r of await t.daily.bulkGet([...touched])) if (r) days.set(r.day, r);
  old.forEach((o) => o && addContribution(days, attemptContribution(o), -1));
  for (const r of rows) addContribution(days, attemptContribution(r));
  await t.attempts.bulkPut(rows);
  await t.daily.bulkPut([...days.values()]);
}

/**
 * Ghi một lượt làm rồi cắt bảng, trong cùng một transaction. Không bao giờ ném lỗi.
 * Dùng `put` (ghi đè khi trùng id) để hỗ trợ lượt cập nhật liên tục qua `id` tự đặt.
 */
export function logAttempt(input: AttemptInput): Promise<void> {
  return db()
    .then((t) =>
      t.transaction('rw', t.attempts, t.daily, async () => {
        const { id, ...rest } = input;
        await putAttemptsTx(t, [{ ...rest, id: id ?? uuidv7(), at: Date.now() }]);
        await pruneAttempts(t);
      }),
    )
    .catch(() => undefined);
}

/** Ghi nhiều lượt làm rồi cắt bảng, trong cùng một transaction. Không bao giờ ném lỗi. */
export function logAttempts(inputs: AttemptInput[]): Promise<void> {
  if (!inputs.length) return Promise.resolve();
  return db()
    .then((t) =>
      t.transaction('rw', t.attempts, t.daily, async () => {
        await putAttemptsTx(
          t,
          inputs.map(({ id, ...rest }) => ({ ...rest, id: id ?? uuidv7(), at: Date.now() })),
        );
        await pruneAttempts(t);
      }),
    )
    .catch(() => undefined);
}

/** Tối thiểu cần để dựng bản ghi lượt luyện gõ (khớp `DrillResult` của app/typing/Drill). */
export interface DrillResultLike {
  items: number;
  /** số chữ đúng / tổng số chữ (lần chấm đầu) */
  right: number;
  chars: number;
  ms: number;
  errors: TypingError[];
}

/** Bản ghi lượt luyện gõ (kind `type`), giữ nguyên công thức cũ: ok khi đúng hết chữ, cpm từ chữ đúng. */
export function buildDrillAttempt(result: DrillResultLike, mode: string): AttemptInput {
  return {
    kind: 'type',
    itemId: mode,
    ok: result.right === result.chars,
    durMs: result.ms,
    data: {
      mode,
      items: result.items,
      chars: result.chars,
      right: result.right,
      cpm: perMinute(result.right, result.ms),
      errors: result.errors,
    },
  };
}
