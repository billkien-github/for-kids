// Dữ liệu seed (§3 spec). Chủ đề Toán lấy theo các dạng bài trong docs/samples, không theo bộ sách nào.

export const SUBJECTS = [
  { code: 'math', name: 'Toán', ttsLang: 'vi-VN' },
  { code: 'vi', name: 'Tiếng Việt', ttsLang: 'vi-VN' },
  { code: 'en', name: 'Tiếng Anh', ttsLang: 'en-US' },
] as const

type TopicSeed = {
  name: string
  grades: [number, number]
  skills: [code: string, name: string][]
}

export const MATH_TOPICS: TopicSeed[] = [
  {
    name: 'Đếm và nhận biết số',
    grades: [0, 1],
    skills: [
      ['math.count', 'Đếm số lượng'],
      ['math.number.read', 'Đọc, viết số bằng chữ'],
    ],
  },
  { name: 'So sánh số', grades: [0, 2], skills: [['math.compare', 'So sánh hai số (<, >, =)']] },
  {
    name: 'Quy luật',
    grades: [0, 2],
    skills: [
      ['math.pattern.number', 'Quy luật dãy số'],
      ['math.pattern.shape', 'Quy luật hình'],
    ],
  },
  {
    name: 'Cộng, trừ trong phạm vi 10',
    grades: [0, 1],
    skills: [
      ['math.add.within10', 'Cộng trong phạm vi 10'],
      ['math.sub.within10', 'Trừ trong phạm vi 10'],
      ['math.missing_number', 'Tìm số còn thiếu trong phép tính'],
    ],
  },
  {
    name: 'Tách–gộp qua 10',
    grades: [1, 1],
    skills: [
      ['math.make10.add', 'Cộng qua 10 bằng cách tách–gộp'],
      ['math.make10.sub', 'Trừ qua 10 bằng cách tách–gộp'],
    ],
  },
  {
    name: 'Tách–gộp qua số tròn chục',
    grades: [1, 2],
    skills: [
      ['math.make_tens.add', 'Cộng qua số tròn chục'],
      ['math.make_tens.sub', 'Trừ qua số tròn chục'],
    ],
  },
  {
    name: 'Đặt tính dọc',
    grades: [2, 2],
    skills: [
      ['math.column.add', 'Đặt tính rồi tính phép cộng'],
      ['math.column.sub', 'Đặt tính rồi tính phép trừ'],
      ['math.add.carry', 'Cộng có nhớ'],
      ['math.sub.borrow', 'Trừ có nhớ'],
    ],
  },
  { name: 'Giá trị theo hàng', grades: [1, 2], skills: [['math.place_value', 'Hàng trăm, chục, đơn vị']] },
  {
    name: 'Xem giờ',
    grades: [1, 2],
    skills: [
      ['math.clock.hour', 'Xem giờ đúng'],
      ['math.clock.half', 'Xem giờ rưỡi'],
      ['math.clock.quarter', 'Xem giờ kém/hơn 15 phút'],
      ['math.clock.5min', 'Xem giờ theo 5 phút'],
      ['math.time.ampm', 'Buổi sáng/chiều (am/pm)'],
      ['math.time.elapsed', 'Tính khoảng thời gian'],
    ],
  },
  {
    name: 'Đơn vị thời gian, lịch',
    grades: [1, 2],
    skills: [
      ['math.time.units', 'Đơn vị thời gian'],
      ['math.calendar', 'Ngày trong tuần, tháng trong năm'],
    ],
  },
  {
    name: 'Hình học',
    grades: [0, 2],
    skills: [
      ['math.shape.identify', 'Nhận biết hình'],
      ['math.shape.count', 'Đếm hình'],
    ],
  },
  { name: 'Phân số đơn giản', grades: [2, 2], skills: [['math.fraction.basic', 'Nhận biết phân số đơn giản']] },
  { name: 'Tiền', grades: [2, 2], skills: [['math.money', 'Đếm và đổi tiền']] },
  { name: 'Biểu đồ', grades: [2, 2], skills: [['math.graph.read', 'Đọc biểu đồ tranh, biểu đồ cột']] },
  { name: 'Bài toán có lời văn', grades: [0, 2], skills: [['math.word_problem', 'Giải bài toán có lời văn']] },
]

export const BADGES = [
  { code: 'first_worksheet', name: 'Bài đầu tiên', icon: '🎉', rule: { type: 'worksheets_submitted', count: 1 }, bonusStars: 1 },
  { code: 'perfect_1', name: 'Điểm tuyệt đối', icon: '💯', rule: { type: 'perfect_scores', count: 1 }, bonusStars: 1 },
  { code: 'perfect_10', name: '10 lần tuyệt đối', icon: '🏆', rule: { type: 'perfect_scores', count: 10 }, bonusStars: 3 },
  { code: 'streak_7', name: 'Học 7 ngày liền', icon: '🔥', rule: { type: 'streak', days: 7 }, bonusStars: 3 },
  { code: 'streak_30', name: 'Học 30 ngày liền', icon: '🌟', rule: { type: 'streak', days: 30 }, bonusStars: 10 },
  { code: 'skill_master_5', name: 'Thành thạo 5 kỹ năng', icon: '🧠', rule: { type: 'skills_mastered', count: 5 }, bonusStars: 5 },
  { code: 'review_hero_50', name: 'Ôn đúng 50 câu', icon: '🦸', rule: { type: 'review_correct', count: 50 }, bonusStars: 5 },
] as const
