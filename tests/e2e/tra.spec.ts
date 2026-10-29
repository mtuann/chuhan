/**
 * Trang từ (đánh dấu từ, lưu trên máy), trang chữ, Tra từ, Bộ thủ.
 */
import { expect, test, type Page } from '@playwright/test';

const BASE = '/chuhan/';
const enc = encodeURIComponent;

const pinyinOf = (page: Page) => page.locator('article [lang="zh-Latn-pinyin"]').first();
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Tìm từ' });
const hskResults = (page: Page) => page.getByRole('list', { name: 'Kết quả HSK' }).getByRole('link');

test.describe('Trang từ', () => {
  test('一下: chữ, pinyin như đề cương, Hán Việt, nghĩa, cấp; chạm chữ để sang trang chữ', async ({ page }) => {
    await page.goto(`${BASE}tu/?w=${enc('一下_yi1xia4')}&l=1`);
    await expect(page.getByRole('heading', { level: 1, name: 'Từ 一下' })).toBeAttached();
    await expect(page).toHaveTitle(/^一下 · Từ/);
    const card = page.locator('article').first();
    await expect(pinyinOf(page)).toHaveText('yíxià');
    await expect(card.locator('p', { hasText: 'Hán Việt' })).toContainText('nhất hạ');
    await expect(card.getByText('HSK 1', { exact: true })).toBeVisible();
    // nghĩa từ CVDICT, có nhãn máy dịch
    await expect(card.getByRole('heading', { name: /^Nghĩa/ })).toContainText('máy dịch');
    await expect(card.locator('section ol li').first()).not.toBeEmpty();
    // phần còn lại nằm trong "Chi tiết"
    await expect(card.getByText('Tiếng Anh', { exact: true })).toBeHidden();
    await card.getByText('Chi tiết', { exact: true }).click();
    await expect(card.getByText('Tiếng Anh', { exact: true })).toBeVisible();

    await card.getByRole('link', { name: 'Xem chữ 下' }).click();
    await expect(page).toHaveURL(new RegExp(`/chu/\\?c=${enc('下')}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Chữ 下' })).toBeAttached();
  });

  test('đánh dấu Đang học → lưu trên máy, hiện ở trang Tôi; đổi sang Đã biết', async ({ page }) => {
    await page.goto(`${BASE}tu/?w=${enc('一共_yi1gong4')}`);
    await expect(pinyinOf(page)).toHaveText('yígòng', { timeout: 15_000 });
    await expect(page.locator('article').first().getByText('HSK 3', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '☆ Đang học' }).click();
    await expect(page.getByRole('status').filter({ hasText: '一共: đang học.' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: '☆ Đang học', pressed: true })).toBeVisible({ timeout: 15_000 });
    await page.goto(`${BASE}toi/`);
    const mine = page.getByRole('region', { name: 'Từ của tôi' });
    await expect(mine.getByRole('tab', { name: 'Đang học (1)' })).toBeVisible({ timeout: 15_000 });
    await expect(mine.getByRole('link', { name: /一共/ })).toBeVisible();
    await mine.getByRole('button', { name: '✓ Đã biết' }).click();
    await expect(mine.getByRole('tab', { name: 'Đã biết (1)' })).toBeVisible();
  });

  test('只 có hai cách đọc trong HSK: hiện cả hai mục', async ({ page }) => {
    await page.goto(`${BASE}tu/?w=${enc('只')}`);
    await expect(page.getByText(/có 2 mục trong HSK/)).toBeVisible({ timeout: 15_000 });
    const items = page.locator('article');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0).locator('[lang="zh-Latn-pinyin"]').first()).toHaveText('zhī');
    await expect(items.nth(1).locator('[lang="zh-Latn-pinyin"]').first()).toHaveText('zhǐ');
  });

  test('từ ngoài HSK: tra từ điển mở rộng, có nhãn máy dịch', async ({ page }) => {
    await page.goto(`${BASE}tu/?w=${enc('猫头鹰')}`);
    await expect(page.getByRole('heading', { level: 1, name: '猫头鹰' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Không có trong danh sách HSK')).toBeVisible();
    await expect(page.getByText('cú mèo')).toBeVisible();
    await expect(page.getByText(/máy dịch · chưa duyệt/).first()).toBeVisible();
  });

  test('chưa chọn từ: chỉ sang Tra từ', async ({ page }) => {
    await page.goto(`${BASE}tu/`);
    await expect(page.getByText('Chưa chọn từ.')).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Tra từ' })).toBeVisible();
  });
});

test.describe('Trang chữ', () => {
  test('好: hình chữ, số nét, bộ, 3 từ có chữ này; mỗi lần mở một mục', async ({ page }) => {
    await page.goto(`${BASE}chu/?c=${enc('好')}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Chữ 好' })).toBeAttached();
    await expect(page.getByRole('img', { name: 'Chữ 好' }).locator('path').first()).toBeAttached({ timeout: 10_000 });
    const facts = page.locator('article dl').first();
    await expect(facts).toContainText('Số nét 6');
    await expect(facts).toContainText('Bộ 女');
    await expect(page.locator('article p', { hasText: 'Hán Việt' })).toContainText('hảo');

    const words = page.getByRole('region', { name: 'Từ có chữ này' }).getByRole('link');
    await expect(words).toHaveCount(3, { timeout: 15_000 });
    await expect(words.first()).toContainText('你好');

    const net = page.getByRole('button', { name: 'Nét chữ' });
    const cauTao = page.getByRole('button', { name: 'Cấu tạo' });
    await net.click();
    await expect(page.getByRole('button', { name: 'Xem nét' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Viết thử' })).toBeVisible();
    await expect(page.locator('[aria-label="Ô viết chữ 好"] svg path').first()).toBeAttached({ timeout: 10_000 });
    await cauTao.click();
    await expect(net).toHaveAttribute('aria-expanded', 'false');
    await expect(cauTao).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Xem nét' })).toHaveCount(0);
    // mẹo đoán thanh từ âm Hán Việt
    await page.getByRole('button', { name: 'Mẹo thanh' }).click();
    await expect(page.getByText(/không phải cách đọc/)).toBeVisible();
  });

  test('mẹo nhớ của bạn được lưu trên máy', async ({ page }) => {
    await page.goto(`${BASE}chu/?c=${enc('爱')}`);
    await page.getByRole('button', { name: 'Mẹo nhớ của bạn' }).click();
    const note = page.getByRole('textbox');
    await note.fill('trái tim 心 ở giữa');
    await page.waitForTimeout(800); // lưu sau 0,5 giây không gõ
    await page.reload();
    await page.getByRole('button', { name: 'Mẹo nhớ của bạn' }).click();
    await expect(page.getByRole('textbox')).toHaveValue('trái tim 心 ở giữa');
  });
});

test.describe('Tra từ', () => {
  test('tìm theo pinyin (có số, có dấu, không dấu), Hán Việt không dấu, chữ Hán, nghĩa', async ({ page }) => {
    await page.goto(`${BASE}tra/`);
    await expect(page.getByRole('heading', { level: 1, name: 'Tra từ' })).toBeVisible();
    const cases: [string, string][] = [
      ['nihao', '你好'],
      ['ni3hao3', '你好'],
      ['nǐ hǎo', '你好'],
      ['hoc', '学'],
      ['đại học', '大学'],
      ['dai hoc', '大学'],
      ['爱', '爱'],
      ['cảm ơn', '谢谢'],
      ['teacher', '老师'],
    ];
    for (const [q, first] of cases) {
      await searchBox(page).fill(q);
      await expect(hskResults(page).first().locator('[lang="zh-CN"]'), q).toHaveText(first, { timeout: 10_000 });
    }
    // kết quả có nhãn cấp và dẫn tới trang từ
    await expect(hskResults(page).first()).toContainText('HSK 1');
    await hskResults(page).first().click();
    await expect(page).toHaveURL(/\/tu\/\?w=.+&l=1$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Từ 老师' })).toBeAttached();
  });

  test('?q= giữ truy vấn khi tải lại; chữ ngoài HSK tra từ điển mở rộng', async ({ page }) => {
    await page.goto(`${BASE}tra/?q=${enc('猫头鹰')}`);
    await expect(searchBox(page)).toHaveValue('猫头鹰');
    const ext = page.locator('section', { has: page.getByRole('heading', { name: /Từ điển mở rộng/ }) });
    await expect(ext).toContainText('cú mèo', { timeout: 15_000 });
    await searchBox(page).fill('xuexi');
    await expect(page).toHaveURL(/\?q=xuexi$/);
    await page.reload();
    await expect(searchBox(page)).toHaveValue('xuexi');
    await expect(hskResults(page).first().locator('[lang="zh-CN"]')).toHaveText('学习');
  });

  test('không thấy gì thì báo rõ; phím / nhảy tới ô tìm; chạm ví dụ để thử', { tag: '@desktop' }, async ({ page }) => {
    await page.goto(`${BASE}tra/`);
    await page.getByRole('button', { name: 'nihao' }).click();
    await expect(hskResults(page).first().locator('[lang="zh-CN"]')).toHaveText('你好');
    await searchBox(page).fill('qqqzzz');
    await expect(page.getByText('Không tìm thấy “qqqzzz”.')).toBeVisible();
    await page.getByRole('heading', { level: 1, name: 'Tra từ' }).click();
    await expect(searchBox(page)).not.toBeFocused();
    await page.keyboard.press('/');
    await expect(searchBox(page)).toBeFocused();
  });
});

test('Bộ thủ: tìm theo tên không dấu, mở danh sách chữ của bộ, chạm chữ sang trang chữ', async ({ page }) => {
  await page.goto(`${BASE}tra/`);
  await page.getByRole('main').getByRole('link', { name: 'Bộ thủ →' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '214 bộ thủ' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('searchbox').fill('thuy');
  const water = page.locator('#bo-85');
  await expect(water).toContainText('bộ Thuỷ');
  await water.getByRole('button', { name: /chữ$/ }).click();
  await water.getByRole('link', { name: 'Chữ 汉' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Chữ 汉' })).toBeAttached({ timeout: 15_000 });
});
