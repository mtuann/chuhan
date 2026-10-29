/**
 * Đọc (trang chủ): tách từ, pinyin theo ngữ cảnh, Hán Việt, độ phủ theo từ đã biết, chạm để tra (từ HSK, từ điển mở
 * rộng), đổi cách đọc, đánh dấu Đang học / Đã biết (lưu trên máy kèm câu gặp từ), cấp đã biết, danh sách đã đọc.
 */
import { expect, test } from '@playwright/test';

const BASE = '/chuhan/';
const SENT = '明天下午三点在学校门口见，别迟到！';

test('dán một câu: chạm 迟到 → nghĩa, Hán Việt; đánh dấu Đang học, tải lại vẫn nhớ; Đã biết thì ẩn pinyin', async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByRole('heading', { level: 1, name: 'Đọc' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('textbox', { name: 'Văn bản tiếng Trung' }).fill(SENT);
  await page.getByRole('button', { name: 'Đọc', exact: true }).click();
  await expect(page.getByText('Bạn đã biết 0/10 từ (0%)')).toBeVisible({ timeout: 30_000 });
  // pinyin có màu thanh trên từ chưa biết, Hán Việt bên dưới
  const word = page.getByRole('button', { name: '迟到 chídào, chưa biết: tra từ' });
  await expect(word).toContainText('chídào');
  await expect(word).toContainText('trì đáo');
  await expect(word.locator('[lang="zh-Latn-pinyin"] span').first()).toHaveClass(/text-t2/);
  await word.click();
  const sheet = page.getByRole('dialog', { name: 'Tra từ' });
  await expect(sheet.getByText('trì đáo')).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Cách viết' })).toHaveAttribute('href', /viet\/cau\/\?t=/);
  await sheet.getByRole('button', { name: '☆ Đang học' }).click();
  await expect(page.getByRole('status').filter({ hasText: '迟到: đang học.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '迟到 chídào, chưa biết, đang học: tra từ' })).toBeVisible();

  // tải lại (mở từ danh sách đã đọc): trạng thái vẫn còn
  await page.goto(BASE);
  await page.getByRole('button', { name: SENT }).click();
  const learning = page.getByRole('button', { name: '迟到 chídào, chưa biết, đang học: tra từ' });
  await expect(learning).toBeVisible({ timeout: 30_000 });

  // đã biết: pinyin ẩn ở chế độ "Từ chưa biết", độ phủ tăng
  await learning.click();
  await sheet.getByRole('button', { name: '✓ Đã biết' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Bạn đã biết 1/10 từ (10%)')).toBeVisible();
  await expect(page.getByRole('button', { name: /^迟到 chídào: tra từ$/ })).not.toContainText('chídào');

  // trang Tôi: từ đã biết kèm câu gặp từ
  await page.goto(BASE + 'toi/');
  const mine = page.getByRole('region', { name: 'Từ của tôi' });
  await mine.getByRole('tab', { name: 'Đã biết (1)' }).click();
  await expect(mine.getByRole('link', { name: /迟到/ })).toContainText('学校');
});

test('cấp đã biết (Cài đặt): từ HSK 1 không gạch chân, không pinyin; đánh dấu riêng vẫn ưu tiên', async ({ page }) => {
  await page.goto(BASE + 'toi/cai-dat/');
  await page.getByLabel('Tôi đã biết').selectOption('1');
  await expect(page.getByText('Đã lưu ✓')).toBeVisible();
  await page.goto(BASE + '?t=' + encodeURIComponent('我去学校。'));
  await expect(page.getByText(/^Bạn đã biết 3\/3 từ/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: '学校 xuéxiào: tra từ' })).not.toContainText('xuéxiào');
  await page.getByRole('radio', { name: 'Pinyin: hết' }).click();
  await expect(page.getByRole('button', { name: '学校 xuéxiào: tra từ' })).toContainText('xuéxiào');
});

test('?t=: từ ngoài HSK tra từ điển mở rộng; chữ nhiều cách đọc đổi được; đánh dấu cả đoạn', async ({ page }) => {
  await page.goto(BASE + '?t=' + encodeURIComponent('快递放在快递柜了。我看了。'));
  await expect(page.getByText(/^Bạn đã biết 0\//)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^柜 / }).click();
  const sheet = page.getByRole('dialog', { name: 'Tra từ' });
  await expect(sheet.getByText(/Từ ngoài danh sách HSK/)).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Tra từ điển' })).toBeVisible();
  await page.keyboard.press('Escape');
  // 了: máy chọn le, đổi sang liǎo
  await page.getByRole('button', { name: /^了 le, chưa biết/ }).last().click();
  await sheet.getByRole('button', { name: /liǎo/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^了 liǎo, chưa biết/ })).toBeVisible();
  // danh sách từ chưa biết: đánh dấu tất cả đã biết
  const unknown = page.locator('details', { hasText: 'Từ chưa biết' });
  await unknown.evaluate((d) => ((d as HTMLDetailsElement).open = true));
  await unknown.getByRole('button', { name: '✓ Tất cả: đã biết' }).click();
  await expect(page.getByText(/^Bạn đã biết \d+\//)).not.toHaveText(/^Bạn đã biết 0\//);
});
