import { describe, expect, it } from 'vitest'
import { gradeQuestion, hourHandAngle, isAnswered, normalizeTime, scorePercent, starsFor } from './grading.js'
import type { QuestionBody } from './question.js'
import { sanitizeForKid } from './sanitize.js'

const p = { text: 'Câu hỏi' }
const choices = ['a', 'b', 'c'].map((id) => ({ id, content: { text: id } }))

describe('gradeQuestion', () => {
  it('single_choice, true_false', () => {
    const q: QuestionBody = { type: 'single_choice', prompt: p, choices, answer: 'b' }
    expect(gradeQuestion(q, { choice: 'b' })).toBe(1)
    expect(gradeQuestion(q, { choice: 'a' })).toBe(0)
    expect(gradeQuestion(q, null)).toBe(0)
    expect(gradeQuestion({ type: 'true_false', prompt: p, answer: false }, { value: false })).toBe(1)
  })

  it('multi_choice: thiếu hay thừa đều sai', () => {
    const q: QuestionBody = { type: 'multi_choice', prompt: p, choices, answer: ['a', 'c'] }
    expect(gradeQuestion(q, { choices: ['c', 'a'] })).toBe(1)
    expect(gradeQuestion(q, { choices: ['a'] })).toBe(0)
    expect(gradeQuestion(q, { choices: ['a', 'b', 'c'] })).toBe(0)
  })

  it('fill_blank: chấm theo tỉ lệ ô, dấu tiếng Việt phải đúng, bỏ khoảng trắng thừa', () => {
    const q: QuestionBody = {
      type: 'fill_blank',
      prompt: { text: 'Con {{1}} kêu {{2}}' },
      blanks: [
        { id: '1', accept: ['mèo'] },
        { id: '2', accept: ['meo meo'] },
      ],
    }
    expect(gradeQuestion(q, { blanks: { '1': '  Mèo ', '2': 'meo   meo' } })).toBe(1)
    expect(gradeQuestion(q, { blanks: { '1': 'meo', '2': 'meo meo' } })).toBe(0.5)
    // Dạng tổ hợp (e + dấu huyền rời) vẫn khớp với dạng dựng sẵn.
    expect(gradeQuestion(q, { blanks: { '1': 'mèo', '2': 'meo meo' } })).toBe(1)
  })

  it('fill_blank: ô số chấp nhận dấu phẩy; ô giờ chuẩn hoá; ô chọn dấu', () => {
    const q: QuestionBody = {
      type: 'fill_blank',
      prompt: { text: '{{1}} / {{2}} / {{3}}' },
      blanks: [
        { id: '1', accept: ['2.5'], input: 'number' },
        { id: '2', accept: ['5:50'], input: 'time' },
        { id: '3', accept: ['>'], input: 'choice', options: ['<', '>', '='] },
      ],
    }
    expect(gradeQuestion(q, { blanks: { '1': '2,5', '2': '05.50', '3': '>' } })).toBe(1)
    expect(gradeQuestion(q, { blanks: { '1': '2,50', '2': '5:5', '3': '<' } })).toBeCloseTo(1 / 3)
  })

  it('number_input với sai số', () => {
    const q: QuestionBody = { type: 'number_input', prompt: p, answer: 10, tolerance: 0.5 }
    expect(gradeQuestion(q, { value: '10,4' })).toBe(1)
    expect(gradeQuestion(q, { value: '11' })).toBe(0)
    expect(gradeQuestion(q, { value: 'mười' })).toBe(0)
  })

  it('matching chấm theo tỉ lệ cặp đúng; ordering đúng hết mới có điểm', () => {
    const m: QuestionBody = {
      type: 'matching',
      prompt: p,
      left: choices,
      right: choices,
      pairs: [
        ['a', 'a'],
        ['b', 'b'],
        ['c', 'c'],
      ],
    }
    expect(gradeQuestion(m, { pairs: [['a', 'a'], ['b', 'c'], ['c', 'c']] })).toBeCloseTo(2 / 3)
    const o: QuestionBody = { type: 'ordering', prompt: p, items: choices, answer: ['c', 'a', 'b'] }
    expect(gradeQuestion(o, { order: ['c', 'a', 'b'] })).toBe(1)
    expect(gradeQuestion(o, { order: ['c', 'b', 'a'] })).toBe(0)
  })

  it('split_strategy: 4 ô, chấm theo tỉ lệ', () => {
    const q: QuestionBody = { type: 'split_strategy', op: '+', a: 7, b: 6 }
    expect(gradeQuestion(q, { cells: ['7', '3', '3', '13'] })).toBe(1)
    expect(gradeQuestion(q, { cells: ['7', '3', '3', '12'] })).toBe(0.75)
    expect(gradeQuestion(q, { cells: ['7', '3'] })).toBe(0)
  })

  it('clock_set: kim giờ lệch tối đa ±15°, kim phút phải đúng', () => {
    const q: QuestionBody = { type: 'clock_set', prompt: p, answer: { h: 3, m: 30 }, hands: 'both' }
    expect(hourHandAngle(3, 30)).toBe(105)
    expect(gradeQuestion(q, { hourAngle: 105, minute: 30 })).toBe(1)
    expect(gradeQuestion(q, { hourAngle: 118, minute: 30 })).toBe(1)
    expect(gradeQuestion(q, { hourAngle: 90, minute: 30 })).toBe(1) // vừa đúng 15°
    expect(gradeQuestion(q, { hourAngle: 89, minute: 30 })).toBe(0)
    expect(gradeQuestion(q, { hourAngle: 105, minute: 35 })).toBe(0)
    const twelve: QuestionBody = { type: 'clock_set', prompt: p, answer: { h: 12, m: 0 }, hands: 'hour' }
    expect(gradeQuestion(twelve, { hourAngle: 355, minute: 0 })).toBe(1)
  })

  it('column_arith chỉ chấm hàng kết quả; info không chấm', () => {
    const q: QuestionBody = { type: 'column_arith', op: '+', operands: [14, 78] }
    expect(gradeQuestion(q, { result: '92' })).toBe(1)
    expect(gradeQuestion(q, { result: '82' })).toBe(0)
    expect(gradeQuestion({ type: 'info', prompt: p }, undefined)).toBeNull()
  })
})

describe('isAnswered', () => {
  it('fill_blank cần điền đủ mọi ô', () => {
    const q: QuestionBody = {
      type: 'fill_blank',
      prompt: { text: '{{1}} {{2}}' },
      blanks: [
        { id: '1', accept: ['x'] },
        { id: '2', accept: ['y'] },
      ],
    }
    expect(isAnswered(q, { blanks: { '1': 'x' } })).toBe(false)
    expect(isAnswered(q, { blanks: { '1': 'x', '2': ' ' } })).toBe(false)
    expect(isAnswered(q, { blanks: { '1': 'x', '2': 'y' } })).toBe(true)
    expect(isAnswered(q, undefined)).toBe(false)
  })
})

describe('điểm và sao', () => {
  it('scorePercent bỏ qua câu 0 điểm, starsFor theo ngưỡng', () => {
    expect(scorePercent([{ score: 1, points: 1 }, { score: 0.5, points: 2 }, { score: 0, points: 0 }]).pct).toBeCloseTo(66.7)
    expect([49, 50, 75, 89.9, 90, 100].map((x) => starsFor(x, [50, 75, 90]))).toEqual([0, 1, 2, 2, 3, 3])
  })

  it('normalizeTime', () => {
    expect(['5:50', '05:50', '5.50', '5h50', '24:00', '5:5'].map(normalizeTime)).toEqual(['5:50', '5:50', '5:50', '5:50', null, null])
  })
})

describe('sanitizeForKid', () => {
  it('không lộ đáp án, xáo ổn định theo seed', () => {
    const q: QuestionBody = {
      type: 'fill_blank',
      prompt: { text: '{{1}}' },
      blanks: [{ id: '1', accept: ['bí mật'], input: 'text' }],
    }
    expect(JSON.stringify(sanitizeForKid(q, 's'))).not.toContain('bí mật')

    const sc: QuestionBody = { type: 'single_choice', prompt: p, choices, answer: 'c', shuffle: true }
    const s1 = sanitizeForKid(sc, 'attempt-1:q1')
    expect(s1).not.toHaveProperty('answer')
    expect(sanitizeForKid(sc, 'attempt-1:q1')).toEqual(s1)

    const m: QuestionBody = { type: 'matching', prompt: p, left: choices, right: choices, pairs: [['a', 'a']] }
    expect(sanitizeForKid(m, 'x')).not.toHaveProperty('pairs')
  })

  it('ordering không bao giờ hiện đúng thứ tự đáp án', () => {
    const q: QuestionBody = { type: 'ordering', prompt: p, items: choices, answer: ['a', 'b', 'c'] }
    for (let i = 0; i < 50; i++) {
      const s = sanitizeForKid(q, `seed-${i}`) as { items: { id: string }[] }
      expect(s.items.map((c) => c.id)).not.toEqual(['a', 'b', 'c'])
    }
  })
})
