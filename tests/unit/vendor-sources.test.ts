/**
 * Bản lưu nguồn trong repo (vendor/sources) phải đúng từng byte với tệp đã ghim trong sources.lock.json,
 * vì CI dùng nó khi repo gốc không còn tải được.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { VENDOR_DIR, sha256, vendorPath, type Lock } from '../../scripts/data/sources';

const lock = JSON.parse(readFileSync('sources.lock.json', 'utf8')) as Lock;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('bản lưu nguồn dữ liệu trong repo', () => {
  const vendored = walk(VENDOR_DIR).filter((f) => f.endsWith('.gz'));

  it('có bản lưu cho các nguồn mà repo gốc đã mất', () => {
    expect(vendored.length).toBeGreaterThanOrEqual(3);
  });

  it('mỗi tệp khớp đúng một mục trong lock và đúng sha256, số byte', () => {
    for (const f of vendored) {
      const hit = lock.sources.flatMap((s) => Object.values(s.files ?? {}).map((e) => ({ s, e }))).find(({ s, e }) => vendorPath(s, e.path) === f);
      expect(hit, f).toBeTruthy();
      const buf = gunzipSync(readFileSync(f));
      expect(sha256(buf), f).toBe(hit!.e.sha256);
      if (hit!.e.bytes) expect(buf.length, f).toBe(hit!.e.bytes);
    }
  });
});
