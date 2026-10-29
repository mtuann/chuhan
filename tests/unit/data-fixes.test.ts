import { describe, expect, it } from 'vitest';
import type { WordRec } from '../../src/schema/data';
import { Issues } from '../../scripts/data/build';
import { applyDataFixes, loadDataFixes } from '../../scripts/data/fixes';

const word = (over: Partial<WordRec> & { id: string; s: string }): WordRec => ({ p: 'p', lv: {}, ...over });

describe('ghi đè sửa lỗi dữ liệu (content/*-fixes.yaml)', () => {
  it('đọc được hai file fixes trong content/', async () => {
    const fixes = await loadDataFixes();
    expect(fixes.hanviet['không_tồn_tại_xx1']).toBeUndefined();
    expect(fixes.hanviet['容易_rong2yi4']).toEqual(['dung', 'dị']);
    expect(fixes.hanviet['好歹_hao3dai3']).toEqual(['hảo', 'đãi']);
    expect(fixes.gloss['好心人']?.drop).toContain('người Samaritan tốt');
    expect(fixes.gloss['好运']?.vi).toEqual(['vận may']);
  });

  it('ghi đè Hán Việt theo id từ, xoá cờ gần đúng', () => {
    const issues = new Issues();
    const w = word({ id: '容易_rong2yi4', s: '容易', hv: [['dung'], ['dịch']], hva: [1] });
    applyDataFixes([w], { hanviet: { '容易_rong2yi4': ['dung', 'dị'] }, gloss: {} }, issues);
    expect(w.hv).toEqual([['dung'], ['dị']]);
    expect(w.hva).toBeUndefined();
    expect(issues.list).toHaveLength(0);
  });

  it('sai số chữ → error; không thấy từ → warn', () => {
    const issues = new Issues();
    const w = word({ id: 'ab_ab1cd2', s: 'ab' });
    applyDataFixes([w], { hanviet: { 'ab_ab1cd2': ['một'], 'xx_yy1': ['hai'] }, gloss: {} }, issues);
    expect(issues.list.some((i) => i.kind === 'error:fix-hanviet-sai-so-chu')).toBe(true);
    expect(issues.list.some((i) => i.kind === 'warn:fix-hanviet-khong-thay-tu')).toBe(true);
    expect(w.hv).toBeUndefined();
  });

  it('bỏ nghĩa sai khỏi vi; thay toàn bộ vi', () => {
    const issues = new Issues();
    const a = word({ id: '好心人_hao3xin1ren2', s: '好心人', vi: ['người tốt', 'người Samaritan tốt'] });
    const b = word({ id: '好运_hao3yun4', s: '好运', vi: ['chúc may mắn', 'may mắn'] });
    applyDataFixes(
      [a, b],
      { hanviet: {}, gloss: { '好心人': { drop: ['người Samaritan tốt'] }, '好运': { vi: ['vận may'] } } },
      issues,
    );
    expect(a.vi).toEqual(['người tốt']);
    expect(b.vi).toEqual(['vận may']);
    expect(issues.list).toHaveLength(0);
  });
});
