import type { QuestionBody } from './question.js'
import { seededRandom } from './sanitize.js'

type ArithGen = Extract<QuestionBody, { type: 'arith_gen' }>
type FillBlank = Extract<QuestionBody, { type: 'fill_blank' }>

export type GeneratedItem = { body: FillBlank; explanation: string }

/**
 * Sinh các phép tính cho câu `arith_gen` (§4): cộng thì tổng ≤ max, trừ thì số trừ ≤ số bị trừ ≤ max.
 * Cùng `seed` cho cùng kết quả. Không lặp phép tính nếu phạm vi đủ rộng.
 */
export function expandArithGen(q: ArithGen, seed: string, count = q.count): GeneratedItem[] {
  const rand = seededRandom(seed)
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
  const lo = q.min ?? 0
  const missing = q.missing ?? 'result'
  const seen = new Set<string>()
  const out: GeneratedItem[] = []

  for (let tries = 0; out.length < count && tries < count * 50; tries++) {
    const op = q.ops[int(0, q.ops.length - 1)]!
    let a: number
    let b: number
    if (op === '+') {
      a = int(lo, q.max - lo)
      b = int(lo, q.max - a)
    } else {
      a = int(lo, q.max)
      b = int(Math.min(lo, a), a)
    }
    const key = `${a}${op}${b}`
    // Hết phép tính mới (phạm vi hẹp) thì chấp nhận lặp lại.
    if (seen.has(key) && tries < count * 25) continue
    seen.add(key)

    const sign = op === '+' ? '+' : '−'
    const c = op === '+' ? a + b : a - b
    const where = missing === 'mixed' ? (['result', 'a', 'b'] as const)[int(0, 2)]! : missing === 'operand' ? (rand() < 0.5 ? 'a' : 'b') : 'result'
    const [text, answer] =
      where === 'a' ? [`{{1}} ${sign} ${b} = ${c}`, a] : where === 'b' ? [`${a} ${sign} {{1}} = ${c}`, b] : [`${a} ${sign} ${b} = {{1}}`, c]
    out.push({
      body: { type: 'fill_blank', prompt: { text }, blanks: [{ id: '1', input: 'number', accept: [String(answer)] }] },
      explanation: `${a} ${sign} ${b} = ${c}`,
    })
  }
  return out
}
