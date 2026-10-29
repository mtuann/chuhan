/**
 * Khung app: các tab và trang mở được, điều hướng, không lỗi console; chạy offline (service worker, mất mạng thật);
 * giới thiệu, góp ý (email ghép lúc chạy), nguồn và giấy phép; manifest; chuyển hướng đường dẫn cũ.
 */
import { expect, test } from '@playwright/test';
import { startOwnServer } from './own-server';

const BASE = '/chuhan/';
const PAGES: [string, string][] = [
  ['', 'Đọc'],
  ['viet/', 'Viết tay'],
  ['go/', 'Gõ chữ'],
  ['am/', 'Bảng âm'],
  ['toi/', 'Tôi'],
  ['tra/', 'Tra từ'],
  ['bo-thu/', '214 bộ thủ'],
  ['toi/cai-dat/', 'Cài đặt'],
];

test('mọi tab mở được, có điều hướng, không lỗi console', { tag: '@desktop' }, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  for (const [path, heading] of PAGES) {
    await page.goto(BASE + path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('mất mạng thật (tắt máy chủ): các tab và dữ liệu đã mở vẫn chạy', async ({ page }, info) => {
  const server = await startOwnServer(4500 + info.parallelIndex);
  try {
    const B = server.base;
    await page.goto(B);
    await page.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true), null, { timeout: 15_000 });
    await page.reload();
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    // mở khi có mạng để dữ liệu vào cache
    await page.goto(`${B}tu/?w=${encodeURIComponent('爱好_ai4hao4')}&l=2`);
    await expect(page.locator('article [lang="zh-Latn-pinyin"]').first()).toHaveText('àihào', { timeout: 15_000 });
    await page.goto(`${B}chu/?c=${encodeURIComponent('爱')}`);
    await expect(page.getByRole('img', { name: 'Chữ 爱' }).locator('path').first()).toBeAttached({ timeout: 10_000 });
    await server.stop();
    for (const [path, heading] of PAGES) {
      await page.goto(B + path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: 15_000 });
    }
    // từ khác cùng gói cấp 2, chưa mở bao giờ
    await page.goto(`${B}tu/?w=${encodeURIComponent('跑步_pao3bu4')}&l=2`);
    await expect(page.locator('article [lang="zh-Latn-pinyin"]').first()).toHaveText('pǎobù', { timeout: 15_000 });
    await page.goto(`${B}chu/?c=${encodeURIComponent('爱')}`);
    await expect(page.getByRole('img', { name: 'Chữ 爱' }).locator('path').first()).toBeAttached({ timeout: 10_000 });
  } finally {
    await server.stop();
  }
});

test('Giới thiệu: email ghép lúc chạy, mã QR; Nguồn & giấy phép; tệp giấy phép dữ liệu tải được', async ({ page, request }) => {
  await page.goto(BASE + 'toi/');
  await page.getByRole('link', { name: /^Giới thiệu/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Giới thiệu & góp ý' })).toBeVisible();
  await expect(page.locator('a[data-email="text"]')).toHaveAttribute('href', /^mailto:.+@.+\?subject=/);
  expect(await (await request.get(BASE + 'gioi-thieu/')).text()).not.toMatch(/mailto:[a-z]/);
  await expect(page.getByRole('img', { name: /^Mã VietQR chuyển khoản/ })).toBeVisible();

  await page.goto(BASE + 'ban-quyen/');
  await expect(page.getByRole('heading', { level: 1, name: 'Nguồn & giấy phép' })).toBeVisible();
  await expect(page.getByRole('link', { name: /CVDICT/ })).toBeVisible();
  for (const f of ['data/sa/LICENSE.txt', 'data/apl/ARPHICPL.TXT', 'data/lgpl/COPYING.LESSER', 'data/mit/LICENSE.txt']) {
    expect((await request.get(BASE + f)).ok(), f).toBe(true);
  }
});

test('manifest khớp base; 404 chuyển /tu/<từ>/ sang /tu/?w=', async ({ page, request }) => {
  const m = await (await request.get(BASE + 'manifest.webmanifest')).json();
  expect(m.name).toBe('Chữ Hán');
  expect(m.start_url).toBe(BASE);
  expect(m.scope).toBe(BASE);
  await page.goto(BASE + 'tu/' + encodeURIComponent('爱好') + '/');
  await expect(page).toHaveURL(/\/chuhan\/tu\/\?w=%E7%88%B1%E5%A5%BD$/);
  await expect(page.locator('article [lang="zh-Latn-pinyin"]').first()).toHaveText('àihào', { timeout: 15_000 });
});
