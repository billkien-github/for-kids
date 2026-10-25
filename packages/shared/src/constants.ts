// Ngưỡng % để đạt 1 / 2 / 3 sao (mặc định, phụ huynh đổi được theo gia đình).
export const DEFAULT_STAR_THRESHOLDS = [50, 75, 90] as const

// Hộp Leitner → số ngày đến lần ôn tiếp theo. Hộp 1 luôn ôn vào ngày mai.
export const LEITNER_INTERVAL_DAYS: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 1, 2: 1, 3: 3, 4: 7, 5: 14 }
export const REVIEW_SESSION_SIZE = 10
export const REVIEW_SESSION_STARS = 1

/** §5.3: chỉ phân mức khi đã trả lời đủ số câu; dưới 0.5 cần luyện, từ 0.8 là thành thạo. */
export const MASTERY_NEEDS_PRACTICE_BELOW = 0.5
export const MASTERY_MASTERED_FROM = 0.8
export const MASTERY_INITIAL = 0.5
export const MASTERY_ALPHA = 0.3
export const MASTERY_MIN_ANSWERS = 5

// Server chấp nhận bài nộp muộn tối đa chừng này giây sau deadline_at (bù độ trễ mạng).
export const TIME_LIMIT_GRACE_SEC = 5

export const TIMEZONE = 'Asia/Ho_Chi_Minh'

export const GRADE_MIN = 0 // 0 = mầm non
export const GRADE_MAX = 12
