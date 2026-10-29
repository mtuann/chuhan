/**
 * Sao lưu: xuất → xoá dữ liệu → nhập lại (gộp) khôi phục đúng; nhập lần hai không trùng; "Thay thế" tự tải bản sao lưu
 * của máy trước khi thay.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/** Thư mục tạm có đường dẫn ASCII (đường dẫn kết quả test có chữ tiếng Việt làm chọn file không ăn). */
const tmp = (name: string) => path.join(mkdtempSync(path.join(os.tmpdir(), 'sao-luu-')), name);

const BASE = '/chuhan/';

/** Đánh dấu một từ "Đang học" ở trang từ. */
async function addWord(page: Page, id: string) {
  await page.goto(BASE + 'tu/?w=' + encodeURIComponent(id));
  await page.getByRole('button', { name: '☆ Đang học' }).click({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: '☆ Đang học', pressed: true })).toBeVisible();
}

/** Số từ đang học ở trang Tôi. */
async function expectLearning(page: Page, n: number) {
  await page.goto(BASE + 'toi/');
  await expect(page.getByRole('tab', { name: `Đang học (${n})` })).toBeVisible({ timeout: 15_000 });
}

const openBackup = (page: Page) => page.goto(BASE + 'toi/sao-luu/');

/** Xoá toàn bộ dữ liệu trên máy (như máy mới). */
async function wipe(page: Page) {
  await page.goto(BASE + 'toi/sao-luu/');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('chuhan');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
      }),
  );
  await openBackup(page);
}

/** Hàng so sánh: số trên máy này và trong file. */
async function expectRow(page: Page, name: string, mine: string, theirs: string) {
  const cells = page.locator('#import-compare tr', { has: page.getByRole('rowheader', { name }) }).locator('td');
  await expect(cells.nth(0)).toHaveText(mine, { timeout: 15_000 });
  await expect(cells.nth(1)).toHaveText(theirs);
}

test('xuất → xoá → gộp lại khôi phục từ đã đánh dấu; gộp lần hai không trùng; thay thế tự tải bản sao lưu trước', async ({ page }) => {
  test.setTimeout(120_000);
  await addWord(page, '电脑_dian4nao3');
  await addWord(page, '学习_xue2xi2');

  await openBackup(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải xuống bản sao lưu' }).click();
  const file = tmp('sao-luu.json.gz');
  await (await download).saveAs(file);
  await expect(page.getByText(/Đã tạo bản sao lưu/)).toBeVisible();

  await wipe(page);
  await page.locator('#file-import').setInputFiles(file);
  await expectRow(page, 'Từ đã đánh dấu', '0', '2');
  await expect(page.getByText(/File xuất lúc/)).toBeVisible();
  await page.getByRole('button', { name: 'Gộp vào máy này' }).click();
  await expect(page.getByText(/Đã gộp: thêm 2 từ/)).toBeVisible({ timeout: 15_000 });

  // sau khi tải lại: dữ liệu đã về; nhập lần hai không thêm gì
  await page.waitForTimeout(3000);
  await openBackup(page);
  await page.locator('#file-import').setInputFiles(file);
  await expectRow(page, 'Từ đã đánh dấu', '2', '2');
  await page.getByRole('button', { name: 'Gộp vào máy này' }).click();
  await expect(page.getByText(/máy này đã có đủ dữ liệu của file/)).toBeVisible({ timeout: 15_000 });

  await expectLearning(page, 2);

  // thay thế: thêm một từ rồi thay bằng file (2 từ); app tải bản sao lưu của máy trước
  await addWord(page, '朋友_peng2you5');
  await openBackup(page);
  await page.locator('#file-import').setInputFiles(file);
  await expectRow(page, 'Từ đã đánh dấu', '3', '2');
  await page.getByText('Thay thế toàn bộ dữ liệu trên máy bằng file').click();
  const auto = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải bản sao lưu của máy rồi thay thế' }).click();
  expect((await auto).suggestedFilename()).toMatch(/^chuhan-sao-luu-\d{4}-\d{2}-\d{2}\.json(\.gz)?$/);
  await expect(page.getByText(/Đã thay thế/)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(3000);
  await expectLearning(page, 2);
});

test('file không phải bản sao lưu: báo lỗi, không hiện nút nhập', async ({ page }) => {
  await openBackup(page);
  const bad = tmp('hong.json');
  writeFileSync(bad, JSON.stringify({ app: 'hoc-tieng-han', version: 1, exportedAt: 1, tables: {} }));
  await page.locator('#file-import').setInputFiles(bad);
  await expect(page.locator('#import-message')).toContainText('không phải bản sao lưu của Chữ Hán');
  await expect(page.getByRole('button', { name: 'Gộp vào máy này' })).toBeHidden();
});
