# Dạng đề cần phát triển (ghi khi nhập đề từ Drive, 2026-10-27)

## Đã làm (2026-10-27)

| Dạng đề | Loại câu | Đã nhập lại |
|---|---|---|
| Chạm/khoanh vào chỗ trên hình | `hotspot` | Number Scramble `-3` (9 phiếu) |
| Bài tự sinh phép tính | `arith_gen` | File Excel tự tạo: cộng ≤10, trừ ≤10, cộng trừ ≤20, cộng trừ ≤100 |
| Mê cung vẽ đường | `maze` | `mazes.pdf`: 16/40 trang dễ (vuông 1–5, tam giác 11–14, tròn 21–24, lục giác 31–33) |
| Tô theo nét, tô bằng hai tay | `trace` | Tập tô số 0–9, 10–20; Rèn luyện hai bán cầu não (16 trang) |

Định dạng và cách chấm: [spec.md §4](spec.md).

## Còn lại trong `docs/processing/` (đã có loại câu, chưa nhập dữ liệu)

| File | Việc cần làm |
|---|---|
| `TRÒ CHƠI TÌM HÌNH/` (9 file tìm hình ẩn) | `hotspot`: tranh là ảnh phẳng, phải khoanh tay vị trí từng đồ vật trên mỗi trang. |
| `TRÒ CHƠI TƯ DUY MẦM NON/00_Tro Choi Me Cung_File 1…pdf` (80 trang ảnh) | Mê cung "con nào tới đích" có đánh số lối → `single_choice`; phải giải bằng mắt từng trang. |
| `TRÒ CHƠI TƯ DUY MẦM NON/03. Hình khối con gà…`, `Chia sẻ Học liệu khám phá 4-6t…` | Chưa xem kỹ; có thể dùng `trace`. |
| `mazes.pdf` trang 6–10, 15–20, 25–30, 34–40 | Mê cung khó hơn; công cụ giải tự động đã có, nhập thêm khi các bé lớn hơn. |
| `TOÁN TẬP ĐẾM MẦM NON/nối số tổng hợp…pdf`, `tổng hợp…/NOI SO.docx` (≈70 tranh nối điểm) | `trace`: nét mẫu là đường nối các chấm theo thứ tự số; cần lấy toạ độ và số của từng chấm. |
| `TOÁN TẬP ĐẾM MẦM NON/TẬP ĐẾM 1-10 VÀ TÌM HÌNH…pdf` trang 8, 9, 11, 14, 15, 17, 21–23 | `hotspot` tìm hình không có cặp; công cụ tự tìm chưa chắc ở các trang này, cần soát tay. |
