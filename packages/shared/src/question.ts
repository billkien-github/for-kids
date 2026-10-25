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
]

export const QuestionInput = z
  .object({
    body: QuestionBody,
    explanation: z.string().max(4000).optional(),
    points: z.number().positive().max(100).optional(),
    ttsLang: lang.optional(),
    skillCodes: z.array(z.string().min(1)).optional(),
  })
  .refine((q) => !(q.body.type === 'info' && q.points !== undefined && q.points !== 0), {
    path: ['points'],
    message: 'Câu info không tính điểm',
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
export type RichText = z.infer<typeof RichText>
export type Choice = z.infer<typeof Choice>
export type Blank = z.infer<typeof Blank>
export type QuestionBody = z.infer<typeof QuestionBody>
export type QuestionInput = z.infer<typeof QuestionInput>
export type WorksheetInput = z.infer<typeof WorksheetInput>
