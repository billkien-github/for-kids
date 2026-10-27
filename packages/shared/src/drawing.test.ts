import { describe, expect, it } from 'vitest'
import { gradeQuestion, isAnswered } from './grading.js'
import type { Point, QuestionBody } from './question.js'
import { QuestionBody as QuestionBodySchema } from './question.js'
import { sanitizeForKid } from './sanitize.js'

const p = { text: 'Câu hỏi' }
const image = '00000000-0000-4000-8000-000000000000'

describe('hotspot', () => {
  const q: QuestionBody = {
    type: 'hotspot',
    prompt: p,
    image,
    width: 100,
    height: 100,
    targets: [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 50, y: 50, w: 10, h: 10 },
    ],
  }

  it('trúng hết thì đủ điểm; chạm hai lần một vùng không bị trừ', () => {
    expect(gradeQuestion(q, { taps: [[5, 5], [55, 55], [56, 56]] })).toBe(1)
  })

  it('mỗi lần chạm trượt trừ một vùng', () => {
    expect(gradeQuestion(q, { taps: [[5, 5]] })).toBe(0.5)
    expect(gradeQuestion(q, { taps: [[5, 5], [55, 55], [90, 90]] })).toBe(0.5)
    expect(gradeQuestion(q, { taps: [[90, 90], [80, 80], [5, 5]] })).toBe(0)
  })

  it('bé không thấy vùng đúng, chỉ biết số vùng', () => {
    const kid = sanitizeForKid(q, 's') as Record<string, unknown>
    expect(kid.targets).toBeUndefined()
    expect(kid.targetCount).toBe(2)
    expect(isAnswered(q, { taps: [] })).toBe(false)
  })

  it('vùng phải nằm trong ảnh', () => {
    const bad = { ...q, targets: [{ x: 95, y: 0, w: 10, h: 10 }] }
    expect(QuestionBodySchema.safeParse(bad).success).toBe(false)
    expect(QuestionBodySchema.safeParse(q).success).toBe(true)
  })
})

describe('maze', () => {
  // Lối đi hình chữ L: (10,10) → (90,10) → (90,90).
  const path: Point[] = [
    [10, 10],
    [90, 10],
    [90, 90],
  ]
  const q: QuestionBody = { type: 'maze', prompt: p, image, width: 100, height: 100, path, tolerance: 6 }

  it('đi theo lối (lệch chút, nhấc tay giữa chừng) tới đích thì đúng', () => {
    const strokes: Point[][] = [
      [
        [11, 12],
        [50, 8],
        [88, 13],
      ],
      [
        [91, 14],
        [89, 60],
        [92, 88],
      ],
    ]
    expect(gradeQuestion(q, { strokes })).toBe(1)
  })

  it('đi tắt xuyên tường, chưa tới đích, hoặc chưa vẽ thì sai', () => {
    expect(gradeQuestion(q, { strokes: [[[10, 10], [90, 90]]] })).toBe(0)
    expect(gradeQuestion(q, { strokes: [[[10, 10], [90, 10], [90, 40]]] })).toBe(0)
    expect(gradeQuestion(q, { strokes: [] })).toBe(0)
  })

  it('toạ độ bất thường hay quá nhiều nét: chấm nhanh, không treo; nét thừa bị cắt chứ không làm sai cả câu', () => {
    const t0 = Date.now()
    expect(gradeQuestion(q, { strokes: [[[0, 0], [1e300, 0]], [[-1e300, 5], [5, 1e300]]] })).toBe(0)
    const good: Point[][] = [[[10, 10], [90, 10], [90, 90]], ...Array.from({ length: 150 }, (): Point[] => [[90, 90]])]
    expect(gradeQuestion(q, { strokes: good })).toBe(1)
    expect(Date.now() - t0).toBeLessThan(1000)
  })

  it('bé thấy điểm đầu/cuối nhưng không thấy lối đi', () => {
    const kid = sanitizeForKid(q, 's') as Record<string, unknown>
    expect(kid.path).toBeUndefined()
    expect(kid.start).toEqual([10, 10])
    expect(kid.end).toEqual([90, 90])
  })
})

describe('trace', () => {
  // Số 1: một nét dọc.
  const q: QuestionBody = { type: 'trace', prompt: p, width: 100, height: 100, paths: [[[50, 10], [50, 90]]], tolerance: 5 }

  it('tô kín nét thì đủ điểm', () => {
    expect(gradeQuestion(q, { strokes: [[[52, 9], [48, 50], [51, 91]]] })).toBe(1)
  })

  it('tô được một nửa thì được nửa điểm', () => {
    expect(gradeQuestion(q, { strokes: [[[50, 10], [50, 50]]] })).toBe(0.5)
  })

  it('vẽ lung tung ra ngoài nét thì 0 điểm', () => {
    expect(gradeQuestion(q, { strokes: [[[50, 10], [50, 90]], [[0, 0], [100, 0], [100, 100], [0, 100]]] })).toBe(0)
  })
})
