import type { Choice, Point, QuestionBody } from './question.js'

/** Câu hỏi gửi cho bé trước khi nộp: không có đáp án (§4: không trả `answer`, `accept`, `pairs`). */
export type KidQuestionBody =
  | Omit<Extract<QuestionBody, { type: 'single_choice' }>, 'answer'>
  | Omit<Extract<QuestionBody, { type: 'multi_choice' }>, 'answer'>
  | Omit<Extract<QuestionBody, { type: 'true_false' }>, 'answer'>
  | (Omit<Extract<QuestionBody, { type: 'fill_blank' }>, 'blanks'> & {
      blanks: { id: string; input?: 'text' | 'number' | 'time' | 'choice'; options?: string[] }[]
    })
  | Omit<Extract<QuestionBody, { type: 'number_input' }>, 'answer' | 'tolerance'>
  | Omit<Extract<QuestionBody, { type: 'matching' }>, 'pairs'>
  | Omit<Extract<QuestionBody, { type: 'ordering' }>, 'answer'>
  | Extract<QuestionBody, { type: 'split_strategy' }>
  | Omit<Extract<QuestionBody, { type: 'clock_set' }>, 'answer'>
  | Extract<QuestionBody, { type: 'column_arith' }>
  | Extract<QuestionBody, { type: 'info' }>
  | (Omit<Extract<QuestionBody, { type: 'hotspot' }>, 'targets'> & { targetCount: number })
  // Lộ điểm đầu/cuối không lộ đáp án (ảnh mê cung đã vẽ sẵn), còn giúp app đánh dấu chỗ xuất phát và đích.
  | (Omit<Extract<QuestionBody, { type: 'maze' }>, 'path'> & { start: Point; end: Point })
  // Nét mẫu không phải đáp án cần giấu: app vẽ nó thành nét đứt để bé tô.
  | Extract<QuestionBody, { type: 'trace' }>
  | Extract<QuestionBody, { type: 'arith_gen' }>

/** PRNG nhỏ (mulberry32) để xáo trộn / sinh đề ổn định theo `seed`. */
export function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items]
  const rand = seededRandom(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** Xáo cho tới khi khác thứ tự đúng (nếu có thể), để câu sắp xếp không lộ đáp án. */
function shuffleAwayFrom(items: Choice[], answer: string[], seed: string): Choice[] {
  for (let k = 0; k < 10; k++) {
    const s = seededShuffle(items, `${seed}:${k}`)
    if (items.length < 2 || s.some((c, i) => c.id !== answer[i])) return s
  }
  return [...items].reverse()
}

/** Bỏ đáp án và xáo phương án. `seed` thường là `${attemptId}:${questionId}`. */
export function sanitizeForKid(q: QuestionBody, seed: string): KidQuestionBody {
  switch (q.type) {
    case 'single_choice':
    case 'multi_choice': {
      const { answer: _answer, ...rest } = q
      return { ...rest, choices: q.shuffle ? seededShuffle(q.choices, seed) : q.choices }
    }
    case 'true_false': {
      const { answer: _answer, ...rest } = q
      return rest
    }
    case 'fill_blank':
      return { ...q, blanks: q.blanks.map(({ id, input, options }) => ({ id, input, options })) }
    case 'number_input': {
      const { answer: _answer, tolerance: _tolerance, ...rest } = q
      return rest
    }
    case 'matching': {
      const { pairs: _pairs, ...rest } = q
      return { ...rest, right: seededShuffle(q.right, seed) }
    }
    case 'ordering': {
      const { answer, ...rest } = q
      return { ...rest, items: shuffleAwayFrom(q.items, answer, seed) }
    }
    case 'clock_set': {
      const { answer: _answer, ...rest } = q
      return rest
    }
    case 'hotspot': {
      const { targets, ...rest } = q
      return { ...rest, targetCount: targets.length }
    }
    case 'maze': {
      const { path, ...rest } = q
      return { ...rest, start: path[0]!, end: path[path.length - 1]! }
    }
    case 'split_strategy':
    case 'column_arith':
    case 'info':
    case 'trace':
    case 'arith_gen':
      return q
  }
}
