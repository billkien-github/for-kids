# For-Kids — Đặc tả (v0.3, nháp)

> Web app học tập mở trên trình duyệt (iPad), có profile cho từng bé, phụ huynh quản lý bài tập, agent AI tải bài lên qua MCP, và theo dõi kết quả học tập theo từng bé.

## 1. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Đăng nhập | Phụ huynh đăng nhập email + mật khẩu → chọn profile bé (kiểu Netflix). Mỗi bé có PIN 4 số (tuỳ chọn). Khu phụ huynh khoá bằng PIN riêng. |
| Phạm vi | Dùng cho 1 gia đình, nhưng DB thiết kế theo `family` để sau mở rộng được. |
| Thiết bị | Tablet / iPad. Truy cập bằng link trên trình duyệt (không cần PWA, không offline, không push). |
| Đọc đề (TTS) | Chỉ dùng Web Speech API của trình duyệt (giọng có sẵn trên iPad). Không dùng dịch vụ TTS trên server, không cần API key. |
| Môn | Toán, Tiếng Việt, Tiếng Anh (vẫn cho thêm môn mới). Đề có thể **song ngữ Anh–Việt**: mỗi bài chọn ngôn ngữ chính (`worksheet.lang`), dòng dịch để ở `sub`. |
| Chủ đề / kỹ năng | Không bám theo bộ sách giáo khoa nào. Seed sẵn theo các dạng bài trong mẫu (§3). Agent tạo thêm khi cần. |
| Bố cục làm bài | Mỗi bài chọn một trong hai chế độ: mỗi màn 1 câu, hoặc **lưới** (nhiều câu trên một màn) cho bài luyện tính nhanh. |
| Giới hạn thời gian | Có từ P1: đếm ngược và tự nộp khi hết giờ (ví dụ Math Minutes 1 phút, TIMO 60 phút). |
| Loại câu hỏi | Trắc nghiệm 1 đáp án / nhiều đáp án, đúng–sai, điền chỗ trống, nhập số, nối cột, sắp xếp thứ tự, **tách–gộp qua 10**, **quay kim đồng hồ**, **đặt tính dọc**, cộng thêm thẻ **bài học** không chấm. Tất cả do máy chấm. Chi tiết ở §4, đối chiếu với mẫu ở §14. |
| Giao bài | Phụ huynh giao bài (có hạn nộp), bài được giao hiện ở mục "Bài hôm nay". Bé vẫn được tự chọn thêm trong thư viện theo lớp. |
| Phản hồi | Làm hết bài, **nộp xong mới chấm**, sau đó hiện đáp án đúng và lời giải. |
| Làm lại | Được làm lại không giới hạn, lưu mọi lần làm. Báo cáo năng lực dùng **lần đầu**; bé thấy điểm của **lần cao nhất**. |
| Thang điểm | % đúng → 1–3 sao. Mỗi câu gắn tag kỹ năng để tính mức thành thạo. |
| Động viên | Sao, chuỗi ngày học (streak), huy hiệu, đổi sao lấy quà, tự động ôn câu sai. |
| MCP | Chạy trong backend qua Streamable HTTP (`/mcp`), xác thực bằng API token. Agent tự đọc file (PDF/ảnh/Word/Excel) hoặc tự soạn đề. Có tool tạo/sửa, giao bài, đọc kết quả, xuất bản. Bài tạo qua MCP mặc định là **nháp**; agent có tool `publish_worksheet` để duyệt. |
| Hạ tầng | Chạy trên máy Windows tại nhà (Docker Desktop + WSL2) bằng Docker Compose, public qua ngrok (app không phụ thuộc tunnel nào, đổi được). File lưu trên ổ đĩa, có lớp trung gian để sau chuyển sang S3/R2. |
| Stack | pnpm monorepo, TypeScript. BE: Node 22 + Fastify + Drizzle ORM + PostgreSQL 16 + `@modelcontextprotocol/sdk`. FE: React + Vite + TanStack Query + React Router + dnd-kit + Tailwind. `packages/shared` chứa schema Zod dùng chung. |

## 2. Vai trò và phiên đăng nhập

- **Phụ huynh** (`parent_user`): đăng nhập bằng email + mật khẩu (băm argon2). Phiên lưu ở server (bảng `session`), cookie httpOnly sống 90 ngày, để iPad không phải đăng nhập lại.
- **Chọn bé**: màn chọn profile hiển thị avatar các bé. Bé có PIN thì nhập PIN. Phiên lưu `active_child_id`. Mọi API `/api/kid/*` đều giới hạn trong bé đang chọn.
- **Khu phụ huynh**: phải nhập PIN phụ huynh. Phiên lưu `parent_unlocked_until` (15 phút, gia hạn khi còn thao tác). Mọi API `/api/parent/*` đều kiểm tra mốc này.
- **Đổi bé / thoát**: nút trên header, quay về màn chọn profile.
- **PIN sai**: giới hạn 5 lần mỗi 5 phút cho mỗi profile.
- **Agent (MCP)**: Bearer token do phụ huynh tạo trong phần Cài đặt. Token chỉ lưu dạng hash, có scope và thu hồi được.

## 3. Mô hình dữ liệu

Kiểu dữ liệu chung: `id` dùng uuid, timestamp dùng `timestamptz`. Múi giờ nghiệp vụ (tính streak, "hôm nay") là `Asia/Ho_Chi_Minh`.

### Tài khoản
- `family(id, name, timezone, star_thresholds smallint[] default {50,75,90}, created_at)`
- `parent_user(id, family_id, email unique, password_hash, parent_pin_hash, created_at)`
- `child(id, family_id, name, avatar, grade smallint, pin_hash null, created_at, archived_at null)`: `grade = 0` là mầm non.
- `session(id, parent_user_id, active_child_id null, parent_unlocked_until null, expires_at, created_at)`: `id` là sha256 của token trong cookie, server không lưu token gốc.
- `api_token(id, family_id, name, token_hash, scopes text[], last_used_at, revoked_at, created_at)`

### Nội dung
- `subject(id, family_id null, code, name, tts_lang)`: seed sẵn `math`, `vi` (`vi-VN`), `en` (`en-US`). `family_id` null nghĩa là môn dùng chung.
- `topic(id, family_id, subject_id, grade_min, grade_max, name, sort_order)`: unique `(family_id, subject_id, name)`.
- `skill(id, family_id, subject_id, topic_id null, code, name, grade null)`: unique `(family_id, code)`. Ví dụ `math.add.carry`, `vi.spell.tr-ch`.
- `worksheet(id, family_id, subject_id, topic_id null, grade, title, description, lang null, layout one_per_screen|grid, status draft|published|archived, source manual|mcp, source_note, time_limit_sec null, created_by_token_id null, published_at, updated_at)`:
  - `lang` ghi đè ngôn ngữ đọc của môn (ví dụ bài Toán bằng tiếng Anh thì `lang = en-US`).
  - `layout` mặc định `one_per_screen`. Chế độ `grid` chỉ cho phép các loại câu ngắn: `fill_blank`, `number_input`, `true_false`, `single_choice`, `split_strategy`, `column_arith`. Kiểm tra khi lưu bài.
- `question(id, worksheet_id, sort_order, type, body jsonb, explanation text, points numeric default 1, tts_lang null)`: `body` theo schema ở §4.
- `question_skill(question_id, skill_id)`
- `asset(id, family_id, kind image, storage_key, mime, bytes, sha256, created_at)`: khử trùng lặp theo `sha256`.

**Seed sẵn cho môn Toán** (lấy từ các dạng bài trong mẫu, không theo bộ sách nào; `grade` 0 = mầm non):

| Chủ đề | Lớp | Mã kỹ năng |
|---|---|---|
| Đếm và nhận biết số | 0–1 | `math.count`, `math.number.read` (đọc/viết số bằng chữ) |
| So sánh số | 0–2 | `math.compare` |
| Quy luật | 0–2 | `math.pattern.number`, `math.pattern.shape` |
| Cộng, trừ trong phạm vi 10 | 0–1 | `math.add.within10`, `math.sub.within10`, `math.missing_number` |
| Tách–gộp qua 10 | 1 | `math.make10.add`, `math.make10.sub` |
| Tách–gộp qua số tròn chục | 1–2 | `math.make_tens.add`, `math.make_tens.sub` |
| Đặt tính dọc | 2 | `math.column.add`, `math.column.sub`, `math.add.carry`, `math.sub.borrow` |
| Giá trị theo hàng | 1–2 | `math.place_value` |
| Xem giờ | 1–2 | `math.clock.hour`, `math.clock.half`, `math.clock.quarter`, `math.clock.5min`, `math.time.ampm`, `math.time.elapsed` |
| Đơn vị thời gian, lịch | 1–2 | `math.time.units`, `math.calendar` |
| Hình học | 0–2 | `math.shape.identify`, `math.shape.count` |
| Phân số đơn giản | 2 | `math.fraction.basic` |
| Tiền | 2 | `math.money` |
| Biểu đồ | 2 | `math.graph.read` |
| Bài toán có lời văn | 0–2 | `math.word_problem` |

### Giao bài và làm bài
- `assignment(id, worksheet_id, child_id, assigned_by parent|token, due_at null, created_at, cancelled_at null)`
- `attempt(id, child_id, worksheet_id null, assignment_id null, kind normal|review, attempt_no, started_at, deadline_at null, submitted_at null, auto_submitted bool, duration_sec, total_points, earned_points, score_pct, stars)`: `deadline_at = started_at + time_limit_sec`, tính lúc bắt đầu làm bài.
- `attempt_answer(id, attempt_id, question_id, question_snapshot jsonb, response jsonb, score numeric 0..1, is_correct bool, time_ms)`: lưu **ảnh chụp câu hỏi** tại thời điểm làm, để sau này sửa bài thì lịch sử vẫn đúng.

### Kết quả và động viên
- `skill_mastery(child_id, skill_id, mastery real 0..1, answered int, correct int, last_seen_at)`: PK `(child_id, skill_id)`.
- `review_item(child_id, question_id, box smallint 1..5, due_on date, wrong_count, last_answered_at)`: PK `(child_id, question_id)`.
- `star_ledger(id, child_id, delta int, reason worksheet|review|badge|redeem|manual, ref_id, note null, created_at)`: số dư sao = tổng `delta`; `note` là mô tả ngắn để hiện lịch sử (tên bài, huy hiệu, quà).
- `badge(id, code, name, icon, rule jsonb, bonus_stars)` và `child_badge(child_id, badge_id, earned_at, attempt_id null)`: `attempt_id` là lần làm bài khiến bé đạt huy hiệu.
- `reward(id, family_id, name, icon, cost_stars, active)` và `reward_redemption(id, child_id, reward_id, cost_stars, status pending|approved|rejected, created_at, decided_at)`
- `mcp_audit(id, token_id, tool, args_summary jsonb, ok bool, created_at)`

## 4. Schema câu hỏi (`packages/shared`)

Mọi câu hỏi có chung trường `prompt`. Riêng `body` khác nhau theo `type`. Cùng một schema Zod được dùng để validate ở API, ở MCP và trong form soạn bài.

```ts
// Phải có ít nhất một trong text / imageAssetId / clock (phương án trả lời chỉ có hình là hợp lệ, xem đề TIMO).
type RichText = {
  text?: string           // có thể chứa phân số dạng [[2/5]], FE vẽ thành phân số đứng
  sub?: { text: string; lang: string }   // dòng dịch in nghiêng bên dưới (đề song ngữ Anh–Việt)
  imageAssetId?: string
  clock?: { h: number; m: number }       // FE tự vẽ đồng hồ kim bằng SVG, không cần upload ảnh
  ttsText?: string        // câu đọc khác câu hiển thị (ví dụ "3 + 5 = ?" → "ba cộng năm bằng mấy")
}

type Choice = { id: string; content: RichText }

type Blank = {
  id: string
  accept: string[]
  caseSensitive?: boolean
  input?: 'text' | 'number' | 'time' | 'choice'   // mặc định 'text'
  options?: string[]      // bắt buộc khi input = 'choice', ví dụ ['<', '>', '='] hoặc ['+', '-']
}

type QuestionBody =
  | { type: 'single_choice'; prompt: RichText; choices: Choice[]; answer: string; shuffle?: boolean }
  | { type: 'multi_choice';  prompt: RichText; choices: Choice[]; answer: string[]; shuffle?: boolean }
  | { type: 'true_false';    prompt: RichText; answer: boolean }
  | { type: 'fill_blank';    prompt: RichText; blanks: Blank[] }   // text chứa {{1}}, {{2}}… là vị trí ô trống
  | { type: 'number_input';  prompt: RichText; answer: number; tolerance?: number; unit?: string }
  | { type: 'matching';      prompt: RichText; left: Choice[]; right: Choice[]; pairs: [string, string][] }
  | { type: 'ordering';      prompt: RichText; items: Choice[]; answer: string[] }   // answer = thứ tự id đúng
  // Tách–gộp qua 10 (Make Ten). Server tự suy ra các ô, agent chỉ cần đưa phép tính.
  | { type: 'split_strategy'; prompt?: RichText; op: '+' | '-'; a: number; b: number }
  // Kéo kim đồng hồ cho đúng giờ.
  | { type: 'clock_set';     prompt: RichText; answer: { h: number; m: number };
      hands: 'hour' | 'both'; snapMinutes?: 1 | 5 | 15 | 30 }      // mặc định 5
  // Đặt tính dọc rồi tính.
  | { type: 'column_arith';  prompt?: RichText; op: '+' | '-'; operands: [number, number]; showCarry?: boolean }
  // Thẻ bài học / poster / flashcard: không chấm, không tính điểm, không vào danh sách ôn.
  | { type: 'info';          prompt: RichText; pages?: RichText[] }
  // Câu trên ảnh: toạ độ (điểm [x, y], hình chữ nhật {x, y, w, h}) theo pixel của ảnh `image`, gốc góc trên trái;
  // width/height là kích thước ảnh đó. tolerance (pixel) ≈ nửa bề rộng lối đi / nét chữ.
  | { type: 'hotspot'; prompt: RichText; image: string; width: number; height: number; targets: Rect[] }   // chạm vào các vùng đúng
  | { type: 'maze';    prompt: RichText; image: string; width: number; height: number;
      path: [number, number][]; tolerance: number }      // lối đi đúng, theo giữa lối, từ xuất phát tới đích
  | { type: 'trace';   prompt: RichText; image?: string; width: number; height: number;
      paths: [number, number][][]; tolerance: number }   // nét mẫu; không có ảnh thì app tự vẽ nét đứt
  // Bài tự sinh: lúc bé bắt đầu làm, server sinh `count` phép tính mới thành các câu fill_blank.
  // Cộng: tổng ≤ max; trừ: số trừ ≤ số bị trừ ≤ max. missing: ô trống ở kết quả (mặc định), ở một số hạng, hoặc trộn.
  | { type: 'arith_gen'; ops: ('+' | '-')[]; min?: number; max: number; count: number; missing?: 'result' | 'operand' | 'mixed' }
```

**Câu tự sinh (`arith_gen`)**: mỗi bài có tối đa 200 phép tính sinh ra. Câu sinh ra được chấm như `fill_blank`, tính vào mức thành thạo kỹ năng, nhưng không gắn với câu gốc nên không vào danh sách ôn (lần làm sau đã là đề mới). Số câu của bài (`questionCount`) tính theo `count`.

**`split_strategy`**: giữ nguyên `a`, tách `b` để `a` tròn chục. Gọi `T` là số tròn chục mà `a` được làm tròn tới.

| | Cộng `a + b` | Trừ `a − b` |
|---|---|---|
| `T` | số tròn chục ngay trên `a` | số tròn chục ngay dưới `a` |
| Dòng bé phải điền | `a + x + y = s` với `x = T − a`, `y = b − x`, `s = a + b` | `a − x − y = d` với `x = a − T`, `y = b − x`, `d = a − b` |
| Ví dụ | `7 + 6` → `7 + 3 + 3 = 13` | `13 − 7` → `13 − 3 − 4 = 6` |

Hợp lệ khi `0 < x < b`, tức là phép tính có qua chục. Giao diện giống mẫu Math-Drills: dòng phép tính, mũi tên "Giữ" / "Tách", 4 ô trống, nhãn "Tròn T". Áp dụng chung cho Make 10…90 và Make Multiples of Ten vì `T` được tính tự động.

Quy tắc chấm (chạy ở server, mỗi câu được điểm từ 0 đến 1):

| Loại | Cách chấm |
|---|---|
| `single_choice`, `true_false`, `number_input` | Đúng hết hoặc 0 điểm. `number_input` cho phép sai số `tolerance`. |
| `multi_choice` | Đúng hết hoặc 0 điểm (chọn thiếu hay thừa đều tính sai). |
| `fill_blank` | Điểm theo tỉ lệ số ô đúng. Bỏ khoảng trắng thừa ở đầu/cuối/giữa. Không phân biệt hoa thường trừ khi bật `caseSensitive`. **Dấu tiếng Việt phải đúng** (để chấm được chính tả). Ô kiểu `number` chấp nhận cả `,` và `.` làm dấu thập phân. Ô kiểu `time` chuẩn hoá về `H:MM` (chấp nhận `:` hoặc `.`, có hay không có số 0 ở đầu: `05:50` = `5.50` = `5:50`). Ô kiểu `choice` hiện thành các nút để bé chọn. |
| `matching` | Điểm theo tỉ lệ số cặp nối đúng. |
| `ordering` | Đúng hết hoặc 0 điểm. |
| `split_strategy` | Điểm theo tỉ lệ số ô đúng (4 ô: `a`, `x`, `y`, kết quả). |
| `clock_set` | Đúng hết hoặc 0 điểm. Kim phút phải đúng `m`. Kim giờ được tính đúng nếu lệch không quá ±15° so với vị trí chuẩn (vị trí chuẩn có tính phần phút, ví dụ 3:30 thì kim giờ nằm giữa số 3 và số 4). Với `hands = 'hour'`, kim phút được vẽ sẵn ở số 12. |
| `column_arith` | Đúng hết hoặc 0 điểm, chỉ chấm dãy số ở hàng kết quả. Ô nhớ (`showCarry`) chỉ để bé ghi nhớ, không chấm. |
| `info` | Không chấm. `points` luôn là 0. |
| `hotspot` | Điểm = max(0, số vùng được chạm trúng − số lần chạm ra ngoài mọi vùng) / số vùng. Chạm nhiều lần vào cùng một vùng không bị trừ. Bé chỉ biết số vùng cần tìm, không thấy vùng. |
| `maze` | Đúng hết hoặc 0 điểm. Đúng khi: ≥ 90% nét vẽ nằm trong `tolerance` quanh lối đúng, phủ ≥ 85% lối đúng, và có điểm tới gần đích (≤ 2 × `tolerance`). Nhấc tay giữa chừng không sao. Bé thấy điểm đầu/cuối, không thấy lối đi. |
| `trace` | Độ chính xác (tỉ lệ nét vẽ nằm trong 1,5 × `tolerance` quanh nét mẫu) dưới 70% thì 0 điểm; còn lại điểm theo độ phủ nét mẫu (phủ ≥ 85% là đủ điểm), làm tròn xuống từng 1/4. |
| `arith_gen` | Không chấm trực tiếp: đã sinh thành các câu `fill_blank`. |

`is_correct` = (`score` == 1). **Trước khi bé nộp bài, API dành cho bé không bao giờ trả về `answer`, `accept`, `pairs`.** Với `split_strategy` và `column_arith`, đáp án được suy ra từ đề nên không cần giấu.

**Hiển thị Toán** (chốt sau khi xem mẫu):
- Phân số: viết `[[2/5]]` trong `text`, FE vẽ thành phân số đứng. Không dùng KaTeX vì nội dung chỉ ở mức lớp 1–2.
- Đặt tính dọc: dùng loại `column_arith`. Bé nhập kết quả từ phải sang trái, mỗi ô một chữ số.
- Đồng hồ: dùng `RichText.clock`, FE tự vẽ bằng SVG. Có thể dùng trong đề, trong phương án trả lời và trong cột nối, nên không phải cắt ảnh đồng hồ từ PDF.
- Hình vẽ khác (đồ vật để đếm, quy luật hình, khối lập phương, biểu đồ): agent cắt ảnh từ file nguồn rồi gọi `upload_asset`. Phương án trả lời có thể chỉ gồm hình.
- Dấu so sánh `<`, `>`, `=` và dấu phép tính còn thiếu: dùng ô trống `input: 'choice'`.

## 5. Kết quả học tập

### 5.1 Điểm một lần làm
- `score_pct = Σ(score × points) / Σ points × 100`
- **Sao**: ≥ 50% được 1 sao, ≥ 75% được 2 sao, ≥ 90% được 3 sao. Ngưỡng cấu hình được theo gia đình.
- **Cộng sao vào số dư**: mỗi bộ bài chỉ cộng phần chênh lệch so với số sao cao nhất từng đạt. Ví dụ lần đầu được 1 sao, làm lại được 3 sao thì cộng thêm 2. Làm lại để cải thiện có thưởng, nhưng không cày lặp mãi được.

### 5.2 Báo cáo
- **Lần chính thức** = `attempt_no = 1` của mỗi bộ bài. Báo cáo năng lực (điểm trung bình theo môn/chủ đề, xu hướng) chỉ dùng lần chính thức.
- **Màn của bé** hiển thị điểm và sao cao nhất của từng bộ bài.

### 5.3 Mức thành thạo kỹ năng
- Mỗi câu trả lời trong lần chính thức hoặc trong phiên ôn tập sẽ cập nhật mọi kỹ năng gắn với câu đó: `mastery ← mastery + 0.3 × (score − mastery)`. Giá trị khởi đầu là 0.5.
- Phân mức (chỉ phân mức khi đã trả lời ≥ 5 câu của kỹ năng đó):

| Mức | Điều kiện |
|---|---|
| Cần luyện | mastery < 0.5 |
| Đang tiến bộ | 0.5 ≤ mastery < 0.8 |
| Thành thạo | mastery ≥ 0.8 |

### 5.4 Tự động ôn câu sai (hộp Leitner)
- Mỗi câu sai (`score < 1`) ở bất kỳ lần làm nào → `review_item` vào hộp 1, hạn ôn là ngày mai.
- Trong phiên ôn: đúng thì lên 1 hộp, hạn ôn tiếp theo cách 1 / 3 / 7 / 14 ngày tương ứng với hộp 2 / 3 / 4 / 5. Đúng ở hộp 5 thì xoá khỏi danh sách ôn. Sai thì về lại hộp 1.
- Mục "Ôn tập" trên màn của bé tạo một phiên gồm tối đa 10 câu đến hạn (`attempt.kind = review`), cũng nộp xong mới chấm. Làm xong phiên ôn được +1 sao.

### 5.5 Streak và huy hiệu
- Một ngày được tính là ngày học nếu có ít nhất 1 lần nộp bài (kể cả phiên ôn). Streak = số ngày học liên tiếp tính đến hôm nay hoặc hôm qua.
- Huy hiệu được xét sau mỗi lần nộp, theo `rule` jsonb. Seed sẵn: `first_worksheet`, `perfect_1`, `perfect_10`, `streak_7`, `streak_30`, `skill_master_5`, `review_hero_50`. Mỗi huy hiệu đạt được tặng thêm sao theo cấu hình.

### 5.6 Đổi quà
- Phụ huynh tạo danh sách quà kèm giá (số sao).
- Bé bấm đổi → tạo `reward_redemption(pending)`. Phụ huynh duyệt → ghi `star_ledger` với `delta` âm. Bé không đổi được quà vượt quá số sao đang có (tính cả các yêu cầu đang chờ duyệt).

## 6. Màn hình

Thiết kế cho iPad, dùng được cả màn dọc và ngang. Vùng chạm ≥ 48px, chữ cho bé ≥ 20px.

### Bé
1. **Chọn profile**: lưới avatar → bàn phím PIN (nếu bé có PIN).
2. **Trang chủ của bé**: header có avatar, số sao, streak 🔥. Bên dưới có các khối:
   - *Bài hôm nay*: bài được giao chưa làm, sắp xếp theo hạn nộp, đánh dấu bài quá hạn.
   - *Ôn tập*: số câu đến hạn ôn.
   - *Thư viện*: các bộ bài theo môn.
3. **Làm bài**:
   - *Mỗi màn 1 câu* (`one_per_screen`): có thanh tiến độ, nút 🔊 đọc đề, nút trước/sau. Nối cột, sắp xếp và kéo kim đồng hồ dùng kéo thả (dnd-kit, hỗ trợ cảm ứng).
   - *Lưới* (`grid`): tất cả câu hiện thành các thẻ trên một trang cuộn được, 2 cột khi màn ngang, 1 cột khi màn dọc. Bàn phím số tự nhảy sang ô tiếp theo. Mỗi thẻ có nút 🔊 riêng.
   - Câu trả lời được tự lưu lên server (`PUT answers`) nên tắt app giữa chừng vẫn làm tiếp được. Trước khi nộp có màn xem lại, đánh dấu những câu chưa làm.
   - *Giới hạn thời gian*: bài có `time_limit_sec` thì hiện đồng hồ đếm ngược trên header, đổi màu khi còn 10% thời gian. Hết giờ thì FE tự nộp. Server cũng tự kiểm tra: khi gọi `submit` hoặc `GET attempt` sau `deadline_at` + 5 giây, server chấm theo các câu đã lưu trước hạn và đặt `auto_submitted = true`. Mỗi lần làm lại có đủ thời gian như lần đầu. Phiên ôn tập không giới hạn thời gian.
4. **Kết quả**: % đúng, hiệu ứng sao, danh sách câu (đúng/sai, đáp án của bé, đáp án đúng, lời giải), các nút "Làm lại" và "Về trang chủ".
5. **Thành tích**: huy hiệu, lịch sử sao, danh sách quà và nút đổi quà.

### Phụ huynh (sau khi nhập PIN)
1. **Tổng quan** (chọn bé): điểm trung bình của lần chính thức theo môn, biểu đồ theo tuần, kỹ năng yếu, các lần làm gần đây, streak, bài được giao chưa làm hoặc đã quá hạn.
2. **Bài tập**: danh sách lọc theo trạng thái nháp / đã xuất bản và theo môn. Có trình soạn bài (form theo từng loại câu hỏi), **xem trước dưới góc nhìn của bé**, xuất bản và lưu trữ.
3. **Giao bài**: chọn bộ bài, chọn bé, đặt hạn nộp; xem tình trạng làm bài.
4. **Quà**: quản lý danh sách quà, duyệt yêu cầu đổi quà.
5. **Hồ sơ các bé**: thêm, sửa, lưu trữ; đặt avatar, lớp, PIN.
6. **Cài đặt**: PIN phụ huynh, mật khẩu, ngưỡng sao, quản lý API token cho MCP (tạo token, xem token đúng một lần, thu hồi), nhật ký các lần gọi MCP.

## 7. REST API (`/api`)

| Nhóm | Endpoint |
|---|---|
| Đăng nhập | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Chọn profile | `GET /profiles`, `POST /profiles/:childId/select {pin?}`, `POST /parent/unlock {pin}`, `POST /parent/lock` |
| Bé | `GET /kid/home`, `GET /kid/worksheets?subject=`, `GET /kid/worksheets/:id` *(không kèm đáp án)*, `POST /kid/attempts {worksheetId, assignmentId?}`, `PUT /kid/attempts/:id/answers`, `POST /kid/attempts/:id/submit`, `GET /kid/attempts/:id`, `POST /kid/review` *(tạo phiên ôn)*, `GET /kid/achievements`, `POST /kid/rewards/:id/redeem` |
| Phụ huynh — nội dung | `GET/POST /parent/worksheets`, `GET/PUT/DELETE /parent/worksheets/:id`, `POST /parent/worksheets/:id/publish`, `.../unpublish`, `GET/POST /parent/topics`, `GET/POST /parent/skills`, `POST /parent/assets` *(multipart)* |
| Phụ huynh — giao bài | `GET/POST /parent/assignments`, `DELETE /parent/assignments/:id` |
| Phụ huynh — báo cáo | `GET /parent/children/:id/report?from&to`, `GET /parent/children/:id/attempts` |
| Phụ huynh — khác | CRUD `/parent/children`, `/parent/rewards`, `POST /parent/redemptions/:id/{approve,reject}`, CRUD `/parent/tokens`, `GET /parent/mcp-audit` |
| File | `GET /assets/:id`: phải có phiên đăng nhập của gia đình sở hữu file |

## 8. MCP (`POST /mcp`, Streamable HTTP, header `Authorization: Bearer <token>`)

- Chế độ stateless, trả JSON (không SSE); `GET`/`DELETE` trả 405.
- `/agent` là bản sao của `/mcp`. Một số phần mềm diệt virus (đã gặp với Avast trên máy chủ ở nhà) chặn và làm hỏng response của mọi URL có đoạn "mcp", kể cả `127.0.0.1`. Agent chạy trên máy như vậy thì dùng `/agent`.
- Token tạo ở trang Cài đặt, dạng `fk_…`, có các scope `content:write`, `publish`, `assign`, `results:read`.

### Tools
| Tool | Scope | Mô tả |
|---|---|---|
| `list_children` | `results:read` | id, tên, lớp của các bé |
| `list_catalog` | `content:write` | Môn, chủ đề, kỹ năng hiện có (để agent gắn tag đúng) |
| `get_question_schema` | `content:write` | JSON Schema của bài tập kèm 1 ví dụ cho mỗi loại câu (giống resource bên dưới, vì nhiều client không tự đọc resource) |
| `upsert_topic`, `upsert_skill` | `content:write` | Tạo mới nếu chưa có |
| `upload_asset` | `content:write` | `{filename, mime, base64}` (≤ 10MB) → `assetId`. Chỉ nhận ảnh. |
| `create_worksheet` | `content:write` | `{subjectCode, grade, topic?, title, description?, lang?, layout?, timeLimitSec?, sourceNote?, questions[]}` → tạo bản **nháp**. Nếu sai schema thì trả lỗi chỉ rõ đường dẫn tới trường sai, kiểu `questions[3].blanks[0].accept`. |
| `list_worksheets`, `get_worksheet` | `content:write` | Lọc theo trạng thái, môn, lớp. `get_worksheet` trả đầy đủ cả đáp án. |
| `update_worksheet` | `content:write` | Sửa thông tin chung và/hoặc thay toàn bộ danh sách câu hỏi. Nếu bài đã có người làm thì vẫn cho sửa (lịch sử đã lưu ảnh chụp câu hỏi). |
| `publish_worksheet`, `unpublish_worksheet` | `publish` | Chỉ bài đã xuất bản mới hiện cho bé. |
| `assign_worksheet` | `assign` | `{worksheetId, childIds[], dueAt?}`. Chỉ giao được bài đã xuất bản. |
| `get_child_report` | `results:read` | Điểm theo môn/chủ đề, kỹ năng yếu, streak, bài quá hạn |
| `get_child_mistakes` | `results:read` | Các câu sai gần đây, kèm câu bé đã trả lời, để agent soạn bài luyện đúng chỗ yếu |

### Resources / Prompts
- Resource `forkids://schema/questions`: JSON Schema (sinh từ Zod) kèm 1 ví dụ cho mỗi loại câu hỏi.
- Prompt `import_worksheet`: hướng dẫn agent đọc file nguồn, tách từng câu, cắt hình minh hoạ rồi gọi `upload_asset`, gắn kỹ năng, viết lời giải ngắn cho trẻ, sau đó gọi `create_worksheet`. Kinh nghiệm rút ra từ mẫu:
  - Bỏ các trang quảng cáo, mã QR, điều khoản sử dụng và mục lục.
  - Nếu file có trang đáp án ("Answers", "Answer Key") thì dùng trang đó làm đáp án, không tạo câu hỏi từ trang đáp án.
  - Đồng hồ thì dùng `RichText.clock`, không cắt ảnh.
  - Bộ đề sinh tự động có nhiều biến thể giống nhau (ví dụ Make 10 bản A…Y) thì chỉ cần nhập 1–2 bản làm mẫu. Muốn luyện thêm thì dùng `generate_practice` để sinh phép tính mới.
  - Đề song ngữ thì để tiếng Anh ở `text`, tiếng Việt ở `sub` (hoặc ngược lại tuỳ `worksheet.lang`).
  - Dạng không chấm tự động được (tô số theo nét, tô màu, cắt dán thủ công) thì chuyển sang dạng chấm được gần nhất (xem §14), hoặc đưa vào thẻ `info`.
- Prompt `generate_practice`: hướng dẫn agent đọc `get_child_report` / `get_child_mistakes`, soạn bài luyện và giao cho bé.

Mỗi lần gọi tool đều ghi vào `mcp_audit`.

## 9. TTS (chỉ dùng trình duyệt)
- FE dùng `speechSynthesis`. Không có job tạo audio trên server, không lưu file audio.
- **Ngôn ngữ đọc**, theo thứ tự ưu tiên: `question.tts_lang` → `worksheet.lang` → `subject.tts_lang`. Dòng dịch `sub` được đọc bằng `sub.lang`.
- **Nội dung đọc**: dùng `ttsText` nếu có, không thì dùng `text` đã bỏ ký hiệu (`{{1}}` đọc thành "ô trống", `[[2/5]]` đọc thành "hai phần năm" hoặc "two fifths"). Đồng hồ trong `clock` không tự đọc, vì đọc ra giờ sẽ lộ đáp án.
- **Nút 🔊**: chạm 1 lần đọc đề theo ngôn ngữ chính. Đề song ngữ thì có thêm nút 🔊 nhỏ cạnh dòng `sub`. Môn Tiếng Anh thì chạm vào phương án trả lời cũng đọc to phương án đó.
- **Chọn giọng**: lấy giọng đầu tiên khớp `lang` trong `speechSynthesis.getVoices()`, ưu tiên giọng có chất lượng "Enhanced"/"Premium" trên iOS. Phụ huynh chọn được giọng cụ thể cho từng ngôn ngữ trong Cài đặt (lưu ở `localStorage` của từng thiết bị). Thiết bị không có giọng cho ngôn ngữ đó thì ẩn nút 🔊 và hiện gợi ý tải giọng trong Cài đặt iPad.
- Trên iOS, `speechSynthesis` chỉ chạy sau thao tác chạm của người dùng, nên không tự đọc đề khi chuyển câu.

## 10. Hạ tầng
- `docker-compose.yml` gồm:
  - `db`: postgres:16, volume riêng
  - `app`: Node 22, phục vụ cả `/api`, `/mcp` và bản build tĩnh của FE (một origin duy nhất, không cần CORS); volume `uploads`
  - `tunnel`: ngrok agent với static domain, token đặt qua `.env`
- **Lưu trữ file**: interface `Storage` (`put/get/delete`). Bản đầu dùng `LocalDiskStorage` ghi vào `/data/uploads`; sau này thêm `S3Storage`.
- **Sao lưu**: service `backup` trong compose chạy `pg_dump` hằng đêm cùng thư mục uploads, ghi ra một thư mục Windows được bind mount (đặt trên ổ khác với ổ chứa dữ liệu Docker). Giữ bản sao 14 ngày.
- **Máy chủ Windows** (máy dev hiện tại; lúc kiểm tra ngày 2026-10-25 chưa cài Docker và WSL2):
  - Cài WSL2 (`wsl --install`) và Docker Desktop, bật "Start Docker Desktop when you sign in". Các service đặt `restart: unless-stopped`.
  - Dữ liệu Postgres và uploads dùng named volume (nằm trong WSL2) để chạy nhanh; chỉ thư mục backup là bind mount ra ổ Windows.
  - Máy đang tự ngủ sau 3 giờ khi cắm điện. Muốn chạy 24/7 thì tắt chế độ ngủ: `powercfg /change standby-timeout-ac 0`.
  - Windows Update có thể tự khởi động lại máy: đặt Active Hours, hoặc chấp nhận app tạm mất kết nối một lúc rồi tự chạy lại sau khi đăng nhập.
- **Bảo mật**: argon2, rate-limit đăng nhập/PIN/MCP, `@fastify/helmet`, kiểm tra loại và kích thước file tải lên, token chỉ lưu hash.
- **Lưu ý ngrok miễn phí**: trình duyệt sẽ gặp trang cảnh báo của ngrok khi mở trang. Agent gọi MCP không bị ảnh hưởng vì không phải trình duyệt. Nếu trang cảnh báo gây phiền thì đổi sang Cloudflare Tunnel (cần tên miền riêng); không phải sửa code.

## 11. Cấu trúc repo
```
for-kids/
  apps/api/        Fastify: routes/, services/ (grading, mastery, review, rewards), mcp/, db/ (Drizzle schema + migrations, seed)
  apps/web/        React + Vite: routes/kid/*, routes/parent/*, components/questions/* (mỗi loại câu: Player + Editor)
  packages/shared/ Zod schemas, types, hằng số (ngưỡng sao, khoảng ngày ôn)
  docker-compose.yml, .env.example, docs/spec.md
```
Test: Vitest. Ưu tiên test hàm chấm điểm (kể cả `split_strategy` và chuẩn hoá ô `time`), tự nộp khi hết giờ, công thức mastery, hộp Leitner, cách cộng sao, và test tích hợp cho MCP `create_worksheet`.

## 12. Giai đoạn
| Giai đoạn | Nội dung |
|---|---|
| **P1 — làm được bài** | Đăng nhập, profile + PIN, khoá khu phụ huynh. Soạn bài, xem trước, xuất bản. 7 loại câu hỏi gốc cùng `split_strategy` và `info`; `RichText.clock`, `sub`, phân số; ô trống kiểu `time` và `choice`. Làm bài (mỗi màn 1 câu và lưới), giới hạn thời gian + tự nộp, đọc đề bằng giọng trình duyệt, nộp, chấm, làm lại. Giao bài. Seed chủ đề/kỹ năng Toán. Báo cáo cơ bản (điểm theo bài/môn). MCP: `list_*`, `upload_asset`, `create/update/get_worksheet`, `publish`, `assign`. Docker Compose + ngrok. |
| **P2 — học có theo dõi** | `clock_set`, `column_arith`. Gắn kỹ năng + mức thành thạo, báo cáo kỹ năng yếu, ôn câu sai, sao + streak. MCP: `get_child_report`, `get_child_mistakes`, prompts. |
| **P3 — động viên** | Huy hiệu, đổi quà, biểu đồ xu hướng, nhật ký MCP trên giao diện, sao lưu tự động. |

**Trạng thái** (2026-10-26): P1, P2, P3 đã làm, trừ sao lưu tự động (để sau) và chạy như Windows service (không cần). Khác với bản đặc tả ban đầu:
- Nối cột và sắp xếp dùng **chạm** (chạm trái rồi chạm phải để nối; nút ↑↓ để sắp xếp) thay vì kéo thả dnd-kit, cho dễ thao tác với trẻ nhỏ.
- Trình soạn bài có dạng form cho cả 11 loại câu (tải ảnh, đồng hồ, dòng dịch, gắn kỹ năng, xem như bé) và một tab JSON nâng cao.
- MCP có thêm đường dẫn `/agent` (§8) và tool `get_question_schema`.
- Trang Tổng quan phụ huynh: điểm theo môn, biểu đồ điểm theo tuần và số phút học mỗi ngày, kỹ năng (mức thành thạo), bài chưa làm, câu sai gần đây.

## 13. Vấn đề còn mở
Hiện không còn vấn đề mở.

**Để sau**: nội dung môn Tiếng Việt và Tiếng Anh. Hai môn vẫn có sẵn trong bảng `subject` từ P1 (cần cho đọc đề và cho đề song ngữ), nhưng chưa seed chủ đề/kỹ năng. Khi có mẫu thì bổ sung giống §14.

**Đã chốt** (2026-10-25):

| Vấn đề | Quyết định |
|---|---|
| Số bé | 3 bé. Lớp của từng bé được nhập khi tạo profile trong app, spec không cần ghi. |
| Mẫu bài tập | Đã xem, kết quả ở §4 (Hiển thị Toán) và §14. |
| Bộ sách giáo khoa | Không bám bộ nào; seed theo dạng bài trong mẫu (§3). |
| TTS | Chỉ dùng giọng trình duyệt (§9). |
| Ngưỡng sao | Giữ 50/75/90%. Hoàn thành phiên ôn được +1 sao. |
| Giới hạn thời gian | Làm ngay trong P1, có tự nộp khi hết giờ (§6). |
| Máy chủ | Máy Windows hiện tại, Docker Desktop + WSL2 (§10). |
| Nhiều câu trên một màn | Thêm `worksheet.layout = one_per_screen \| grid` (§3, §6). |
| Ngôn ngữ môn Toán | Song ngữ Anh–Việt: `worksheet.lang` + `sub`. |

## 14. Phụ lục: đối chiếu mẫu trong `docs/loaded`

### 14.1 Các nhóm mẫu
| Nhóm | File | Nội dung |
|---|---|---|
| Tách–gộp phép cộng | `Make 10…90 Addition Strategy.pdf`, `Make Multiples of Ten Addition Strategy.pdf` | Math-Drills. Mỗi trang 10 phép, các bản A…Y. Câu đầu có làm mẫu. `Make 60` có thêm trò "Bugs Number Recognition" (tô các số giống số trên con bọ). |
| Tách–gộp phép trừ | `subtraction_make_{10…90,vr}_strategy_all.pdf`; `toán tách gộp phép trừ.pdf` là bản gộp của tất cả các file này (239 trang) | Giống phần cộng. Mỗi bản có thêm trang đáp án ("Answers"). |
| Đồng hồ | `get-clock-wise.pdf` (Education.com, 25 trang), `Học giờ in 2 mặt.pdf`, `Dính dán học giờ.pdf`, `03. PHiên bản mới học giờ*.pdf`, `Units of Time Posters.pdf` | Đọc giờ trên đồng hồ kim, nối đồng hồ kim với đồng hồ số, vẽ kim giờ, cắt dán giờ vào đúng đồng hồ, am/pm, tính khoảng thời gian, mô hình đồng hồ có thẻ số, poster đơn vị thời gian. |
| Đề tổng hợp | `MathMinutes_G2.pdf` (Creative Teaching Press, 100 "Minute", mỗi Minute 10 câu, có đáp án ở cuối) | Quy luật dãy số, tìm số còn thiếu trong ô, đọc giờ, đếm khối hàng chục, viết số từ chữ, so sánh `< > =`, đặt tính dọc, giá trị theo hàng, đúng/sai, phân số theo phần tô màu, biểu đồ, tiền, bài toán có lời văn. |
| Thi Olympic | `TIMO Mầm non.pdf` | 25 câu trắc nghiệm A–D, song ngữ Anh–Việt, 5 phần (tư duy logic, số học, lý thuyết số, hình học, tổ hợp). Nhiều câu có hình trong đề và phương án chỉ gồm hình. |
| Học số | `03. Học số*.pdf`, `03. Học số.docx` | Flashcard số 1–10: tô số theo nét, chữ số tiếng Anh, hình đồ vật để đếm. |

**Trùng lặp và file rỗng**: `Học giờ 1` trùng với `03. PHiên bản mới học giờ`; `Học giờ in 2 mặt` trùng với `02. Học giờ in hai mặt gốc`. `04.docx` và `make100.docx` chỉ có quảng cáo và một mã QR, không có nội dung đề.

### 14.2 Dạng bài → loại câu hỏi
| Dạng trong mẫu | Loại câu hỏi |
|---|---|
| Make 10 / 20 / … / tròn chục (cộng, trừ) | `split_strategy` |
| Phép tính một dòng, tìm số còn thiếu (`8 − □ = 3`), quy luật dãy số | `fill_blank` (`input: 'number'`) |
| So sánh `97 __ 86`, điền dấu phép tính còn thiếu | `fill_blank` (`input: 'choice'`) |
| Trắc nghiệm A–D, kể cả phương án là hình (TIMO) | `single_choice` |
| "Circle: True or False" | `true_false` |
| Đọc giờ trên đồng hồ kim rồi viết giờ (Be on Time, Write the time) | `fill_blank` (`input: 'time'`) + `prompt.clock` |
| Chọn giờ đúng của đồng hồ (Circle the Correct Time) | `single_choice` + `prompt.clock` |
| Nối đồng hồ kim với đồng hồ số; cắt dán giờ vào đồng hồ (Time Mix-Up, Dính dán) | `matching` (cột trái dùng `clock`, cột phải là chữ) |
| Vẽ kim giờ, vẽ giờ (Draw the Hour Hand, Draw the Time) | `clock_set` |
| am / pm | `single_choice` hoặc `fill_blank` (`input: 'choice'`, `options: ['am','pm']`) |
| Bài toán thời gian có lời văn | `fill_blank` (`input: 'time'` hoặc `number` kèm đơn vị) |
| Đặt tính dọc (`14 + 78`) | `column_arith` |
| Giá trị theo hàng (`247 = _ trăm _ chục _ đơn vị`), viết số từ chữ | `fill_blank` |
| Phân số theo phần tô màu | `single_choice`, phương án dùng `[[2/5]]`, đề có hình |
| Đếm đồ vật, đếm khối | `number_input` + hình |
| Tô các số giống nhau (Bugs, Number Scramble), tìm đồ vật ẩn trong tranh | `hotspot` |
| Mê cung vẽ đường | `maze`; mê cung có đánh số lối thì `single_choice` |
| Tô số / chữ / đường cong theo nét, tô bằng hai tay | `trace` |
| Phiếu cộng trừ ngẫu nhiên "trong phạm vi N" (Excel tự tạo) | `arith_gen` |
| Flashcard, poster đơn vị thời gian, mô hình đồng hồ | `info` (không chấm). Có thể kèm câu `number_input` "Có bao nhiêu…?" để chấm phần đếm. |
| Tô ô biểu đồ (pictograph, bar graph) | Chưa có loại riêng. Tạm chuyển thành câu hỏi đọc biểu đồ (`number_input` + hình). |
