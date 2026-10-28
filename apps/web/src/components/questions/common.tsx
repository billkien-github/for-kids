import type { KidQuestionBody, QuestionBody } from '@for-kids/shared'
import type { InputHTMLAttributes } from 'react'

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

/** Trên iPad (pointer coarse) ô to hơn để bé viết bằng Apple Pencil (Scribble). */
export const inputClass =
  'min-h-touch rounded-xl border-2 border-slate-300 bg-white px-3 text-center text-kid outline-none focus:border-sky-500 disabled:bg-slate-50 pointer-coarse:min-h-16 pointer-coarse:text-3xl'

type AnswerInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onValue: (v: string) => void
  wrapperClassName?: string
}

/**
 * Ô điền đáp án có nút ✕ ở góc: viết bằng Apple Pencil (Scribble) thì không có phím xoá, bé chạm ✕ để viết lại.
 * Nút nằm đè lên viền, không chiếm chỗ viết trong ô.
 */
export function AnswerInput({ value, onValue, wrapperClassName = 'inline-flex', disabled, ...rest }: AnswerInputProps) {
  return (
    <span className={`relative ${wrapperClassName}`}>
      <input value={value} disabled={disabled} onChange={(e) => onValue(e.target.value)} autoComplete="off" {...rest} />
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onValue('')}
          aria-label="Xoá để viết lại"
          // Không chen vào thứ tự Tab giữa các ô. Vùng chạm 32px, chỉ lòi ra ngoài ô 10px để không lấn sang ô bên cạnh.
          tabIndex={-1}
          className="absolute -top-2.5 -right-2.5 grid size-8 place-items-center"
        >
          <span className="grid size-7 place-items-center rounded-full bg-slate-500 text-sm leading-none font-bold text-white shadow ring-2 ring-white active:bg-slate-700">
            ✕
          </span>
        </button>
      )}
    </span>
  )
}

/** Ký tự Scribble hay đọc nhầm từ chữ số viết tay của trẻ. */
const DIGIT_LOOKALIKES: Record<string, string> = {
  l: '1', I: '1', i: '1', '|': '1', '!': '1',
  O: '0', o: '0', D: '0', Q: '0',
  Z: '2', z: '2',
  S: '5', s: '5',
  b: '6', G: '6',
  T: '7',
  B: '8',
  g: '9', q: '9',
}

/** Đổi ký tự nhầm về chữ số rồi bỏ mọi ký tự không phải số (trừ các ký tự trong `keep`), thay vì xoá mất nét bé vừa viết. */
export function handwrittenDigits(s: string, keep = ''): string {
  return [...s]
    .map((c) => DIGIT_LOOKALIKES[c] ?? c)
    .filter((c) => (c >= '0' && c <= '9') || keep.includes(c))
    .join('')
}

/** Đọc một trường trong câu trả lời (có thể chưa có). */
export function field<T>(response: unknown, key: string, fallback: T): T {
  return response && typeof response === 'object' && key in response ? ((response as Record<string, unknown>)[key] as T) : fallback
}
