import { describe, expect, it } from 'vitest'
import { gradeQuestion, isAnswered, MAX_COLORING_OPS, MAX_COLORING_POINTS } from './grading.js'
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

describe('coloring', () => {
  const q: QuestionBody = { type: 'coloring', prompt: { text: 'Tô màu' }, image, width: 100, height: 100 }

  it('tô (đổ màu hoặc vẽ bút) là đủ điểm, chỉ tẩy hoặc chưa tô thì chưa xong', () => {
    expect(gradeQuestion(q, { ops: [{ t: 'fill', p: [10, 10], c: '#ef4444' }] })).toBe(1)
    expect(gradeQuestion(q, { ops: [{ t: 'brush', c: '#22c55e', w: 4, pts: [[1, 1], [5, 5]] }] })).toBe(1)
    expect(gradeQuestion(q, { ops: [{ t: 'erase', w: 4, pts: [[1, 1]] }] })).toBe(0)
    expect(gradeQuestion(q, { ops: [] })).toBe(0)
    expect(isAnswered(q, { ops: [] })).toBe(false)
    expect(isAnswered(q, { ops: [{ t: 'fill', p: [10, 10], c: '#ef4444' }] })).toBe(true)
  })

  it('màu sai định dạng hoặc quá nhiều bước thì không nhận', () => {
    expect(gradeQuestion(q, { ops: [{ t: 'fill', p: [10, 10], c: 'red' }] })).toBe(0)
    const many = Array.from({ length: MAX_COLORING_OPS + 1 }, () => ({ t: 'fill', p: [1, 1], c: '#000000' }))
    expect(gradeQuestion(q, { ops: many })).toBe(0)
    // Tổng số điểm nét vượt trần (câu trả lời quá nặng để lưu) cũng không nhận.
    const long = { t: 'brush', c: '#000000', w: 4, pts: Array.from({ length: 5000 }, (_, i) => [i % 100, 1]) }
    expect(gradeQuestion(q, { ops: Array.from({ length: MAX_COLORING_POINTS / 5000 }, () => long) })).toBe(1)
    expect(gradeQuestion(q, { ops: Array.from({ length: MAX_COLORING_POINTS / 5000 + 1 }, () => long) })).toBe(0)
  })

  it('bảng màu riêng phải là mã #rrggbb', () => {
    expect(QuestionBodySchema.safeParse({ ...q, palette: ['#ff0000', '#00ff00'] }).success).toBe(true)
    expect(QuestionBodySchema.safeParse({ ...q, palette: ['red', '#00ff00'] }).success).toBe(false)
  })
})
