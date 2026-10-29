# Chữ Hán

Bộ công cụ nhỏ, miễn phí cho người Việt học tiếng Trung, tập trung vào cách nhìn một chữ Hán: pinyin đọc theo ngữ cảnh, màu theo thanh điệu, âm Hán Việt, nét chữ. Không tài khoản, không quảng cáo, chạy offline; mọi thứ lưu trên máy người dùng.

https://mtuann.github.io/chuhan/

## Các trang

| Đường dẫn | Nội dung |
| --- | --- |
| `/` · `?t=…` · `?doan=<mã>` | **Đọc**: dán một đoạn tiếng Trung bất kỳ → tách từ, pinyin theo ngữ cảnh (银行 háng, 行走 xíng) có màu thanh, Hán Việt dưới từ chưa biết, % từ đã biết. Chạm một từ để tra (nghĩa, Hán Việt, cách đọc khác, trang chữ, cách viết) và đánh dấu ☆ Đang học / ✓ Đã biết (lưu kèm câu gặp từ). Pinyin: hết / chỉ từ chưa biết / tắt. Danh sách đã đọc gần đây; nút sang Gõ và Xem cách viết |
| `/viet/` · `?cap=1` · `?chu=学习` | **Tập viết**: 1.200 chữ viết tay HSK 3.0 theo cấp (ít nét trước) hoặc chữ tự chọn; xem nét → tô theo nét mờ → tự viết (máy chấm, hoặc viết ra giấy rồi tự chấm) |
| `/viet/cau/?t=…` | **Xem cách viết** một câu: lần lượt hoặc đồng loạt, pinyin theo ngữ cảnh trên từng ô, Hán Việt dưới chữ |
| `/viet/in/` | **In 田字格** khổ A4: hàng thứ tự nét, ô mẫu, ô tô mờ, ô trống |
| `/go/` · `?che-do=tu\|doan\|bay\|toc-do` | **Gõ chữ**: bộ gõ pinyin trong trình duyệt (gõ tắt, gõ cả câu; gợi ý kèm Hán Việt và nghĩa để chọn đúng chữ cùng âm); gõ từ (theo cấp, từ đang học, chữ hay sai), gõ theo đoạn văn tự dán, bẫy cùng âm, thử thách 1 phút; lỗi hay gặp, cách dùng dấu câu, cài bộ gõ trên máy |
| `/am/` | **Bảng âm**: chạm âm tiết nghe 4 thanh (giọng người thật), ghi chú các âm khó với người Việt, mẹo Hán Việt cho vần -n/-ng |
| `/tra/?q=…` · `/tu/?w=<id>` · `/chu/?c=<chữ>` | **Tra từ** (chữ Hán, pinyin có/không dấu, Hán Việt, nghĩa Việt/Anh) · trang từ · trang chữ (nét, cấu tạo, bộ, mẹo đoán thanh từ Hán Việt, ghi nhớ riêng) |
| `/bo-thu/` | **214 bộ thủ** Khang Hy: dạng biến thể, tên theo âm Hán Việt, các chữ HSK có bộ đó |
| `/toi/` | **Tôi**: từ đang học / đã biết (kèm câu gặp từ), chữ đã tập viết; Cài đặt (cấp đã biết, pinyin, Hán Việt, giọng đọc), Sao lưu (xuất `.json.gz`, nhập gộp hoặc thay thế) |

## Dữ liệu

Mọi chữ người dùng đọc là văn bản họ dán, hoặc lấy từ nguồn mở ghim theo commit trong [`sources.lock.json`](sources.lock.json): đề cương HSK 3.0, CVDICT (nghĩa Việt, máy dịch), CC-CEDICT (nghĩa Anh), bảng Hán Việt, Make Me a Hanzi (cấu tạo), hanzi-writer-data (nét), Unicode (bộ thủ), audio-cmn (giọng người thật). Nội dung tự soạn duy nhất: 8 ghi chú phát âm (`content/pinyin.yaml`, AI soạn, có nhãn "chưa duyệt") và tên gọi khác của bộ thủ (`content/radicals.yaml`, theo Wikipedia). `content/*-fixes.yaml` sửa lỗi dữ liệu nguồn, có kiểm tra hồi quy.

`npm run data` dựng dữ liệu vào `public/data/` (không commit, khoảng 10 giây khi có cache). Đổi nguồn: sửa lock rồi `npm run data -- --update-lock`; dựng lại: `--force`; không mạng: `--offline`. Pipeline ghi `scripts/data/summary.json` và `src/lib/tone-table.ts` (được commit; CI báo lỗi nếu khác kết quả pipeline). Nguồn mà repo gốc không còn tải được có bản lưu trong [`vendor/sources/`](vendor/sources/).

## Lưu trên máy

IndexedDB `chuhan` (Dexie): `words` (từ đã đánh dấu), `contexts` (câu gặp từ), `attempts` (lượt tập viết, gõ; giữ 5.000 lượt gõ gần nhất, không cắt lượt viết), `daily` (tổng hợp theo ngày), `bests` (kỷ lục gõ), `notes` (ghi nhớ), `settings`. Service worker (Serwist) cache app và dữ liệu đã mở để dùng offline.

## Chạy trên máy

Node 22.12 trở lên.

```sh
npm install
npm run dev        # http://localhost:4321/chuhan/ (tự chạy npm run data trước)
npm run build      # ra dist/ (kèm service worker)
npm run check      # kiểm tra kiểu
npm test           # test đơn vị (kèm kiểm tra dữ liệu đã sinh)
npm run budgets    # ngân sách hiệu năng (sau khi build)
npx playwright test   # test giao diện trên dist/ (iphone: mọi test; desktop: test gắn @desktop)
```

## CI và deploy

Workflow [`ci.yml`](.github/workflows/ci.yml): `build` (dữ liệu, build một lần, ngân sách) và `check` (kiểu, test đơn vị) chạy song song; `e2e` dùng lại bản build, chia 2 shard song song; push lên `main` mà mọi job xanh thì deploy đúng bản build đó lên nhánh `gh-pages`.

Một lần: Settings → Actions → General → Workflow permissions: **Read and write**; sau lần CI đầu, Settings → Pages → Deploy from a branch: `gh-pages`, `/ (root)`.

## Giấy phép

Code: MIT. Dữ liệu giữ giấy phép của nguồn gốc (CC BY-SA 4.0, Arphic Public License, LGPL-3.0, MIT, Unicode-3.0); xem `/ban-quyen/` trên site.
