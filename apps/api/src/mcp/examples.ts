import type { QuestionInput } from '@for-kids/shared'

/** Một ví dụ cho mỗi loại câu hỏi (§8: resource forkids://schema/questions). */
export const QUESTION_EXAMPLES: Record<string, QuestionInput> = {
  single_choice: {
    body: {
      type: 'single_choice',
      prompt: { text: 'Which clock shows 3:00?', sub: { text: 'Đồng hồ nào chỉ 3 giờ?', lang: 'vi-VN' } },
      choices: [
        { id: 'a', content: { clock: { h: 3, m: 0 } } },
        { id: 'b', content: { clock: { h: 9, m: 0 } } },
      ],
      answer: 'a',
      shuffle: true,
    },
    explanation: 'Kim ngắn chỉ số 3, kim dài chỉ số 12.',
    skillCodes: ['math.clock.hour'],
  },
  multi_choice: {
    body: {
      type: 'multi_choice',
      prompt: { text: 'Chọn tất cả số chẵn' },
      choices: [
        { id: 'a', content: { text: '2' } },
        { id: 'b', content: { text: '3' } },
        { id: 'c', content: { text: '8' } },
      ],
      answer: ['a', 'c'],
    },
  },
  true_false: {
    body: { type: 'true_false', prompt: { text: 'A cup holds more than 1 gallon.' }, answer: false },
  },
  fill_blank: {
    body: {
      type: 'fill_blank',
      prompt: { text: '97 {{1}} 86   ·   8 − {{2}} = 3', ttsText: 'chín mươi bảy ô trống tám mươi sáu' },
      blanks: [
        { id: '1', accept: ['>'], input: 'choice', options: ['<', '>', '='] },
        { id: '2', accept: ['5'], input: 'number' },
      ],
    },
    skillCodes: ['math.compare', 'math.missing_number'],
  },
  number_input: {
    body: { type: 'number_input', prompt: { text: 'How many blocks in all?', imageAssetId: '00000000-0000-0000-0000-000000000000' }, answer: 63, unit: 'blocks' },
  },
  matching: {
    body: {
      type: 'matching',
      prompt: { text: 'Nối đồng hồ với giờ đúng' },
      left: [
        { id: 'l1', content: { clock: { h: 8, m: 45 } } },
        { id: 'l2', content: { clock: { h: 3, m: 15 } } },
      ],
      right: [
        { id: 'r1', content: { text: '3:15' } },
        { id: 'r2', content: { text: '8:45' } },
      ],
      pairs: [
        ['l1', 'r2'],
        ['l2', 'r1'],
      ],
    },
  },
  ordering: {
    body: {
      type: 'ordering',
      prompt: { text: 'Xếp các số từ bé đến lớn' },
      items: [
        { id: 'a', content: { text: '15' } },
        { id: 'b', content: { text: '7' } },
        { id: 'c', content: { text: '23' } },
      ],
      answer: ['b', 'a', 'c'],
    },
  },
  split_strategy: {
    body: { type: 'split_strategy', op: '+', a: 7, b: 6 },
    explanation: '7 + 3 = 10, rồi 10 + 3 = 13.',
    skillCodes: ['math.make10.add'],
  },
  clock_set: {
    body: { type: 'clock_set', prompt: { text: 'Quay kim chỉ 9 giờ' }, answer: { h: 9, m: 0 }, hands: 'hour' },
  },
  column_arith: {
    body: { type: 'column_arith', op: '+', operands: [14, 78], showCarry: true },
  },
  info: {
    body: { type: 'info', prompt: { text: 'Số 2 — Two', imageAssetId: '00000000-0000-0000-0000-000000000000' } },
  },
  // Toạ độ theo pixel của ảnh đã upload (width/height là kích thước ảnh đó).
  hotspot: {
    body: {
      type: 'hotspot',
      prompt: { text: 'Tìm và chạm vào tất cả các số 1' },
      image: '00000000-0000-0000-0000-000000000000',
      width: 800,
      height: 1000,
      targets: [
        { x: 40, y: 60, w: 120, h: 260 },
        { x: 610, y: 420, w: 90, h: 230 },
      ],
    },
    skillCodes: ['math.number.read'],
  },
  maze: {
    body: {
      type: 'maze',
      prompt: { text: 'Giúp chú rồng tìm đường về lâu đài' },
      image: '00000000-0000-0000-0000-000000000000',
      width: 800,
      height: 1000,
      path: [
        [400, 150],
        [400, 260],
        [180, 260],
        [180, 820],
      ],
      tolerance: 30,
    },
  },
  trace: {
    body: {
      type: 'trace',
      prompt: { text: 'Tô theo nét số 1' },
      width: 300,
      height: 400,
      paths: [
        [
          [110, 110],
          [160, 60],
          [160, 340],
        ],
      ],
      tolerance: 18,
    },
  },
  arith_gen: {
    body: { type: 'arith_gen', ops: ['+', '-'], max: 10, count: 20 },
    skillCodes: ['math.add.within10', 'math.sub.within10'],
  },
}

export const generatePracticePrompt = (childName?: string) => `Soạn một bài luyện tập cho ${childName ? `bé ${childName}` : 'một bé'} đúng chỗ bé còn yếu, trong app For-Kids.

Quy trình:
1. list_children để lấy childId${childName ? ` của ${childName}` : ''}.
2. get_child_report: xem weakSkills (mức "needs_practice"), điểm theo môn, bài quá hạn.
3. get_child_mistakes: xem các câu sai gần đây và bé đã trả lời gì, để đoán lỗi sai (vd. quên nhớ khi cộng qua 10, nhầm kim giờ/kim phút).
4. Gọi get_question_schema, rồi soạn 8–12 câu mới (không chép lại nguyên câu cũ), cùng dạng và cùng kỹ năng với chỗ yếu, độ khó tăng dần. Gắn đúng skillCodes; viết explanation ngắn, dễ hiểu cho trẻ.
5. create_worksheet với lớp của bé, tiêu đề dạng "Luyện tập: <kỹ năng>". Bài tính nhanh có thể dùng layout 'grid'.
6. Báo lại cho phụ huynh nội dung bài vừa soạn. Chỉ publish_worksheet và assign_worksheet khi phụ huynh đồng ý.`

export const IMPORT_WORKSHEET_PROMPT =`Bạn nhập một bài tập từ file nguồn (PDF/ảnh/Word/Excel) vào app For-Kids.

Quy trình:
1. Gọi get_question_schema để xem định dạng các loại câu hỏi, và list_catalog để biết môn/chủ đề/kỹ năng hiện có.
2. Đọc file nguồn, tách từng câu. Chọn loại câu gần nhất:
   - Phép tính tách–gộp qua 10 (Make Ten, Keep/Split) → split_strategy, chỉ cần op, a, b.
   - Đọc giờ trên đồng hồ → dùng prompt.clock {h, m} (app tự vẽ, KHÔNG cắt ảnh đồng hồ).
   - So sánh < > =, điền dấu → fill_blank với input 'choice'. Số → input 'number'. Giờ → input 'time'.
   - Trắc nghiệm A–D → single_choice (phương án có thể chỉ là hình).
   - Tìm và khoanh/tô/chạm đồ vật, số giống nhau trên hình (hidden objects, Number Scramble) → hotspot: ảnh + các vùng đúng (hình chữ nhật theo pixel).
   - Mê cung vẽ đường → maze: ảnh + lối đi đúng (đường gấp khúc theo giữa lối, từ xuất phát tới đích), tolerance ≈ nửa bề rộng lối. Mê cung có đánh số lối → single_choice.
   - Tô theo nét (số, chữ, đường cong) → trace: các nét mẫu (đường gấp khúc theo tâm nét), tolerance ≈ nửa bề rộng nét. Không có ảnh thì app tự vẽ nét đứt.
   - Phiếu cộng trừ ngẫu nhiên "trong phạm vi N" (file Excel tự tạo) → arith_gen: chỉ cần ops, max, count; mỗi lần bé làm server sinh đề mới.
   - Flashcard, poster → info (không chấm).
3. Hình minh hoạ (đồ vật để đếm, quy luật hình…): cắt ảnh, gọi upload_asset, dùng assetId trả về trong imageAssetId.
   Câu hotspot / maze / trace: ảnh đặt ở trường image (không đặt trong prompt), width/height đúng bằng kích thước ảnh đã upload, mọi toạ độ theo pixel của ảnh đó (gốc góc trên trái). Vector trong PDF (nét đứt, tường mê cung) đọc được toạ độ trực tiếp; nhớ đổi theo tỉ lệ khi render ảnh.
4. Gắn skillCodes có sẵn; thiếu thì upsert_topic / upsert_skill trước.
5. Viết explanation ngắn, dễ hiểu cho trẻ.
6. Gọi create_worksheet (bài tạo ra là nháp). Lỗi sẽ chỉ rõ đường dẫn trường sai, sửa rồi gọi lại.

Lưu ý:
- Bỏ trang quảng cáo, mã QR, điều khoản sử dụng, mục lục.
- File có trang đáp án ("Answers", "Answer Key") thì dùng làm đáp án, không tạo câu từ trang đó.
- Bộ đề có nhiều biến thể giống nhau (vd. Make 10 bản A…Y) chỉ cần nhập 1–2 bản.
- Đề song ngữ: tiếng Anh ở text, tiếng Việt ở sub (hoặc ngược lại tuỳ lang của bài).
- Bài luyện tính nhanh nhiều câu ngắn có thể đặt layout 'grid'.
- Chỉ publish_worksheet / assign_worksheet khi phụ huynh yêu cầu.`
