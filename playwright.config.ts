import { defineConfig, devices } from '@playwright/test';

// Chạy trên bản build tĩnh (dist/) phục vụ dưới base /chuhan/.
// Môi trường có sẵn Chromium riêng: đặt CHROMIUM_PATH để dùng nó thay vì tải trình duyệt.
//
// Cấu hình thiết bị:
// - `iphone`: chạy đủ mọi test (app làm cho điện thoại trước). Trước đây có thêm `android` nhưng cùng engine Chromium,
//   chỉ khác cỡ màn hình, nên bỏ cho nhanh.
// - `desktop`: chỉ chạy các test gắn tag `@desktop` (bàn phím, bố cục màn rộng, điều hướng, in).
// Mỗi test chạy độc lập (IndexedDB riêng; máy chủ riêng theo `parallelIndex`), nên chạy song song được
// (`fullyParallel`) và chia shard trong CI (`--shard=1/3`).
const executablePath = process.env.CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: 'http://127.0.0.1:4321/chuhan/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 14'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grep: /@desktop/ },
  ],
});
