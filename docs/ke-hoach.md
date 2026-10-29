# Chữ Hán: kế hoạch và trạng thái

Cập nhật 28/10/2026. App tách từ Học tiếng Hán, chỉ giữ các công cụ "nhìn chữ": Đọc, Viết, Gõ, Âm, Bộ thủ (cùng Tra từ,
trang từ, trang chữ). Không có lộ trình, ôn tập SRS, bài học, ngữ pháp, bài đọc soạn sẵn.

- Repo: https://github.com/mtuann/chuhan · địa chỉ: https://mtuann.github.io/chuhan/ (GitHub Pages, tài khoản Pro).

## 1. Đã chốt

| Câu hỏi | Chốt |
|---|---|
| Nội dung AI | Bỏ toàn bộ nội dung bài học. Giữ 8 ghi chú phát âm (đã soát, nhãn "AI soạn · chưa duyệt") và tên gọi khác của bộ thủ (theo Wikipedia). Nghĩa tiếng Việt lấy từ CVDICT (nhãn "máy dịch") + `content/gloss-fixes.yaml` |
| Câu thật cho gõ câu | Chưa có. Bỏ chế độ gõ câu, nhắn tin, bẫy dấu câu (đều dùng câu AI soạn); gõ theo đoạn văn tự dán thay thế. Có thể thêm Tatoeba sau (mục 5) |
| Repo | Repo mới, chép code cần dùng từ Học tiếng Hán; sửa lõi chung thì sửa cả hai nơi khi cần |
| Lưu trạng thái | IndexedDB `chuhan` (tên riêng vì mọi site dưới mtuann.github.io chung origin): từ ☆ đang học / ✓ đã biết kèm câu gặp từ, chữ đã tập viết và lần chấm gần nhất, lượt gõ, kỷ lục, ghi nhớ chữ, cài đặt, "Tiếp tục" lần luyện gần nhất. Sao lưu ra `.json.gz` |
| "Đã biết" khi đọc | Từ đánh dấu ✓ hoặc thuộc HSK 1…N (Cài đặt → Tôi đã biết); đánh dấu riêng luôn ưu tiên |
| Công nghệ | Giữ: Astro 7, React 19, Tailwind 4, Dexie (nạp lười), Serwist, hanzi-writer, MiniSearch. Bỏ ts-fsrs, dexie-react-hooks, fast-check |
| CI | Một workflow: build ∥ check (kiểu + unit) → e2e (2 shard song song, dùng lại bản build) → deploy. Bỏ workflow xem trước PR |

## 2. Tính năng (đã làm)

| Tab | Đường dẫn | Nội dung |
|---|---|---|
| Đọc | `/` | Dán văn bản → pinyin theo ngữ cảnh có màu thanh, Hán Việt dưới từ chưa biết, % đã biết; chạm từ: tra, cách đọc khác, đánh dấu, trang chữ, cách viết; đánh dấu cả danh sách từ chưa biết; đã đọc gần đây; sang Gõ, Xem cách viết |
| Viết | `/viet/`, `/viet/cau/`, `/viet/in/` | Tập viết 3 bước, xem cách viết một câu, in 田字格 |
| Gõ | `/go/` | Bộ gõ pinyin (gợi ý kèm Hán Việt, nghĩa), gõ từ (cấp, từ đang học, chữ hay sai), gõ đoạn văn, bẫy cùng âm (đề: pinyin + Hán Việt + nghĩa), thử thách 1 phút, lỗi hay gặp, dấu câu, cài bộ gõ |
| Âm | `/am/` | Bảng pinyin giọng người thật, ghi chú âm khó, mẹo -n/-ng |
| Tôi | `/toi/` | Từ của tôi (đang học / đã biết, câu gặp từ), chữ đã tập (viền theo lần chấm, tập lại chữ chưa tốt), Cài đặt, Sao lưu, Giới thiệu, Nguồn & giấy phép, Ủng hộ |
| (đầu trang) | `/tra/`, `/tu/`, `/chu/`, `/bo-thu/` | Tra từ; trang từ; trang chữ (mẹo đoán thanh từ Hán Việt luôn mở); 214 bộ thủ kèm các chữ HSK của từng bộ (mới) |

Trên điện thoại: thanh tab 5 mục (Đọc, Viết, Gõ, Âm, Tôi), nút tìm ở đầu trang. Màn rộng: thanh bên có thêm Tra từ, Bộ thủ.

## 3. Đo được (bản đầu)

- JS mỗi trang 83–120 KB gzip (ngân sách 170 KB); dữ liệu 9.896 tệp JSON, tệp lớn nhất 52 KB gzip; toàn site 71 MB (âm thanh 24 MB, nét chữ 46 MB, đều tải theo nhu cầu).
- Test: 208 unit, 40 e2e (iphone + desktop cho test gắn `@desktop`), khoảng 2 phút.

## 4. Lưu ý để app đẹp, gọn (áp dụng khi sửa tiếp)

1. Một cách thể hiện chữ cho mọi trang: pinyin màu thanh (`colorizePinyin`, `TONE_CLASS`), Hán Việt nhỏ màu nhạt dưới chữ, gạch chấm = chưa biết, nền nhạt = đang học. Không thêm kiểu hiển thị thứ hai.
2. Mỗi trang một việc chính, nút chính một màu (accent); nút phụ viền. Nút cao tối thiểu 44 px (`min-h-11`).
3. Nhãn nguồn chỉ hiện chỗ cần: "máy dịch" ở nghĩa CVDICT, "AI soạn · chưa duyệt" ở ghi chú phát âm.
4. Không điểm số, streak, nhắc nhở. Thống kê chỉ để người dùng tự xem (Tôi, Gõ).
5. Trang mới: thêm vào `PAGES` của `tests/e2e/smoke.spec.ts` (mở được, không lỗi console, chạy offline) thay vì viết test riêng cho việc mở trang.
6. Mọi khoá lưu trữ có tiền tố riêng của app (DB `chuhan`, sự kiện `chuhan:toast`).
7. Đổi địa chỉ (tên miền riêng) sau khi đã có người dùng làm mất dữ liệu trên máy của họ: nếu đổi thì báo trước và nhắc sao lưu.

## 5. Việc tiếp theo (chưa làm)

| Việc | Ghi chú |
|---|---|
| Dựng sẵn HTML cho trang bộ thủ và 3.150 trang chữ HSK (`/chu/学/`) | Để máy tìm kiếm đọc được; hiện mọi trang dựng phía trình duyệt. Cần đổi `/chu/?c=` sang đường dẫn tĩnh, giữ chuyển hướng cũ |
| Ảnh xem trước khi chia sẻ link (og:image riêng) | Hiện dùng biểu tượng app |
| Câu thật từ Tatoeba (CC BY 2.0 FR) | Cho gõ câu, bẫy dấu câu, câu ví dụ ở trang từ; cần kiểm tra tải được, giấy phép, lọc chất lượng |
| Duyệt 8 ghi chú phát âm | Duyệt xong đổi `status: reviewed` trong `content/pinyin.yaml` để bỏ nhãn |
| "Nghe phân biệt thanh" ở trang Âm | Dùng lại module luyện tai của Học tiếng Hán, không tính khoá, không lưu tiến độ |
