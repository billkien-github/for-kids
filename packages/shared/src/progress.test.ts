import { describe, expect, it } from 'vitest'
import { addDays, computeStreak, localDate, nextMastery, nextReview, skillLevel, weekStart } from './progress.js'

describe('mức thành thạo', () => {
  it('cập nhật theo công thức mastery + 0.3 × (score − mastery)', () => {
    expect(nextMastery(0.5, 1)).toBeCloseTo(0.65)
    expect(nextMastery(0.5, 0)).toBeCloseTo(0.35)
  })
  it('chỉ phân mức khi đã trả lời ≥ 5 câu', () => {
    expect(skillLevel(0.9, 4)).toBe('unrated')
    expect(skillLevel(0.49, 5)).toBe('needs_practice')
    expect(skillLevel(0.5, 5)).toBe('improving')
    expect(skillLevel(0.8, 5)).toBe('mastered')
  })
})

describe('ngày', () => {
  it('localDate theo múi giờ Việt Nam', () => {
    // 17:30 UTC = 00:30 hôm sau ở Hà Nội.
    expect(localDate(new Date('2026-10-25T17:30:00Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-10-26')
  })
  it('addDays qua tháng, weekStart là thứ Hai', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(weekStart('2026-10-25')).toBe('2026-10-19') // Chủ nhật → thứ Hai trước đó
    expect(weekStart('2026-10-26')).toBe('2026-10-26')
  })
  it('streak tính tới hôm nay hoặc hôm qua', () => {
    const days = ['2026-10-22', '2026-10-23', '2026-10-24']
    expect(computeStreak(days, '2026-10-24')).toBe(3)
    expect(computeStreak(days, '2026-10-25')).toBe(3) // hôm nay chưa học vẫn giữ chuỗi
    expect(computeStreak(days, '2026-10-26')).toBe(0)
    expect(computeStreak([], '2026-10-26')).toBe(0)
  })
})

describe('hộp Leitner', () => {
  const today = '2026-10-26'
  it('sai thì về hộp 1, ôn ngày mai', () => {
    expect(nextReview(null, false, false, today)).toEqual({ box: 1, dueOn: '2026-10-27' })
    expect(nextReview({ box: 4, dueOn: today }, false, true, today)).toEqual({ box: 1, dueOn: '2026-10-27' })
  })
  it('đúng trong phiên ôn thì lên hộp, cách 1/3/7/14 ngày; đúng ở hộp 5 thì xoá', () => {
    expect(nextReview({ box: 1, dueOn: today }, true, true, today)).toEqual({ box: 2, dueOn: '2026-10-27' })
    expect(nextReview({ box: 2, dueOn: today }, true, true, today)).toEqual({ box: 3, dueOn: '2026-10-29' })
    expect(nextReview({ box: 3, dueOn: today }, true, true, today)).toEqual({ box: 4, dueOn: '2026-11-02' })
    expect(nextReview({ box: 4, dueOn: today }, true, true, today)).toEqual({ box: 5, dueOn: '2026-11-09' })
    expect(nextReview({ box: 5, dueOn: today }, true, true, today)).toBeNull()
  })
  it('đúng ngoài phiên ôn thì giữ nguyên', () => {
    expect(nextReview({ box: 2, dueOn: today }, true, false, today)).toEqual({ box: 2, dueOn: today })
    expect(nextReview(null, true, false, today)).toBeNull()
  })
})
