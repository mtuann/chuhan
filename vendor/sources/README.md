# Bản lưu nguồn dữ liệu

Bản sao nén (gzip) của các tệp nguồn mà repo gốc không còn tải được, để `npm run data` (và CI) vẫn chạy được.
Đường dẫn: `<id nguồn>/<12 ký tự đầu của commit>/<tệp>.gz`, đúng commit và sha256 ghi trong `sources.lock.json`
(bước fetch giải nén rồi kiểm sha256 như tệp tải về; xem `scripts/data/sources.ts`).

| Nguồn | Tác giả | Giấy phép | Ghi chú |
|---|---|---|---|
| `cvdict` (CVDICT.u8) | Phong Phan (ph0ngp/CVDICT) | CC BY-SA 4.0 | repo gốc trả 404 từ 10/2026 |
| `hanviet` (hanviet.csv, LICENSE) | Phong Phan (ph0ngp/hanviet-pinyin-wordlist) | MIT (kèm tệp LICENSE) | repo gốc trả 404 từ 10/2026 |

Giấy phép và ghi công đầy đủ: trang `/ban-quyen/` của site (sinh từ `sources.lock.json`).
