# Ghi chú cho agent

## Nhập bài tập từ file

Thư mục:

| Thư mục | Ý nghĩa |
|---|---|
| `docs/processing/` | File đang chờ nhập. Phụ huynh bỏ file vào đây. |
| `docs/loaded/` | File đã nhập xong vào hệ thống. Không nhập lại các file ở đây. |

Cả hai thư mục đều nằm trong `.gitignore`, nên file đề không được commit.

Cách tách câu, chọn loại câu hỏi, upload ảnh: theo hướng dẫn của MCP server `for-kids` và bảng đối chiếu ở [docs/spec.md §14.2](docs/spec.md).

### 1. Chống trùng (bắt buộc, làm trước khi tạo bài)

**Trùng file.** So nội dung file (hash hoặc kích thước + số trang) với các file trong `docs/loaded/`. Nhiều file chỉ khác tên. Ví dụ `Học giờ 1…pdf` trùng với `03. PHiên bản mới học giờ.pdf` (xem spec §14.1). Nếu trùng, bỏ qua bước nhập và chuyển thẳng sang bước 3.

**Trùng câu hỏi.** Một đề có thể có lại câu đã nhập từ file khác.
1. Gọi `list_worksheets` **không lọc trạng thái** (để thấy cả bài nháp và đã lưu trữ). Chọn các bài có chủ đề hoặc tiêu đề gần với file.
2. Với từng bài ứng viên, gọi `get_worksheet` để xem `sourceNote` và nội dung câu. `list_worksheets` không trả `sourceNote`.
3. Coi hai câu là trùng nếu cùng loại và cùng nội dung chính:
   - `split_strategy`: cùng `op`, `a`, `b`
   - `column_arith`: cùng `op` và `operands`
   - `fill_blank`, `number_input`: cùng nội dung đề (bỏ qua khoảng trắng) và cùng đáp án
   - câu có `prompt.clock`: cùng `{h, m}` và cùng loại câu
   - `single_choice`, `multi_choice`, `true_false`: cùng đề và cùng các phương án
   - `hotspot`, `maze`: cùng `image` (ảnh khử trùng theo nội dung nên cùng ảnh nguồn thì cùng assetId)
   - `trace`: cùng `image` và cùng nét mẫu
   - `coloring`: cùng `image`
   - `arith_gen`: cùng `ops`, `min`, `max`, `missing`

Xử lý:
- **Toàn bộ đã có:** không tạo bài. Báo lại cho phụ huynh là trùng với bài nào, rồi chuyển file sang bước 3.
- **Một phần đã có:** chỉ tạo bài với các câu mới. Không tạo lại câu cũ. Nếu muốn ghép câu mới vào bài cũ, nhớ rằng `update_worksheet` với `questions` **thay toàn bộ** danh sách câu, nên phải gửi cả câu cũ lẫn câu mới.
- **Bộ đề nhiều biến thể** (Make 10 bản A…Y): chỉ nhập 1–2 bản. Các bản còn lại coi như đã xử lý.

### 2. Nhập

- Luôn điền `sourceNote` theo dạng `<tên file> — trang x–y`. Lần sau agent dựa vào trường này để chống trùng.
- Bài tạo ra là nháp. Chỉ `publish_worksheet` / `assign_worksheet` khi phụ huynh yêu cầu.

### 3. Chuyển file sau khi xong

- Chỉ chuyển khi mọi bài từ file đã tạo thành công (hoặc file bị bỏ qua vì trùng): `mv "docs/processing/<file>" "docs/loaded/"`.
- Nếu trong `docs/loaded/` đã có file cùng tên nhưng khác nội dung, thêm hậu tố ` (2)`, ` (3)`… Không ghi đè.
- Nếu lỗi giữa chừng, để file lại trong `docs/processing/` và báo phần nào đã nhập (kèm id bài) để lần sau không nhập lại.

Cuối cùng báo cho phụ huynh, cho mỗi file: số bài và số câu đã tạo (kèm id), số câu bỏ qua vì trùng (trùng với bài nào), và file đã được chuyển đi chưa.
