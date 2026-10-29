/**
 * Gõ chữ: bộ gõ pinyin trong app (gợi ý có Hán Việt, nghĩa; gõ cả câu; phím số, phím cách, Enter; xoá chữ), sửa giữa
 * câu, gõ theo đoạn văn tự dán (chấm khi gõ, ô trống chỗ sót chữ, Enter để sang câu sau, tiến độ lưu để gõ tiếp), gõ từ,
 * bẫy cùng âm, thử thách tốc độ, liên kết từ Đọc.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

const BASE = '/chuhan/';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Gõ pinyin rồi chạm vào gợi ý có đúng chữ `han` (bất kể vị trí trong danh sách). */
async function typeWord(page: Page, box: Locator, keys: string, han: string) {
  await box.pressSequentially(keys, { delay: 15 });
  const list = page.getByRole('list', { name: 'Chữ gợi ý' });
  await list.getByRole('button', { name: new RegExp(`^(\\d: )?${esc(han)} `) }).first().click();
}

test('gõ thử: gợi ý có Hán Việt và nghĩa; phím cách, phím số, Enter; gõ cả câu; xoá; nhắc tắt Telex', { tag: '@desktop' }, async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Gõ' }).click();
  const box = page.getByRole('textbox', { name: 'Gõ thử tiếng Trung' });
  await expect(box).toBeVisible({ timeout: 15_000 });
  await box.pressSequentially('nihao', { delay: 20 });
  const list = page.getByRole('list', { name: 'Chữ gợi ý' });
  await expect(list.getByRole('button').first()).toHaveAccessibleName(/^1: 你好 nǐ hǎo, Hán Việt nễ hảo, xin chào/, { timeout: 30_000 });
  await box.press('Space');
  const typed = page.getByTestId('go-da-go');
  await expect(typed).toHaveText('你好');
  // chữ cùng âm: 在 tại / 再 tái
  await box.pressSequentially('zai', { delay: 20 });
  await expect(list.getByRole('button').nth(0)).toHaveAccessibleName(/^1: 在 zài, Hán Việt tại/);
  await expect(list.getByRole('button').nth(1)).toHaveAccessibleName(/^2: 再 zài, Hán Việt tái/);
  await box.press('2');
  await expect(typed).toHaveText('你好再');
  await page.getByRole('button', { name: 'Xoá chữ trước con trỏ' }).click();
  await expect(typed).toHaveText('你好');
  // gõ cả câu, Enter chọn gợi ý đầu
  await box.pressSequentially('woaini', { delay: 20 });
  await expect(list.getByRole('button').first()).toHaveAccessibleName(/^1: 我爱你 /);
  await box.press('Enter');
  await expect(typed).toHaveText('你好我爱你');
  // gõ tắt
  await box.pressSequentially('xs', { delay: 20 });
  await expect(list).toContainText('学生');
  await box.press('Escape');
  await expect(list).toHaveCount(0);
  // dán chữ Hán kèm dấu nửa khổ: dấu đổi ra toàn khổ, giữ đúng thứ tự
  await box.fill('他,她');
  await expect(typed).toHaveText('你好我爱你他，她');
  // bộ gõ tiếng Việt đang bật
  await box.fill('xuẽi');
  await expect(page.getByRole('alert').filter({ hasText: 'Bộ gõ tiếng Việt đang bật' })).toBeVisible();
  // liên kết sang Tra từ
  await expect(page.getByRole('region', { name: 'Gõ thử', exact: true }).getByRole('link', { name: 'Tra từ' })).toHaveAttribute('href', /tra\/\?q=/);
});

/** Chạm vào chữ thứ i trong ô gõ, ở nửa trái hoặc nửa phải chữ. */
async function tapChar(page: Page, i: number, side: 'left' | 'right') {
  const el = page.getByTestId('go-da-go').locator(`[data-i="${i}"]`);
  await el.scrollIntoViewIfNeeded();
  const b = (await el.boundingBox())!;
  await page.mouse.click(b.x + b.width * (side === 'left' ? 0.2 : 0.8), b.y + b.height / 2);
}

test('gõ thử: sửa giữa câu như ô chữ thường (chạm chữ để chọn lại, chèn chữ, ← → Delete, về cuối)', { tag: '@desktop' }, async ({ page }) => {
  await page.goto(BASE + 'go/');
  const box = page.getByRole('textbox', { name: 'Gõ thử tiếng Trung' });
  await expect(box).toBeVisible({ timeout: 15_000 });
  await box.click();
  const typed = page.getByTestId('go-da-go');
  for (const [k, h] of [
    ['wo', '我'],
    ['zai', '再'],
    ['xuexiao', '学校'],
    ['xuexi', '学习'],
  ])
    await typeWord(page, box, k, h);
  await expect(typed).toHaveText('我再学校学习');
  // chạm vào 再: hiện các chữ cùng gõ zai kèm Hán Việt, chọn 在 thay vào
  await tapChar(page, 1, 'right');
  const again = page.getByRole('list', { name: 'Chọn lại chữ' });
  await expect(again.getByRole('button').first()).toHaveAccessibleName(/^1: 在 zài, Hán Việt tại/);
  await again.getByRole('button', { name: /在 zài/ }).first().click();
  await expect(typed).toHaveText('我在学校学习');
  await expect(box).toBeFocused();
  // chạm nửa trái chữ 学 rồi gõ: chèn trước 学
  await tapChar(page, 2, 'left');
  await expect(page.getByRole('button', { name: 'Đưa con trỏ về cuối' })).toBeVisible();
  await typeWord(page, box, 'qu', '去');
  await expect(typed).toHaveText('我在去学校学习');
  // phím: End, ⌫ xoá chữ cuối; ← ← rồi Delete xoá chữ sau con trỏ; gõ tiếp là chèn tại con trỏ
  await box.press('End');
  await box.press('Backspace');
  await expect(typed).toHaveText('我在去学校学');
  await box.press('ArrowLeft');
  await box.press('ArrowLeft');
  await box.press('Delete');
  await expect(typed).toHaveText('我在去学学');
  await typeWord(page, box, 'xiao', '校');
  await expect(typed).toHaveText('我在去学校学');
  await page.getByRole('button', { name: 'Đưa con trỏ về cuối' }).click();
  await typeWord(page, box, 'xi', '习');
  await expect(typed).toHaveText('我在去学校学习');
});

test('gõ theo đoạn văn: dán, chấm khi gõ, sửa chỗ sai và chỗ sót chữ, Enter sang câu sau, tiến độ lưu để gõ tiếp', async ({ page }) => {
  await page.goto(BASE + 'go/');
  await page.getByRole('link', { name: /^Gõ theo đoạn văn/ }).click();
  const area = page.getByRole('textbox', { name: 'Đoạn văn tiếng Trung' });
  await expect(area).toBeVisible({ timeout: 15_000 });
  await area.fill('我在学校学习汉语。\n今天天气很好，我们去公园吧！');
  await expect(page.getByText(/^20 chữ Hán/)).toBeVisible();
  await page.getByRole('button', { name: 'Bắt đầu gõ' }).click();
  const box = page.getByRole('textbox', { name: 'Gõ câu' });
  await expect(box).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Câu 1/2' })).toBeVisible();
  const line = page.getByTestId('cau-dang-go');
  const states = () => line.locator('[data-st]').evaluateAll((els) => els.map((e) => `${e.textContent}:${(e as HTMLElement).dataset.st}`).join(' '));
  await typeWord(page, box, 'wo', '我');
  await typeWord(page, box, 'zai', '再');
  await expect.poll(states).toContain('我:ok 在:bad 学:next');
  await expect(page.getByText('Có chỗ sai: chạm vào chữ tô đỏ')).toBeVisible();
  // chạm vào chữ đỏ để chọn lại 在
  await page.getByTestId('go-da-go').locator('[data-i="1"]').click();
  await page.getByRole('list', { name: 'Chọn lại chữ' }).getByRole('button', { name: /在 zài/ }).first().click();
  for (const [k, h] of [
    ['xuexiao', '学校'],
    ['xuexi', '学习'],
    ['hanyu', '汉语'],
  ])
    await typeWord(page, box, k, h);
  // chưa có dấu chấm hết câu: chưa xong; gõ dấu rồi Enter mới sang câu 2 (không tự nhảy)
  await expect.poll(states).toContain('语:ok 。:next');
  await box.pressSequentially('.', { delay: 15 });
  await expect(page.getByText('✓ Đúng hết câu này. Bấm Enter để sang câu sau.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Câu 1/2' })).toBeVisible();
  await box.press('Enter');
  // thoát giữa chừng thì tiến độ được lưu
  await expect(page.getByRole('region', { name: 'Câu 2/2' })).toBeVisible();
  await page.getByRole('link', { name: 'Thoát, tiến độ đã lưu' }).click();
  const mine = page.getByRole('region', { name: 'Đoạn văn của bạn' });
  await expect(mine).toContainText('Đã gõ 1/2 câu · gõ tiếp', { timeout: 15_000 });
  await mine.getByRole('button', { name: /今天天气/ }).click();
  await expect(page.getByRole('region', { name: 'Câu 2/2' })).toBeVisible({ timeout: 30_000 });
  // sót 天气: gõ tiếp thì thấy ô trống ở chỗ sót, chạm vào để chèn
  await typeWord(page, box, 'jintian', '今天');
  await typeWord(page, box, 'hen', '很');
  await typeWord(page, box, 'hao', '好');
  await expect.poll(states).toContain('天:miss 气:miss 很:ok 好:ok');
  await page.getByTestId('go-da-go').locator('[data-gap]').click();
  await typeWord(page, box, 'tianqi', '天气');
  await box.press('End');
  await box.pressSequentially(',', { delay: 15 });
  for (const [k, h] of [
    ['women', '我们'],
    ['qu', '去'],
    ['gongyuan', '公园'],
    ['ba', '吧'],
  ])
    await typeWord(page, box, k, h);
  await box.pressSequentially('!', { delay: 15 });
  await expect(page.getByText('✓ Đúng hết câu này. Bấm Enter để xem kết quả.')).toBeVisible();
  await box.press('Enter');
  await expect(page.getByRole('heading', { name: 'Xong 1 câu' })).toBeVisible({ timeout: 15_000 });
  // "Đọc đoạn này" mở đoạn đã lưu bằng mã (văn bản không nằm trên địa chỉ trang)
  const read = page.getByRole('link', { name: 'Đọc đoạn này' });
  await expect(read).toHaveAttribute('href', /chuhan\/\?doan=[a-z0-9]+$/);
  await read.click();
  await expect(page.getByRole('button', { name: '✎ Sửa văn bản' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /^公园 gōngyuán/ })).toBeVisible();
  await page.goto(BASE + 'go/?che-do=doan');
  await expect(page.getByRole('region', { name: 'Đoạn văn của bạn' })).toContainText('Đã gõ xong 2 câu', { timeout: 15_000 });
});

test('gõ theo đoạn văn: lời nói trải qua hai câu, phím " ở câu sau ra ngoặc đóng', async ({ page }) => {
  await page.goto(BASE + 'go/?che-do=doan&t=' + encodeURIComponent('他说：“我很好。你好吗？”'));
  const box = page.getByRole('textbox', { name: 'Gõ câu' });
  await expect(page.getByRole('region', { name: 'Câu 1/2' })).toBeVisible({ timeout: 30_000 });
  await box.press('Enter');
  await box.press('Enter');
  await expect(page.getByRole('region', { name: 'Câu 2/2' })).toBeVisible();
  await typeWord(page, box, 'ni', '你');
  await typeWord(page, box, 'hao', '好');
  await typeWord(page, box, 'ma', '吗');
  await box.pressSequentially('?"', { delay: 15 });
  await expect(page.getByTestId('go-da-go')).toHaveText('你好吗？”');
  await expect(page.getByText('✓ Đúng hết câu này. Bấm Enter để xem kết quả.')).toBeVisible();
});

test('Đọc: nút gõ đoạn đang đọc', async ({ page }) => {
  await page.goto(BASE + '?t=' + encodeURIComponent('我在学校。他很好。'));
  await page.getByRole('button', { name: '⌨ Gõ đoạn này' }).click({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Câu 1/2' })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.getByTestId('cau-dang-go').locator('[data-st]').allTextContents().then((x) => x.join(''))).toBe('我在学校。');
});

test('gõ từ HSK 1 nhìn chữ: gợi ý cách gõ, gõ đúng thì chấm luôn', async ({ page }) => {
  await page.goto(BASE + 'go/?che-do=tu');
  await page.getByRole('radio', { name: 'HSK 1' }).click();
  await page.getByRole('radio', { name: 'Nhìn chữ' }).click();
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  const box = page.getByRole('textbox', { name: 'Gõ từ' });
  await expect(box).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 2; i++) {
    const han = (await page.locator('.text-5xl').first().innerText()).trim();
    await page.getByRole('button', { name: 'Gợi ý cách gõ' }).click();
    const keys = (await page.locator('p.font-mono.text-accent').innerText()).trim();
    await typeWord(page, box, keys, han);
    await expect(page.getByRole('status')).toContainText('✓ Đúng rồi!');
    await page.getByRole('button', { name: /^Tiếp/ }).click();
  }
  await expect(page.getByText(/^Gõ từ · Nhìn chữ/)).toBeVisible();
});

test('bẫy cùng âm: đề cho cách gõ, Hán Việt và nghĩa; sau khi chấm hiện các chữ cùng gõ kèm Hán Việt', async ({ page }) => {
  await page.goto(BASE + 'go/?che-do=bay');
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  const box = page.getByRole('textbox', { name: 'Gõ từ' });
  await expect(box).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^Bẫy cùng âm · Gõ đúng chữ theo nghĩa/)).toBeVisible();
  const keys = (await page.locator('p.font-mono.text-xl').first().innerText()).trim();
  await box.pressSequentially(keys, { delay: 20 });
  await box.press('Space');
  // chọn đúng thì chấm luôn; chọn nhầm thì bấm Kiểm tra
  const check = page.getByRole('button', { name: 'Kiểm tra (Enter)' });
  await page.waitForTimeout(300);
  if (await check.isVisible()) await check.click();
  await expect(page.getByRole('region', { name: 'Kết quả chấm' })).toContainText(`Các chữ cùng gõ “${keys}”`);
});

test('thử thách tốc độ: gõ đúng là sang từ sau; hết giờ có số chữ mỗi phút', async ({ page }) => {
  await page.goto(BASE + 'go/?che-do=toc-do&giay=6');
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  const box = page.getByRole('textbox', { name: 'Gõ từ' });
  await expect(box).toBeVisible({ timeout: 30_000 });
  const han = (await page.locator('.text-5xl').first().innerText()).trim();
  const keys = (await page.locator('p.font-mono.text-muted').first().innerText()).trim();
  await typeWord(page, box, keys, han);
  await expect(page.getByText(/^\d+ chữ$/)).not.toHaveText('0 chữ');
  await expect(page.getByText('Hết giờ!')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/chữ\/phút · 1 từ đúng/)).toBeVisible();
});
