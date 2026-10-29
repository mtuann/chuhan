/**
 * Cài đặt: giá trị mặc định trong registry, lưu rồi đọc lại; pickVoice ưu tiên giọng đã lưu rồi mới fallback giọng
 * xếp hạng cao nhất.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../../src/lib/db';
import { SETTING_DEFAULTS, getSetting, setSetting } from '../../src/lib/settings';
import { pickVoice, type VoiceLike } from '../../src/lib/audio';

describe('cài đặt', () => {
  beforeEach(async () => {
    await openDb(`test-${Math.random()}`);
  });

  it('chưa lưu gì: đúng giá trị mặc định', async () => {
    expect(await getSetting('knownLevel')).toBe(0);
    expect(await getSetting('docPinyin')).toBe('new');
    expect(await getSetting('docHv')).toBe(true);
    expect(await getSetting('voiceURI')).toBe('');
  });

  it('lưu rồi đọc lại đúng; mặc định dạng mảng không bị làm bẩn', async () => {
    await setSetting('knownLevel', 3);
    expect(await getSetting('knownLevel')).toBe(3);
    const h = await getSetting('docHistory');
    h.push({ text: 'x', at: 1 });
    expect(SETTING_DEFAULTS.docHistory).toEqual([]);
  });
});

const voice = (over: Partial<VoiceLike>): VoiceLike => ({
  name: 'Test',
  lang: 'zh-CN',
  localService: true,
  voiceURI: 'test-uri',
  ...over,
});

describe('pickVoice', () => {
  // Tingting: 50 + 20 (giọng tốt đã biết) + 10 (ngoại tuyến) = 80
  // Google 普通话: 50 + 15 (google) = 65; English: không phải zh-CN
  const voices = [
    voice({ name: 'Google 普通话', voiceURI: 'google-cmn', localService: false }),
    voice({ name: 'Tingting', voiceURI: 'tingting' }),
    voice({ name: 'English', lang: 'en-US', voiceURI: 'en' }),
  ];

  it('ưu tiên giọng đã lưu khi còn trong danh sách', () => {
    expect(pickVoice(voices, 'google-cmn')?.voiceURI).toBe('google-cmn');
  });

  it('giọng đã lưu không còn: fallback giọng xếp hạng cao nhất', () => {
    expect(pickVoice(voices, 'da-xoa')?.voiceURI).toBe('tingting');
  });

  it('không truyền URI: chọn giọng xếp hạng cao nhất', () => {
    expect(pickVoice(voices)?.voiceURI).toBe('tingting');
    expect(pickVoice(voices, '')?.voiceURI).toBe('tingting');
  });

  it('không có giọng zh-CN nào: undefined', () => {
    expect(pickVoice([voice({ lang: 'en-US', voiceURI: 'en' })])).toBeUndefined();
  });
});
