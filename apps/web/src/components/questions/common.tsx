import type { KidQuestionBody, QuestionBody } from '@for-kids/shared'

export type QuestionProps<T extends QuestionBody['type']> = {
  body: Extract<KidQuestionBody, { type: T }>
  /** Đề đầy đủ kèm đáp án: có thì đang ở chế độ xem lại (không sửa được). */
  solution?: Extract<QuestionBody, { type: T }>
  response: unknown
  onChange: (response: unknown) => void
  lang: string
}

export type Mark = 'correct' | 'wrong' | 'missed' | null

export function optionClass(selected: boolean, mark: Mark = null) {
  const base = 'min-h-touch rounded-2xl border-2 px-4 py-3 text-left transition active:scale-[0.98] disabled:active:scale-100'
  if (mark === 'correct') return `${base} border-emerald-500 bg-emerald-50`
  if (mark === 'wrong') return `${base} border-red-400 bg-red-50`
  if (mark === 'missed') return `${base} border-dashed border-emerald-500 bg-white`
  return `${base} ${selected ? 'border-sky-500 bg-sky-100' : 'border-slate-200 bg-white'}`
}

export const inputClass =
  'min-h-touch rounded-xl border-2 border-slate-300 bg-white px-3 text-center text-kid outline-none focus:border-sky-500 disabled:bg-slate-50'

/** Đọc một trường trong câu trả lời (có thể chưa có). */
export function field<T>(response: unknown, key: string, fallback: T): T {
  return response && typeof response === 'object' && key in response ? ((response as Record<string, unknown>)[key] as T) : fallback
}
