/**
 * Kỷ lục gõ thử thách (bảng `bests`): một dòng cho mỗi (chế độ, cấp), id `toc-do-<cấp>`.
 * Bảng này không bao giờ bị cắt như `attempts`, nên kỷ lục không bị mất thầm lặng.
 * SpeedTest ghi song song: `logAttempt(...)` (attempts, cho thống kê lượt gần đây) +
 * `recordBest(...)` (bests, cho kỷ lục).
 */
import { db } from './db';

/**
 * Ghi kỷ lục: true khi là kỷ lục mới (chưa có hoặc cpm cao hơn), false khi không vượt.
 * Không bao giờ ném lỗi (fire-and-forget được: `void recordBest(...)`).
 */
export async function recordBest(input: {
  mode: string;
  level: number;
  cpm: number;
  chars: number;
  words: number;
}): Promise<boolean> {
  const id = `${input.mode}-${input.level}`;
  try {
    return await db().then((t) =>
      t.transaction('rw', t.bests, async () => {
        const cur = await t.bests.get(id);
        if (!cur || input.cpm > cur.cpm) {
          await t.bests.put({ ...input, id, at: Date.now() });
          return true;
        }
        return false;
      }),
    );
  } catch {
    return false;
  }
}

