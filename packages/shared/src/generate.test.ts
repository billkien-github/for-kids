import { describe, expect, it } from 'vitest'
import { expandArithGen } from './generate.js'
import { gradeQuestion } from './grading.js'
import { QuestionBody, WorksheetInput } from './question.js'

const parse = (s: string) => {
  const m = s.match(/^(\S+) ([+−]) (\S+) = (\S+)$/)!
  return { a: m[1]!, op: m[2]!, b: m[3]!, c: m[4]! }
}

describe('expandArithGen', () => {
  it('cộng trừ trong phạm vi: mọi số không vượt max, không âm, đáp án đúng, không lặp', () => {
    const items = expandArithGen({ type: 'arith_gen', ops: ['+', '-'], max: 20, count: 30 }, 'seed')
    expect(items).toHaveLength(30)
    expect(new Set(items.map((i) => i.body.prompt.text)).size).toBe(30)
    for (const { body } of items) {
      const { a, op, b } = parse(body.prompt.text!)
      const [x, y] = [Number(a), Number(b)]
      const c = op === '+' ? x + y : x - y
      expect(Math.max(x, y, c)).toBeLessThanOrEqual(20)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(gradeQuestion(body, { blanks: { '1': String(c) } })).toBe(1)
    }
  })

  it('min đủ nhỏ: số hạng không dưới min, tổng không quá max', () => {
    for (const { explanation } of expandArithGen({ type: 'arith_gen', ops: ['+'], min: 5, max: 10, count: 10 }, 's')) {
      const { a, b, c } = parse(explanation)
      expect(Math.min(Number(a), Number(b))).toBeGreaterThanOrEqual(5)
      expect(Number(c)).toBeLessThanOrEqual(10)
    }
  })

  it('cùng seed cho cùng đề, khác seed cho đề khác', () => {
    const q = { type: 'arith_gen' as const, ops: ['+' as const], max: 50, count: 10 }
    expect(expandArithGen(q, 'x')).toEqual(expandArithGen(q, 'x'))
    expect(expandArithGen(q, 'x')).not.toEqual(expandArithGen(q, 'y'))
  })

  it('ô trống ở số hạng vẫn chấm đúng; phạm vi hẹp thì chấp nhận lặp', () => {
    const items = expandArithGen({ type: 'arith_gen', ops: ['-'], max: 2, count: 12, missing: 'operand' }, 's')
    expect(items).toHaveLength(12)
    for (const { body, explanation } of items) {
      expect(body.prompt.text).toMatch(/\{\{1\}\} [−] \d+ = \d+|\d+ [−] \{\{1\}\} = \d+/)
      const { a, b } = parse(explanation)
      const answer = body.prompt.text!.startsWith('{{1}}') ? a : b
      expect(gradeQuestion(body, { blanks: { '1': answer } })).toBe(1)
    }
  })

  it('validate: min < max, không lặp phép, tổng số phép tính trong bài có trần', () => {
    expect(QuestionBody.safeParse({ type: 'arith_gen', ops: ['+'], min: 10, max: 10, count: 5 }).success).toBe(false)
    expect(QuestionBody.safeParse({ type: 'arith_gen', ops: ['+', '+'], max: 10, count: 5 }).success).toBe(false)
    // Cộng hai số ≥ 6 thì tổng không thể ≤ 10.
    expect(QuestionBody.safeParse({ type: 'arith_gen', ops: ['+'], min: 6, max: 10, count: 5 }).success).toBe(false)
    expect(QuestionBody.safeParse({ type: 'arith_gen', ops: ['-'], min: 6, max: 10, count: 5 }).success).toBe(true)
    const ws = (count: number) => ({
      subjectCode: 'math',
      grade: 0,
      title: 't',
      layout: 'grid',
      questions: Array.from({ length: 5 }, () => ({ body: { type: 'arith_gen', ops: ['+'], max: 10, count } })),
    })
    expect(WorksheetInput.safeParse(ws(40)).success).toBe(true)
    expect(WorksheetInput.safeParse(ws(41)).success).toBe(false)
    // Câu thường cũng tính vào trần số câu của một lần làm.
    const mixed = ws(39)
    mixed.questions.push(...Array.from({ length: 6 }, () => ({ body: { type: 'true_false', prompt: { text: '1 = 1' }, answer: true } }) as never))
    expect(WorksheetInput.safeParse(mixed).success).toBe(false)
  })
})
