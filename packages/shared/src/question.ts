import { z } from 'zod'
import { GRADE_MAX, GRADE_MIN } from './constants.js'
import { deriveSplit } from './split-strategy.js'

const id = z.string().min(1).max(64)
const lang = z.string().regex(/^[a-z]{2}-[A-Z]{2}$/, 'dạng BCP-47, ví dụ vi-VN')

export const ClockTime = z.object({
  h: z.number().int().min(1).max(12),
  m: z.number().int().min(0).max(59),
})

export const RichText = z
  .object({
    text: z.string().max(2000).optional(),
    sub: z.object({ text: z.string().min(1).max(2000), lang }).optional(),
    imageAssetId: z.uuid().optional(),
    clock: ClockTime.optional(),
    ttsText: z.string().max(2000).optional(),
  })
  .refine((r) => (r.text?.trim() ?? '') !== '' || r.imageAssetId || r.clock, {
    message: 'Cần ít nhất một trong text / imageAssetId / clock',
  })

export const Choice = z.object({ id, content: RichText })

export const Blank = z
  .object({
    id,
    accept: z.array(z.string().min(1)).min(1),
    caseSensitive: z.boolean().optional(),
    input: z.enum(['text', 'number', 'time', 'choice']).optional(),
    options: z.array(z.string().min(1)).min(2).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.input === 'choice') {
      if (!b.options) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Bắt buộc khi input = choice' })
      } else {
        for (const [i, a] of b.accept.entries()) {
          if (!b.options.includes(a)) {
            ctx.addIssue({ code: 'custom', path: ['accept', i], message: `"${a}" không có trong options` })
          }
        }
      }
    }
  })

function uniqueIds(items: { id: string }[], path: string, ctx: z.RefinementCtx) {
  const seen = new Set<string>()
  for (const [i, item] of items.entries()) {
    if (seen.has(item.id)) ctx.addIssue({ code: 'custom', path: [path, i, 'id'], message: `id "${item.id}" bị trùng` })
    seen.add(item.id)
  }
  return seen
}

const SingleChoice = z
  .object({
    type: z.literal('single_choice'),
    prompt: RichText,
    choices: z.array(Choice).min(2),
    answer: id,
    shuffle: z.boolean().optional(),
  })
  .superRefine((q, ctx) => {
    const ids = uniqueIds(q.choices, 'choices', ctx)
    if (!ids.has(q.answer)) ctx.addIssue({ code: 'custom', path: ['answer'], message: 'Không khớp id phương án nào' })
  })

const MultiChoice = z
  .object({
    type: z.literal('multi_choice'),
    prompt: RichText,
    choices: z.array(Choice).min(2),
    answer: z.array(id).min(1),
    shuffle: z.boolean().optional(),
  })
  .superRefine((q, ctx) => {
    const ids = uniqueIds(q.choices, 'choices', ctx)
    for (const [i, a] of q.answer.entries()) {
      if (!ids.has(a)) ctx.addIssue({ code: 'custom', path: ['answer', i], message: 'Không khớp id phương án nào' })
    }
  })

const TrueFalse = z.object({ type: z.literal('true_false'), prompt: RichText, answer: z.boolean() })

const FillBlank = z
  .object({ type: z.literal('fill_blank'), prompt: RichText, blanks: z.array(Blank).min(1) })
  .superRefine((q, ctx) => {
    const ids = uniqueIds(q.blanks, 'blanks', ctx)
    const inText = new Set([...(q.prompt.text ?? '').matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]!))
    for (const b of ids) {
      if (!inText.has(b)) ctx.addIssue({ code: 'custom', path: ['prompt', 'text'], message: `Thiếu {{${b}}} trong text` })
    }
    for (const t of inText) {
      if (!ids.has(t)) ctx.addIssue({ code: 'custom', path: ['blanks'], message: `{{${t}}} không có blank tương ứng` })
    }
  })

const NumberInput = z.object({
  type: z.literal('number_input'),
  prompt: RichText,
  answer: z.number(),
  tolerance: z.number().min(0).optional(),
  unit: z.string().max(32).optional(),
})

const Matching = z
  .object({
    type: z.literal('matching'),
    prompt: RichText,
    left: z.array(Choice).min(2),
    right: z.array(Choice).min(2),
    pairs: z.array(z.tuple([id, id])).min(1),
  })
  .superRefine((q, ctx) => {
    const left = uniqueIds(q.left, 'left', ctx)
    const right = uniqueIds(q.right, 'right', ctx)
    for (const [i, [l, r]] of q.pairs.entries()) {
      if (!left.has(l)) ctx.addIssue({ code: 'custom', path: ['pairs', i, 0], message: 'Không khớp id cột trái' })
      if (!right.has(r)) ctx.addIssue({ code: 'custom', path: ['pairs', i, 1], message: 'Không khớp id cột phải' })
    }
  })

const Ordering = z
  .object({ type: z.literal('ordering'), prompt: RichText, items: z.array(Choice).min(2), answer: z.array(id) })
  .superRefine((q, ctx) => {
    const ids = uniqueIds(q.items, 'items', ctx)
    const isPermutation = q.answer.length === ids.size && new Set(q.answer).size === ids.size && q.answer.every((a) => ids.has(a))
    if (!isPermutation) ctx.addIssue({ code: 'custom', path: ['answer'], message: 'Phải là một hoán vị của id các items' })
  })

const SplitStrategy = z
  .object({
    type: z.literal('split_strategy'),
    prompt: RichText.optional(),
    op: z.enum(['+', '-']),
    a: z.number().int().positive(),
    b: z.number().int().positive(),
  })
  .refine((q) => deriveSplit(q.op, q.a, q.b) !== null, {
    message: 'Phép tính phải qua chục (0 < x < b) thì mới dùng được tách–gộp',
  })

const ClockSet = z
  .object({
    type: z.literal('clock_set'),
    prompt: RichText,
    answer: ClockTime,
    hands: z.enum(['hour', 'both']),
    snapMinutes: z.union([z.literal(1), z.literal(5), z.literal(15), z.literal(30)]).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.hands === 'hour' && q.answer.m !== 0) {
      ctx.addIssue({ code: 'custom', path: ['answer', 'm'], message: 'hands = hour thì kim phút cố định ở 12, m phải là 0' })
    }
    const snap = q.snapMinutes ?? 5
    if (q.answer.m % snap !== 0) {
      ctx.addIssue({ code: 'custom', path: ['answer', 'm'], message: `m phải chia hết cho snapMinutes (${snap})` })
    }
  })

const ColumnArith = z
  .object({
    type: z.literal('column_arith'),
    prompt: RichText.optional(),
    op: z.enum(['+', '-']),
    operands: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    showCarry: z.boolean().optional(),
  })
  .refine((q) => q.op === '+' || q.operands[0] >= q.operands[1], { message: 'Phép trừ không được ra số âm' })

const Info = z.object({ type: z.literal('info'), prompt: RichText, pages: z.array(RichText).optional() })

// ---------- Câu vẽ/chạm trên ảnh: toạ độ theo pixel của ảnh gốc, gốc ở góc trên trái ----------

export const Point = z.tuple([z.number(), z.number()])
const Rect = z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() })
const canvas = {
  /** Kích thước ảnh (pixel). Toạ độ trong đề và trong câu trả lời đều theo hệ này. */
  width: z.number().positive().max(10000),
  height: z.number().positive().max(10000),
}
/** Bán kính sai lệch cho phép quanh nét (pixel), thường bằng nửa bề rộng lối đi / nét chữ. */
const tolerance = z.number().min(1)

function pointsInside(points: [number, number][], w: { width: number; height: number }, path: (string | number)[], ctx: z.RefinementCtx) {
  if (points.some(([x, y]) => x < 0 || y < 0 || x > w.width || y > w.height)) {
    ctx.addIssue({ code: 'custom', path, message: `Toạ độ phải nằm trong ảnh (0..${w.width}, 0..${w.height})` })
  }
}

const Hotspot = z
  .object({
    type: z.literal('hotspot'),
    prompt: RichText,
    image: z.uuid(),
    ...canvas,
    /** Các vùng đúng (hình chữ nhật). Bé chạm trúng mỗi vùng ít nhất một lần. */
    targets: z.array(Rect).min(1).max(50),
  })
  .superRefine((q, ctx) => {
    for (const [i, r] of q.targets.entries()) {
      pointsInside([[r.x, r.y], [r.x + r.w, r.y + r.h]], q, ['targets', i], ctx)
    }
  })

const Maze = z
  .object({
    type: z.literal('maze'),
    prompt: RichText,
    image: z.uuid(),
    ...canvas,
    /** Lối đi đúng, từ điểm xuất phát tới đích, đi theo giữa lối. */
    path: z.array(Point).min(2).max(1000),
    tolerance,
  })
  .superRefine((q, ctx) => pointsInside(q.path, q, ['path'], ctx))

const Trace = z
  .object({
    type: z.literal('trace'),
    prompt: RichText,
    /** Ảnh có sẵn nét mờ để tô. Không có ảnh thì app tự vẽ `paths` thành nét đứt. */
    image: z.uuid().optional(),
    ...canvas,
    /** Các nét mẫu (mỗi nét là một đường gấp khúc). */
    paths: z.array(z.array(Point).min(1).max(1000)).min(1).max(30),
    tolerance,
  })
  .superRefine((q, ctx) => q.paths.forEach((p, i) => pointsInside(p, q, ['paths', i], ctx)))

export const HexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'dạng #rrggbb')

/** Bảng màu mặc định của câu tô màu. */
export const COLORING_PALETTE = [
  '#ef4444', '#f97316', '#facc15', '#84cc16', '#22c55e', '#14b8a6',
  '#38bdf8', '#3b82f6', '#8b5cf6', '#ec4899', '#a16207', '#f5d0a9',
  '#64748b', '#111827',
] as const

const Coloring = z.object({
  type: z.literal('coloring'),
  prompt: RichText,
  /** Tranh nét đen trên nền trắng (hoặc trong suốt). Chạm vào vùng kín giữa các nét để đổ màu. */
  image: z.uuid(),
  ...canvas,
  /** Màu cho bé chọn; bỏ trống thì dùng COLORING_PALETTE. */
  palette: z.array(HexColor).min(2).max(24).optional(),
})

// ---------- Bài tự sinh: mỗi lần bé làm, server sinh `count` phép tính mới thành các câu fill_blank ----------

const ArithGen = z
  .object({
    type: z.literal('arith_gen'),
    ops: z.array(z.enum(['+', '-'])).min(1).max(2),
    /** Số nhỏ nhất của mỗi số hạng (mặc định 0). */
    min: z.number().int().min(0).optional(),
    /** Phạm vi: mọi số trong phép tính (kể cả kết quả) không vượt quá `max`. */
    max: z.number().int().min(1).max(1000),
    count: z.number().int().min(1).max(50),
    /** Ô bé điền: kết quả (mặc định), một số hạng, hoặc trộn cả hai. */
    missing: z.enum(['result', 'operand', 'mixed']).optional(),
  })
  .superRefine((q, ctx) => {
    if (new Set(q.ops).size !== q.ops.length) ctx.addIssue({ code: 'custom', path: ['ops'], message: 'Phép tính bị lặp' })
    if ((q.min ?? 0) >= q.max) ctx.addIssue({ code: 'custom', path: ['min'], message: 'min phải nhỏ hơn max' })
    // Cộng hai số đều ≥ min mà tổng ≤ max thì cần 2 × min ≤ max.
    else if (q.ops.includes('+') && 2 * (q.min ?? 0) > q.max) {
      ctx.addIssue({ code: 'custom', path: ['min'], message: 'Có phép cộng thì 2 × min không được vượt max' })
    }
  })

export const QuestionBody = z.discriminatedUnion('type', [
  SingleChoice,
  MultiChoice,
  TrueFalse,
  FillBlank,
  NumberInput,
  Matching,
  Ordering,
  SplitStrategy,
  ClockSet,
  ColumnArith,
  Info,
  Hotspot,
  Maze,
  Trace,
  Coloring,
  ArithGen,
])

export type QuestionType = z.infer<typeof QuestionBody>['type']
export const QUESTION_TYPES = QuestionBody.options.map((o) => o.shape.type.value) as QuestionType[]

// Các loại câu được phép trong bố cục lưới (§3).
export const GRID_QUESTION_TYPES: readonly QuestionType[] = [
  'fill_blank',
  'number_input',
  'true_false',
  'single_choice',
  'split_strategy',
  'column_arith',
  'arith_gen',
]

/** Số câu tối đa của một lần làm bài, tính cả các phép tính câu arith_gen sinh ra (khớp trần lưu câu trả lời). */
export const MAX_ITEMS_PER_ATTEMPT = 200

export const QuestionInput = z
  .object({
    body: QuestionBody,
    explanation: z.string().max(4000).optional(),
    // Nhận cả 0 để dữ liệu đọc từ get_worksheet (câu info có points 0) gửi lại nguyên văn được.
    points: z.number().min(0).max(100).optional(),
    ttsLang: lang.optional(),
    skillCodes: z.array(z.string().min(1)).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.points === undefined) return
    if (q.body.type === 'info' && q.points !== 0) ctx.addIssue({ code: 'custom', path: ['points'], message: 'Câu info không tính điểm' })
    if (q.body.type !== 'info' && q.points === 0) ctx.addIssue({ code: 'custom', path: ['points'], message: 'Câu có chấm điểm phải có điểm lớn hơn 0' })
  })

const WorksheetFields = z.object({
  subjectCode: z.string().min(1),
  grade: z.number().int().min(GRADE_MIN).max(GRADE_MAX),
  topic: z.string().min(1).nullish(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  lang: lang.nullish(),
  layout: z.enum(['one_per_screen', 'grid']).default('one_per_screen'),
  timeLimitSec: z.number().int().positive().max(4 * 60 * 60).nullish(),
  sourceNote: z.string().max(2000).nullish(),
  questions: z.array(QuestionInput).min(1).max(200),
})

/** Sửa bài: chỉ gửi những trường cần đổi; `questions` có mặt thì thay toàn bộ danh sách câu. */
export const WorksheetPatch = WorksheetFields.partial().extend({ layout: z.enum(['one_per_screen', 'grid']).optional() })
export type WorksheetPatch = z.infer<typeof WorksheetPatch>

export const WorksheetInput = WorksheetFields.superRefine((w, ctx) => {
    const items = w.questions.reduce((n, q) => n + (q.body.type === 'arith_gen' ? q.body.count : 1), 0)
    if (items > MAX_ITEMS_PER_ATTEMPT) {
      ctx.addIssue({ code: 'custom', path: ['questions'], message: `Mỗi lần làm tối đa ${MAX_ITEMS_PER_ATTEMPT} câu (câu arith_gen tính theo count)` })
    }
    if (w.layout !== 'grid') return
    for (const [i, q] of w.questions.entries()) {
      if (!GRID_QUESTION_TYPES.includes(q.body.type)) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', i, 'body', 'type'],
          message: `Loại ${q.body.type} không dùng được trong bố cục lưới`,
        })
      }
    }
  })

export type ClockTime = z.infer<typeof ClockTime>
export type Point = z.infer<typeof Point>
export type RichText = z.infer<typeof RichText>
export type Choice = z.infer<typeof Choice>
export type Blank = z.infer<typeof Blank>
export type QuestionBody = z.infer<typeof QuestionBody>
export type QuestionInput = z.infer<typeof QuestionInput>
export type WorksheetInput = z.infer<typeof WorksheetInput>
