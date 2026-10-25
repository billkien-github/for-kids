import {
  LEITNER_INTERVAL_DAYS,
  MASTERY_ALPHA,
  MASTERY_MASTERED_FROM,
  MASTERY_MIN_ANSWERS,
  MASTERY_NEEDS_PRACTICE_BELOW,
} from './constants.js'
import type { SkillLevel } from './dto.js'

// ---------- Mức thành thạo (§5.3) ----------

export const nextMastery = (mastery: number, score: number) => mastery + MASTERY_ALPHA * (score - mastery)

export function skillLevel(mastery: number, answered: number): SkillLevel {
  if (answered < MASTERY_MIN_ANSWERS) return 'unrated'
  if (mastery < MASTERY_NEEDS_PRACTICE_BELOW) return 'needs_practice'
  if (mastery < MASTERY_MASTERED_FROM) return 'improving'
  return 'mastered'
}

// ---------- Ngày theo múi giờ của gia đình ----------

/** "YYYY-MM-DD" của thời điểm `d` tại múi giờ `tz`. */
export function localDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Thứ Hai đầu tuần của một ngày "YYYY-MM-DD". */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay() // 0 = CN
  return addDays(date, -((dow + 6) % 7))
}

/** §5.5: số ngày học liên tiếp, tính tới hôm nay hoặc hôm qua. */
export function computeStreak(studyDays: Iterable<string>, today: string): number {
  const days = new Set(studyDays)
  let day = days.has(today) ? today : addDays(today, -1)
  let n = 0
  while (days.has(day)) {
    n++
    day = addDays(day, -1)
  }
  return n
}

// ---------- Hộp Leitner (§5.4) ----------

export type ReviewState = { box: number; dueOn: string } | null

/**
 * Trạng thái ôn tiếp theo của một câu.
 * - Sai (ở bất kỳ lần làm nào): về hộp 1, ôn ngày mai.
 * - Đúng trong phiên ôn: lên 1 hộp, hạn ôn theo hộp mới; đúng ở hộp 5 thì bỏ khỏi danh sách (null).
 * - Đúng ngoài phiên ôn: giữ nguyên.
 */
export function nextReview(current: ReviewState, correct: boolean, inReview: boolean, today: string): ReviewState {
  if (!correct) return { box: 1, dueOn: addDays(today, 1) }
  if (!inReview || !current) return current
  if (current.box >= 5) return null
  const box = current.box + 1
  return { box, dueOn: addDays(today, LEITNER_INTERVAL_DAYS[box as 2 | 3 | 4 | 5]) }
}
