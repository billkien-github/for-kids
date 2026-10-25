import { RichText } from '../RichText'
import { field, optionClass, type Mark, type QuestionProps } from './common'

export function SingleChoice({ body, solution, response, onChange, lang }: QuestionProps<'single_choice'>) {
  const chosen = field<string | null>(response, 'choice', null)
  const mark = (id: string): Mark => {
    if (!solution) return null
    if (id === solution.answer) return id === chosen ? 'correct' : 'missed'
    return id === chosen ? 'wrong' : null
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {body.choices.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={!!solution}
          onClick={() => onChange({ choice: c.id })}
          className={optionClass(chosen === c.id, mark(c.id))}
        >
          <RichText value={c.content} clockSize={120} lang={lang.startsWith('en') ? lang : undefined} />
        </button>
      ))}
    </div>
  )
}

export function MultiChoice({ body, solution, response, onChange, lang }: QuestionProps<'multi_choice'>) {
  const chosen = new Set(field<string[]>(response, 'choices', []))
  const toggle = (id: string) => {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange({ choices: [...next] })
  }
  const mark = (id: string): Mark => {
    if (!solution) return null
    const right = solution.answer.includes(id)
    if (right) return chosen.has(id) ? 'correct' : 'missed'
    return chosen.has(id) ? 'wrong' : null
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base text-slate-500">Chọn tất cả đáp án đúng</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {body.choices.map((c) => (
          <button key={c.id} type="button" disabled={!!solution} onClick={() => toggle(c.id)} className={optionClass(chosen.has(c.id), mark(c.id))}>
            <span className="flex items-center gap-3">
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-md border-2 ${chosen.has(c.id) ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-400'}`}>
                {chosen.has(c.id) && '✓'}
              </span>
              <RichText value={c.content} clockSize={120} lang={lang.startsWith('en') ? lang : undefined} />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function TrueFalse({ solution, response, onChange }: QuestionProps<'true_false'>) {
  const value = field<boolean | null>(response, 'value', null)
  const mark = (v: boolean): Mark => {
    if (!solution) return null
    if (v === solution.answer) return v === value ? 'correct' : 'missed'
    return v === value ? 'wrong' : null
  }
  return (
    <div className="grid grid-cols-2 gap-4">
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          disabled={!!solution}
          onClick={() => onChange({ value: v })}
          className={`${optionClass(value === v, mark(v))} text-center text-2xl font-semibold`}
        >
          {v ? '✅ Đúng' : '❌ Sai'}
        </button>
      ))}
    </div>
  )
}
