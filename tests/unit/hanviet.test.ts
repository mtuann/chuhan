import { describe, expect, it } from 'vitest';
import { TONE_RULES, TONE_RULE_IDS, finalHint, hvToneOf, isChecked, isSonorantInitial, toneHint, toneRuleOf } from '../../src/lib/hanviet';

describe('nhóm quy luật Hán Việt → thanh', () => {
  it('nhận thanh và phụ âm đầu', () => {
    expect(hvToneOf('hảo')).toBe('hoi');
    expect(hvToneOf('học')).toBe('nang');
    expect(hvToneOf('trung')).toBe('ngang');
    expect(isSonorantInitial('minh')).toBe(true);
    expect(isSonorantInitial('dân')).toBe(true);
    expect(isSonorantInitial('đại')).toBe(false); // đ không phải phụ âm vang
    expect(isSonorantInitial('gia')).toBe(false);
    expect(isSonorantInitial('an')).toBe(false);
    expect(isChecked('học')).toBe(true);
    expect(isChecked('bách')).toBe(true);
    expect(isChecked('hảo')).toBe(false);
  });
  it('xếp nhóm như bảng đo', () => {
    expect(toneRuleOf('trung')).toBe('ngang-khac'); // 中 zhōng
    expect(toneRuleOf('minh')).toBe('ngang-vang'); // 明 míng
    expect(toneRuleOf('hoàng')).toBe('huyen'); // 黄 huáng
    expect(toneRuleOf('hảo')).toBe('hoi'); // 好 hǎo
    expect(toneRuleOf('mã')).toBe('nga-vang'); // 马 mǎ
    expect(toneRuleOf('đãi')).toBe('nga-khac'); // 待 dài
    expect(toneRuleOf('ái')).toBe('sac'); // 爱 ài
    expect(toneRuleOf('đại')).toBe('nang'); // 大 dà
    expect(toneRuleOf('nhật')).toBe('nang-tac-vang'); // 日 rì
    expect(toneRuleOf('học')).toBe('nang-tac-khac'); // 学 xué
    expect(toneRuleOf('bách')).toBe('sac-tac'); // 百 bǎi
  });
  it('gợi ý và kiểm tra theo thanh thật', () => {
    expect(toneHint('học', 2)).toMatchObject({ fits: true, rule: { predict: 2 } });
    expect(toneHint('đại', 4).fits).toBe(true);
    expect(toneHint('bách', 3).fits).toBeUndefined(); // nhóm không đoán được
  });
  it('bảng đo có đủ nhóm, số liệu hợp lý', () => {
    for (const id of TONE_RULE_IDS) {
      const r = TONE_RULES[id];
      expect(r.n).toBeGreaterThan(30);
      expect(r.accuracy).toBeGreaterThan(30);
      expect(r.accuracy).toBeLessThanOrEqual(100);
      if (r.predict) expect(r.accuracy).toBeGreaterThan(60);
    }
  });
  it('mẹo vần cuối', () => {
    expect(finalHint('tâm')).toBe('n');
    expect(finalHint('văn')).toBe('n');
    expect(finalHint('minh')).toBe('ng');
    expect(finalHint('trung')).toBe('ng');
    expect(finalHint('hảo')).toBeNull();
  });
});
