import { describe, expect, it } from 'vitest'
import { QUESTION_TYPES, QuestionBody, WorksheetInput } from './question.js'

const issuePaths = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.error?.issues.map((i) => i.path.join('.')) ?? []

describe('QuestionBody', () => {
  it('liệt kê đủ 11 loại câu', () => {
    expect(QUESTION_TYPES).toHaveLength(11)
  })

  it('nhận phương án chỉ có hình hoặc chỉ có đồng hồ', () => {
    const r = QuestionBody.safeParse({
      type: 'single_choice',
      prompt: { text: 'Which clock shows 3:00?', sub: { text: 'Đồng hồ nào chỉ 3 giờ?', lang: 'vi-VN' } },
      choices: [
        { id: 'a', content: { clock: { h: 3, m: 0 } } },
        { id: 'b', content: { imageAssetId: '6f1c1a52-6a7e-4c1e-9d55-6a4f0a7e2b11' } },
      ],
      answer: 'a',
    })
    expect(r.success).toBe(true)
  })

  it('từ chối RichText rỗng', () => {
    const r = QuestionBody.safeParse({ type: 'true_false', prompt: { text: '  ' }, answer: true })
    expect(r.success).toBe(false)
  })

  it('fill_blank: ô trong text phải khớp danh sách blanks', () => {
    const ok = QuestionBody.safeParse({
      type: 'fill_blank',
      prompt: { text: '97 {{1}} 86' },
      blanks: [{ id: '1', accept: ['>'], input: 'choice', options: ['<', '>', '='] }],
    })
    expect(ok.success).toBe(true)

    const bad = QuestionBody.safeParse({
      type: 'fill_blank',
      prompt: { text: '{{1}} + {{2}} = 5' },
      blanks: [{ id: '1', accept: ['2'] }],
    })
    expect(bad.success).toBe(false)
  })

  it('fill_blank kiểu choice: đáp án phải nằm trong options', () => {
    const r = QuestionBody.safeParse({
      type: 'fill_blank',
      prompt: { text: '8 {{1}} 5 = 3' },
      blanks: [{ id: '1', accept: ['x'], input: 'choice', options: ['+', '-'] }],
    })
    expect(issuePaths(r)).toContain('blanks.0.accept.0')
  })

  it('split_strategy: báo lỗi khi không qua chục', () => {
    expect(QuestionBody.safeParse({ type: 'split_strategy', op: '+', a: 7, b: 6 }).success).toBe(true)
    expect(QuestionBody.safeParse({ type: 'split_strategy', op: '+', a: 3, b: 4 }).success).toBe(false)
  })

  it('clock_set: chỉ kim giờ thì phút phải là 0', () => {
    const base = { type: 'clock_set', prompt: { text: 'Vẽ kim giờ' }, hands: 'hour' } as const
    expect(QuestionBody.safeParse({ ...base, answer: { h: 9, m: 0 } }).success).toBe(true)
    expect(QuestionBody.safeParse({ ...base, answer: { h: 9, m: 30 } }).success).toBe(false)
  })

  it('ordering: answer phải là hoán vị', () => {
    const items = [
      { id: 'a', content: { text: '1' } },
      { id: 'b', content: { text: '2' } },
    ]
    expect(QuestionBody.safeParse({ type: 'ordering', prompt: { text: 'Xếp' }, items, answer: ['b', 'a'] }).success).toBe(true)
    expect(QuestionBody.safeParse({ type: 'ordering', prompt: { text: 'Xếp' }, items, answer: ['a', 'a'] }).success).toBe(false)
  })
})

describe('WorksheetInput', () => {
  const base = { subjectCode: 'math', grade: 1, title: 'Make Ten (A)' }

  it('bố cục lưới từ chối câu kéo thả và báo đúng đường dẫn', () => {
    const r = WorksheetInput.safeParse({
      ...base,
      layout: 'grid',
      questions: [
        { body: { type: 'split_strategy', op: '+', a: 7, b: 6 } },
        { body: { type: 'clock_set', prompt: { text: 'Quay kim' }, hands: 'both', answer: { h: 3, m: 15 } } },
      ],
    })
    expect(issuePaths(r)).toEqual(['questions.1.body.type'])
  })

  it('mặc định layout là one_per_screen', () => {
    const r = WorksheetInput.parse({ ...base, questions: [{ body: { type: 'info', prompt: { text: 'Số 2' } } }] })
    expect(r.layout).toBe('one_per_screen')
  })
})
