import { z } from 'zod'
import { gradeHotspot, gradeMaze, gradeTrace } from './drawing.js'
import { Point, type Blank, type QuestionBody, type QuestionType } from './question.js'
import { deriveSplit } from './split-strategy.js'

// ---------- Câu trả lời của bé (lưu ở attempt_answer.response) ----------

/** Trần số nét / số điểm mỗi nét của câu vẽ. Vượt trần thì cắt bớt khi chấm, không coi cả câu là sai. */
export const MAX_STROKES = 100
export const MAX_STROKE_POINTS = 5000
const Strokes = z.array(z.array(Point)).transform((s) => s.slice(0, MAX_STROKES).map((l) => l.slice(0, MAX_STROKE_POINTS)))

export const ResponseSchemas = {
  single_choice: z.object({ choice: z.string() }),
  multi_choice: z.object({ choices: z.array(z.string()) }),
  true_false: z.object({ value: z.boolean() }),
  fill_blank: z.object({ blanks: z.record(z.string(), z.string()) }),
  number_input: z.object({ value: z.string() }),
  matching: z.object({ pairs: z.array(z.tuple([z.string(), z.string()])) }),
  ordering: z.object({ order: z.array(z.string()) }),
  split_strategy: z.object({ cells: z.array(z.string()).length(4) }),
  // hourAngle: góc kim giờ tính bằng độ, 0 = số 12, theo chiều kim đồng hồ.
  clock_set: z.object({ hourAngle: z.number(), minute: z.number().int().min(0).max(59) }),
  // Dãy chữ số ở hàng kết quả, từ trái sang phải.
  column_arith: z.object({ result: z.string() }),
  info: z.object({}),
  // Toạ độ các lần chạm / các nét vẽ, theo pixel của ảnh trong đề.
  hotspot: z.object({ taps: z.array(Point).max(100) }),
  maze: z.object({ strokes: Strokes }),
  trace: z.object({ strokes: Strokes }),
  // Không bao giờ tới tay bé: server đã sinh thành các câu fill_blank lúc bắt đầu làm.
  arith_gen: z.object({}),
} satisfies Record<QuestionType, z.ZodType>

export type QuestionResponse<T extends QuestionType = QuestionType> = z.infer<(typeof ResponseSchemas)[T]>

// ---------- Chuẩn hoá ----------

const collapse = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ')

function parseNumber(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null
  return Number(t)
}

/** "05:50", "5.50", "5:50" → "5:50"; giờ 0–23, phút 00–59. */
export function normalizeTime(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\s*[:.hH]\s*(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${h}:${String(min).padStart(2, '0')}`
}

export function blankMatches(blank: Blank, given: string | undefined): boolean {
  if (given === undefined) return false
  switch (blank.input ?? 'text') {
    case 'number': {
      const n = parseNumber(given)
      return n !== null && blank.accept.some((a) => parseNumber(a) === n)
    }
    case 'time': {
      const t = normalizeTime(given)
      return t !== null && blank.accept.some((a) => normalizeTime(a) === t)
    }
    case 'choice':
      return blank.accept.includes(given)
    case 'text': {
      // Dấu tiếng Việt phải đúng; chỉ bỏ qua khoảng trắng thừa và (tuỳ chọn) hoa/thường.
      const norm = (s: string) => (blank.caseSensitive ? collapse(s) : collapse(s).toLocaleLowerCase('vi'))
      return blank.accept.some((a) => norm(a) === norm(given))
    }
  }
}

// ---------- Chấm điểm ----------

const angleDiff = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360)
  return Math.min(d, 360 - d)
}

/** Vị trí chuẩn của kim giờ (độ) cho h:m. */
export const hourHandAngle = (h: number, m: number) => ((h % 12) * 30 + m * 0.5) % 360

export const HOUR_HAND_TOLERANCE_DEG = 15

/** Kết quả đúng của phép tính đặt tính dọc. */
export const columnArithResult = (q: Extract<QuestionBody, { type: 'column_arith' }>) =>
  q.op === '+' ? q.operands[0] + q.operands[1] : q.operands[0] - q.operands[1]

/**
 * Điểm 0..1 cho một câu (§4 spec). Câu trả lời thiếu hoặc sai định dạng được 0 điểm.
 * Câu `info` không chấm, trả về null.
 */
export function gradeQuestion(q: QuestionBody, rawResponse: unknown): number | null {
  if (q.type === 'info' || q.type === 'arith_gen') return null
  const parsed = ResponseSchemas[q.type].safeParse(rawResponse)
  if (!parsed.success) return 0
  const r = parsed.data as never

  switch (q.type) {
    case 'single_choice':
      return (r as QuestionResponse<'single_choice'>).choice === q.answer ? 1 : 0
    case 'multi_choice': {
      const given = new Set((r as QuestionResponse<'multi_choice'>).choices)
      return given.size === q.answer.length && q.answer.every((a) => given.has(a)) ? 1 : 0
    }
    case 'true_false':
      return (r as QuestionResponse<'true_false'>).value === q.answer ? 1 : 0
    case 'fill_blank': {
      const given = (r as QuestionResponse<'fill_blank'>).blanks
      return q.blanks.filter((b) => blankMatches(b, given[b.id])).length / q.blanks.length
    }
    case 'number_input': {
      const n = parseNumber((r as QuestionResponse<'number_input'>).value)
      return n !== null && Math.abs(n - q.answer) <= (q.tolerance ?? 0) + 1e-9 ? 1 : 0
    }
    case 'matching': {
      const given = new Map((r as QuestionResponse<'matching'>).pairs)
      return q.pairs.filter(([l, rr]) => given.get(l) === rr).length / q.pairs.length
    }
    case 'ordering': {
      const order = (r as QuestionResponse<'ordering'>).order
      return order.length === q.answer.length && order.every((id, i) => id === q.answer[i]) ? 1 : 0
    }
    case 'split_strategy': {
      const expected = deriveSplit(q.op, q.a, q.b)
      if (!expected) return 0
      const cells = (r as QuestionResponse<'split_strategy'>).cells
      return expected.cells.filter((v, i) => parseNumber(cells[i] ?? '') === v).length / 4
    }
    case 'clock_set': {
      const { hourAngle, minute } = r as QuestionResponse<'clock_set'>
      const minuteOk = q.hands === 'hour' || minute === q.answer.m
      const hourOk = angleDiff(hourAngle, hourHandAngle(q.answer.h, q.answer.m)) <= HOUR_HAND_TOLERANCE_DEG
      return minuteOk && hourOk ? 1 : 0
    }
    case 'column_arith': {
      const n = parseNumber((r as QuestionResponse<'column_arith'>).result)
      return n === columnArithResult(q) ? 1 : 0
    }
    case 'hotspot':
      return gradeHotspot(q.targets, (r as QuestionResponse<'hotspot'>).taps)
    case 'maze':
      return gradeMaze(q, (r as QuestionResponse<'maze'>).strokes)
    case 'trace':
      return gradeTrace(q, (r as QuestionResponse<'trace'>).strokes)
  }
}

/** §5.1: score_pct = Σ(score × points) / Σ points × 100. Câu info (points 0) không ảnh hưởng. */
export function scorePercent(items: { score: number; points: number }[]): { total: number; earned: number; pct: number } {
  const total = items.reduce((s, i) => s + i.points, 0)
  const earned = items.reduce((s, i) => s + i.score * i.points, 0)
  return { total, earned, pct: total === 0 ? 100 : Math.round((earned / total) * 1000) / 10 }
}

/** Số sao (0–3) theo ngưỡng % của gia đình, mặc định 50/75/90. */
export const starsFor = (pct: number, thresholds: readonly number[]) => thresholds.filter((t) => pct >= t).length

/** Bé đã trả lời câu này chưa (để đánh dấu câu bỏ trống ở màn xem lại). */
export function isAnswered(q: QuestionBody, rawResponse: unknown): boolean {
  if (q.type === 'info' || q.type === 'arith_gen') return true
  const parsed = ResponseSchemas[q.type].safeParse(rawResponse)
  if (!parsed.success) return false
  const r = parsed.data as Record<string, unknown>
  switch (q.type) {
    case 'multi_choice':
      return (r.choices as string[]).length > 0
    case 'fill_blank':
      return q.blanks.every((b) => ((r.blanks as Record<string, string>)[b.id] ?? '').trim() !== '')
    case 'number_input':
      return (r.value as string).trim() !== ''
    case 'matching':
      return (r.pairs as unknown[]).length >= q.left.length
    case 'split_strategy':
      return (r.cells as string[]).every((c) => c.trim() !== '')
    case 'column_arith':
      return (r.result as string).trim() !== ''
    case 'hotspot':
      return (r.taps as unknown[]).length > 0
    case 'maze':
    case 'trace':
      return (r.strokes as unknown[]).length > 0
    default:
      return true
  }
}
