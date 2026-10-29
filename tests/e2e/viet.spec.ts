/**
 * Viết tay: Tập viết 3 bước (lưu kết quả, hiện ở trang Tôi), Xem cách viết một câu (Lần lượt, Đồng loạt, dừng, chạm
 * để bắt đầu lại, chữ không có dữ liệu nét), In 田字格 (bố cục, chỉ in tờ giấy), liên kết từ trang từ và trang chữ.
 */
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

const BASE = '/chuhan/';
const enc = encodeURIComponent;

async function medians(request: APIRequestContext, c: string): Promise<number[][][]> {
  const res = await request.get(`${BASE}data/apl/strokes/2.0.1/u${c.codePointAt(0)!.toString(16)}.json`);
  return ((await res.json()) as { medians: number[][][] }).medians;
}

/** Viết các nét của chữ bằng chuột theo đường giữa nét (toạ độ dữ liệu → màn hình qua ma trận của nhóm SVG). */
async function draw(page: Page, box: Locator, strokes: number[][][]) {
  for (const stroke of strokes) {
    const pts = await box.evaluate((el, pts) => {
      const svg = el.querySelector('svg')!;
      const g = svg.querySelector('g[transform]') as SVGGElement;
      const m = g.getScreenCTM()!;
      return pts.map(([x, y]) => {
        const p = svg.createSVGPoint();
        p.x = x;
        p.y = y;
        const q = p.matrixTransform(m);
        return [q.x, q.y];
      });
    }, stroke);
    await page.mouse.move(pts[0][0], pts[0][1]);
    await page.mouse.down();
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(400);
  }
}

test.describe('Tập viết', () => {
  test('tab Viết; danh sách cấp 1 xếp theo số nét; 3 bước với 一, lưu kết quả (trang Tôi hiện chữ đã tập)', async ({ page, request }) => {
    await page.goto(BASE);
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Viết' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Viết tay' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('tab', { name: 'HSK 1 · 100', selected: true })).toBeVisible();
    const grid = page.getByRole('list', { name: 'Danh sách chữ: HSK 1' });
    await expect(grid.getByRole('button')).toHaveCount(100);
    await expect(grid.getByRole('button').first()).toHaveAccessibleName('一: chưa luyện');
    await expect(page.getByText('Chưa luyện 100')).toBeVisible();

    await grid.getByRole('button', { name: '一: chưa luyện' }).click();
    await expect(page.getByRole('tab', { name: '1. Xem nét', selected: true })).toBeVisible();
    await page.getByRole('button', { name: 'Tiếp: Tô theo nét mờ →' }).click();
    const box = page.getByLabel('Ô viết chữ 一');
    const m = await medians(request, '一');
    await expect(box.locator('svg')).toBeVisible();
    await page.waitForTimeout(500);
    await draw(page, box, m);
    await expect(page.getByText('Tô xong: 0 lỗi / 1 nét.')).toBeVisible();
    await page.getByRole('button', { name: 'Tiếp: Tự viết →' }).click();
    // bước 3: không thấy chữ, chỉ có pinyin, Hán Việt và một từ có chữ đó để trống
    await expect(page.getByText('nhất', { exact: true })).toBeVisible();
    await expect(page.getByText(/^＿/)).toBeVisible();
    await page.waitForTimeout(500);
    await draw(page, page.getByLabel('Ô viết chữ 一'), m);
    await expect(page.getByRole('status').filter({ hasText: '0 lỗi / 1 nét → Nhớ' })).toBeVisible();
    await page.getByRole('button', { name: 'Xong' }).click();
    await expect(page.getByRole('heading', { name: 'Xong 1 chữ' })).toBeVisible();
    await page.getByRole('button', { name: 'Về danh sách' }).click();
    await expect(grid.getByRole('button', { name: '一: đã viết đúng' })).toBeVisible();
    await expect(page.getByText('✓ Đã viết đúng 1')).toBeVisible();

    // viết ra giấy rồi tự chấm
    await grid.getByRole('button', { name: '七: chưa luyện' }).click();
    await page.getByRole('tab', { name: '3. Tự viết' }).click();
    await page.getByRole('button', { name: 'Viết ra giấy' }).click();
    await page.getByRole('button', { name: 'Lật để so' }).click();
    await page.getByRole('button', { name: 'Viết sai' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Quên' })).toBeVisible();
    await page.getByRole('button', { name: 'Xong' }).click();
    await page.getByRole('button', { name: 'Về danh sách' }).click();
    await expect(grid.getByRole('button', { name: '七: cần luyện thêm' })).toBeVisible();

    // lượt tiếp theo: chữ sai trước, rồi chữ chưa luyện
    await page.getByRole('button', { name: '▶ Luyện 10 chữ tiếp theo' }).click();
    await expect(page.getByText('Chữ 1/10')).toBeVisible();
    await expect(page.getByLabel('Ô viết chữ 七')).toBeVisible();

    // trang Tôi: chữ đã tập, viền theo lần chấm gần nhất; nút tập lại chữ chưa tốt
    await page.goto(BASE + 'toi/');
    await expect(page.getByRole('heading', { name: 'Chữ đã tập viết (2)' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: '一: Nhớ' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tập lại 1 chữ chưa tốt' })).toHaveAttribute('href', new RegExp(`viet/\\?chu=${enc('七')}$`));
  });

  test('danh sách tự chọn từ ?chu=: chữ trùng bỏ, chữ ngoài HSK vẫn luyện được', async ({ page }) => {
    await page.goto(BASE + 'viet/?chu=' + enc('学习学鬱'));
    const grid = page.getByRole('list', { name: 'Danh sách chữ: Chữ bạn chọn' });
    await expect(grid.getByRole('button')).toHaveCount(3, { timeout: 15_000 });
    await grid.getByRole('button', { name: /^鬱/ }).click();
    await expect(page.getByLabel('Ô viết chữ 鬱').locator('svg')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Xem cách viết', () => {
  const state = (page: Page, i: number) => page.locator(`button[data-i="${i}"]`);

  test('Lần lượt: viết xong chữ này mới sang chữ sau; chạm để bắt đầu từ chữ khác; dừng', async ({ page }) => {
    await page.goto(BASE + 'viet/cau/?t=' + enc('一二三。'));
    await expect(page.getByRole('radio', { name: 'Lần lượt', checked: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('button[data-i]')).toHaveCount(3);
    await expect(state(page, 0)).toHaveAttribute('data-trang-thai', 'dang-viet', { timeout: 10_000 });
    await expect(state(page, 1)).toHaveAttribute('data-trang-thai', 'cho');
    await expect(state(page, 1)).toHaveAttribute('data-trang-thai', 'dang-viet', { timeout: 10_000 });
    await expect(state(page, 0)).toHaveAttribute('data-trang-thai', 'xong');
    await expect(page.getByText(/chữ 2\/3 · 2 nét/)).toBeVisible();
    // chạm chữ thứ ba
    await state(page, 2).click();
    await expect(state(page, 2)).toHaveAttribute('aria-current', 'true');
    await expect(state(page, 1)).toHaveAttribute('data-trang-thai', 'xong');
    // dừng: không còn đổi trạng thái
    await page.getByRole('button', { name: 'Dừng' }).click();
    const before = await Promise.all([0, 1, 2].map((i) => state(page, i).getAttribute('data-trang-thai')));
    await page.waitForTimeout(1500);
    const after = await Promise.all([0, 1, 2].map((i) => state(page, i).getAttribute('data-trang-thai')));
    expect(after).toEqual(before);
    await page.getByRole('button', { name: 'Chạy tiếp' }).click();
    await expect(page.getByRole('button', { name: 'Dừng' })).toBeVisible();
  });

  test('Đồng loạt: mọi chữ cùng viết, chữ ít nét quay lại nét đầu nhiều lần hơn; chữ không có dữ liệu nét', async ({ page }) => {
    await page.goto(BASE + 'viet/cau/?kieu=dong-loat&t=' + enc('一三龘'));
    await expect(page.getByRole('radio', { name: 'Đồng loạt', checked: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('radio', { name: 'Nhanh' }).click();
    await expect(state(page, 0)).toHaveAttribute('data-vong', /\d+/, { timeout: 10_000 });
    await expect(state(page, 1)).toHaveAttribute('data-vong', /\d+/, { timeout: 10_000 });
    await page.waitForTimeout(3000);
    const one = Number(await state(page, 0).getAttribute('data-vong'));
    const three = Number(await state(page, 1).getAttribute('data-vong'));
    expect(one).toBeGreaterThan(three);
    await expect(state(page, 2).getByTitle('Chưa có dữ liệu nét cho chữ này')).toBeVisible();
    // các nét được cắt đúng theo hình nét (clip-path tương đối, không hỏng khi trang đổi địa chỉ)
    const clips = await page.locator('button[data-i="0"] [clip-path]').evaluateAll((els) => els.map((e) => e.getAttribute('clip-path')));
    expect(clips.length).toBeGreaterThan(0);
    for (const c of clips) expect(c).toMatch(/^url\(#/);
    await expect(page.getByRole('link', { name: 'In 田字格 các chữ này' })).toHaveAttribute('href', new RegExp(`in/\\?chu=${enc('一三龘')}$`));
  });

  test('pinyin trên ô chữ theo ngữ cảnh; đổi cách đọc; tắt thì chạm để xem; Hán Việt dưới chữ; nhớ lựa chọn', async ({ page }) => {
    await page.goto(BASE + 'viet/cau/?t=' + enc('我去银行。行走很好。'));
    // 行 trong 银行 đọc háng, trong 行走 đọc xíng
    await expect(state(page, 3)).toHaveAttribute('aria-label', '行 háng: chạm để viết lại', { timeout: 30_000 });
    await expect(state(page, 4)).toHaveAttribute('aria-label', '行 xíng: chạm để viết lại');
    // 好 có hai cách đọc trong HSK: chạm pinyin để đổi
    const hao = page.getByRole('button', { name: /^好 đọc là hǎo.*chạm để đổi cách đọc$/ });
    await hao.click();
    await expect(page.getByRole('button', { name: /^好 đọc là hào.*chạm để đổi cách đọc$/ })).toBeVisible();
    await expect(state(page, 7)).toHaveAttribute('aria-label', '好 hào: chạm để viết lại');
    // tắt pinyin: ô chữ không đọc pinyin; chạm ··· trên chữ 我 để xem riêng chữ đó
    await page.getByRole('radio', { name: 'Tắt' }).click();
    await expect(state(page, 0)).toHaveAttribute('aria-label', '我: chạm để viết lại');
    await page.getByRole('button', { name: 'Xem pinyin của 我' }).click();
    await expect(state(page, 0)).toHaveAttribute('aria-label', '我 wǒ: chạm để viết lại');
    await expect(state(page, 1)).toHaveAttribute('aria-label', '去: chạm để viết lại');
    // chưa đánh dấu từ nào: "Chữ chưa biết" hiện hết
    await page.getByRole('radio', { name: 'Chữ chưa biết' }).click();
    await expect(state(page, 1)).toHaveAttribute('aria-label', '去 qù: chạm để viết lại');
    // Hán Việt dưới chữ
    await page.getByText('Tuỳ chỉnh').click();
    await page.getByRole('checkbox', { name: 'Hiện âm Hán Việt dưới chữ' }).check();
    await expect(page.getByText('ngân', { exact: true })).toBeVisible();
    await expect(page.getByText('hàng', { exact: true })).toBeVisible();
    // tải lại: nhớ lựa chọn
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Chữ chưa biết', checked: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('ngân', { exact: true })).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('In 田字格', () => {
  test('bố cục theo cấp: hàng thứ tự nét, ô mẫu, ô tô mờ; khi in chỉ còn tờ giấy', { tag: '@desktop' }, async ({ page }) => {
    await page.goto(BASE + 'viet/in/?cap=1&tu=1&den=3');
    const sheet = page.getByRole('article', { name: 'Trang in' });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByRole('heading', { name: 'Tập viết chữ Hán · HSK 1 · chữ 1–3' })).toBeVisible();
    const blocks = sheet.locator('section');
    await expect(blocks).toHaveCount(3);
    await expect(blocks.nth(0)).toHaveAccessibleName('Chữ 一');
    await expect(blocks.nth(0)).toContainText('yī · nhất · 1 nét');
    // 七 hai nét: hàng thứ tự nét có 2 ô; hai hàng luyện, mỗi hàng 12 ô (ô 15 mm)
    const qi = sheet.getByRole('region', { name: 'Chữ 七' });
    await expect(qi.locator('[data-hang="thu-tu-net"] rect')).toHaveCount(2);
    await expect(qi.locator('[data-hang="luyen"] rect')).toHaveCount(24);
    // ô mẫu + 3 ô tô mờ, mỗi ô 2 nét
    await expect(qi.locator('[data-hang="luyen"] use')).toHaveCount(8);
    await page.getByLabel('Ô tô mờ').selectOption('0');
    await expect(qi.locator('[data-hang="luyen"] use')).toHaveCount(2);
    await page.getByLabel('Hàng luyện mỗi chữ').selectOption('1');
    await expect(qi.locator('[data-hang="luyen"] rect')).toHaveCount(12);

    await page.evaluate(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed++;
      };
    });
    await page.getByRole('button', { name: 'In / Lưu PDF' }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Viết tay' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'In / Lưu PDF' })).toBeHidden();
    await expect(sheet).toBeVisible();
  });

  test('tự nhập: chữ trùng in một lần; liên kết từ trang từ và trang chữ', async ({ page }) => {
    await page.goto(BASE + 'viet/in/?chu=' + enc('学学习'));
    await expect(page.getByRole('article', { name: 'Trang in' }).locator('section')).toHaveCount(2, { timeout: 15_000 });
    await page.goto(BASE + 'tu/?w=' + enc('学习_xue2xi2'));
    await expect(page.getByRole('link', { name: '✎ Xem cách viết' })).toHaveAttribute('href', new RegExp(`viet/cau/\\?t=${enc('学习')}$`), { timeout: 15_000 });
    await page.goto(BASE + 'chu/?c=' + enc('学'));
    await page.getByRole('button', { name: /Nét chữ/ }).click();
    await expect(page.getByRole('link', { name: 'Tập viết 3 bước' })).toHaveAttribute('href', new RegExp(`viet/\\?chu=${enc('学')}$`));
    await expect(page.getByRole('link', { name: 'In 田字格' })).toHaveAttribute('href', new RegExp(`viet/in/\\?chu=${enc('学')}$`));
  });
});
