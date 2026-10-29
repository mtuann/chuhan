/**
 * Sao lưu dữ liệu (/toi/sao-luu/): dựng payload, validate file nhập, tên file, nén gzip, nhập gộp và thay thế.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, openDb } from '../../src/lib/db';
import {
  BACKUP_APP,
  BACKUP_TABLES,
  BackupValidationError,
  backupFilename,
  buildExportPayload,
  mergeTables,
  summarize,
  validateBackup,
  type BackupPayload,
  type BackupTables,
} from '../../src/lib/backup';
import { exportBackup, exportBackupBlob, importBackup, isGzipData, readBackupFile } from '../../src/lib/backup-io';

const empty = (): BackupTables => ({ words: [], contexts: [], attempts: [], daily: [], bests: [], notes: [], settings: [], errors: [] });

const sample = (): BackupTables => ({
  ...empty(),
  words: [{ itemId: '你好_ni3hao3', st: 'hoc', at: 1000, src: 'doc', s: '你好', p: 'nǐ hǎo', hv: 'nhĩ hảo', vi: 'xin chào', lv: 1 }],
  contexts: [{ itemId: '你好_ni3hao3', tk: [['你好', 'nǐ hǎo', '你好_ni3hao3'], ['！']], src: 'doc', at: 1000 }],
  attempts: [{ id: 'a1', kind: 'write', at: 2000, itemId: '好', ok: true, durMs: 30_000, data: { grade: 'good' } }],
  daily: [{ day: '2026-10-01', ms: 30_000, typeRounds: 0, typeChars: 0 }],
  bests: [{ id: 'toc-do-1', mode: 'toc-do', level: 1, cpm: 20, chars: 20, words: 10, at: 3000 }],
  notes: [{ itemId: '好', text: 'nữ + tử', updatedAt: 4000 }],
  settings: [{ key: 'knownLevel', value: 2 }],
});

beforeEach(async () => {
  await openDb(`backup-${Math.random()}`);
});

describe('payload, tên file, validate', () => {
  it('payload đúng app, mọi bảng', () => {
    const p = buildExportPayload(sample(), 5);
    expect(p.app).toBe(BACKUP_APP);
    expect(Object.keys(p.tables).sort()).toEqual([...BACKUP_TABLES].sort());
    expect(validateBackup(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('tên file theo ngày', () => {
    expect(backupFilename(new Date(2026, 9, 5))).toBe('chuhan-sao-luu-2026-10-05.json.gz');
    expect(backupFilename(new Date(2026, 9, 5), false)).toBe('chuhan-sao-luu-2026-10-05.json');
  });

  it('từ chối file của app khác, thiếu bảng, dòng sai', () => {
    const p = buildExportPayload(sample()) as unknown as Record<string, unknown>;
    expect(() => validateBackup({ ...p, app: 'hoc-tieng-han' })).toThrow(BackupValidationError);
    const noWords = { ...p, tables: { ...(p.tables as object), words: undefined } };
    expect(() => validateBackup(noWords)).toThrow(/words/);
    const badState = buildExportPayload({ ...sample(), words: [{ ...sample().words[0], st: 'xyz' as 'hoc' }] });
    expect(() => validateBackup(badState)).toThrow(/st/);
  });

  it('tóm tắt: số từ, chữ đã tập, lượt gõ, lần gần nhất', () => {
    expect(summarize(sample())).toEqual({ words: 1, chars: 1, typing: 0, notes: 1, lastAt: 2000 });
  });
});

describe('gộp (thuần)', () => {
  it('giữ bản mới hơn, thêm lượt chưa có, giữ cài đặt của máy', () => {
    const local = sample();
    const file = sample();
    file.words[0] = { ...file.words[0], st: 'biet', at: 9000 };
    file.attempts.push({ id: 'a2', kind: 'type', at: 2500, ok: true });
    file.settings = [{ key: 'knownLevel', value: 5 }, { key: 'docHv', value: false }];
    file.bests[0] = { ...file.bests[0], cpm: 10 };
    const { put, stats } = mergeTables(local, file);
    expect(put.words[0].st).toBe('biet');
    expect(put.attempts.map((a) => a.id)).toEqual(['a2']);
    expect(put.settings).toEqual([{ key: 'docHv', value: false }]);
    expect(put.bests).toEqual([]);
    expect(stats.words).toEqual({ added: 0, updated: 1 });
  });
});

describe('xuất, nhập với IndexedDB', () => {
  async function seed(t: BackupTables) {
    const d = await db();
    for (const name of BACKUP_TABLES) if (t[name].length) await d.table(name).bulkPut(t[name] as unknown[]);
  }

  it('nén rồi đọc lại đúng; nhập gộp hai lần không sinh dòng trùng', async () => {
    await seed(sample());
    const payload = await exportBackup();
    const { blob } = await exportBackupBlob(payload);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(isGzipData(bytes)).toBe(true);
    const back = validateBackup(await readBackupFile(new File([bytes], 'x.json.gz')));
    expect(back.tables.words).toEqual(sample().words);

    await openDb(`backup-${Math.random()}`);
    await importBackup(back);
    await importBackup(back);
    const d = await db();
    expect(await d.words.count()).toBe(1);
    expect(await d.attempts.count()).toBe(1);
    expect((await d.settings.get('knownLevel'))?.value).toBe(2);
  });

  it('thay thế: xoá dữ liệu cũ rồi ghi dữ liệu của file', async () => {
    await seed({ ...empty(), words: [{ ...sample().words[0], itemId: '再见_zai4jian4', s: '再见' }] });
    const file: BackupPayload = buildExportPayload(sample());
    await importBackup(file, 'replace');
    const d = await db();
    expect((await d.words.toArray()).map((w) => w.itemId)).toEqual(['你好_ni3hao3']);
  });

  it('file thiếu tổng hợp theo ngày: dựng lại từ các lượt', async () => {
    await importBackup(buildExportPayload({ ...sample(), daily: [] }));
    expect((await (await db()).daily.toArray()).length).toBe(1);
  });
});
