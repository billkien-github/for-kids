import { blankMatches, columnArithResult, deriveSplit, gradeQuestion } from '@for-kids/shared'
import { RichText } from '../RichText'
import { field, inputClass, type QuestionProps } from './common'

function ResultBadge({ ok, expected }: { ok: boolean; expected: string }) {
  return ok ? (
    <span className="ml-1 text-emerald-600">✓</span>
  ) : (
    <span className="ml-1 rounded-md bg-emerald-100 px-1.5 text-[0.8em] text-emerald-800">{expected}</span>
  )
}

export function FillBlank({ body, solution, response, onChange, lang }: QuestionProps<'fill_blank'>) {
  const values = field<Record<string, string>>(response, 'blanks', {})
  const set = (id: string, v: string) => onChange({ blanks: { ...values, [id]: v } })

  const renderBlank = (id: string) => {
    const blank = body.blanks.find((b) => b.id === id)
    if (!blank) return null
    const value = values[id] ?? ''
    const solved = solution?.blanks.find((b) => b.id === id)
    const ok = solved ? blankMatches(solved, value) : null
    const color = ok === null ? '' : ok ? 'border-emerald-500!' : 'border-red-400!'

    if (blank.input === 'choice' && blank.options) {
      return (
        <span className="mx-1 inline-flex gap-1 align-middle">
          {blank.options.map((o) => (
            <button
              key={o}
              type="button"
              disabled={!!solution}
              onClick={() => set(id, o)}
              className={`min-h-touch min-w-12 rounded-xl border-2 px-3 text-kid font-bold ${value === o ? `border-sky-500 bg-sky-100 ${color}` : 'border-slate-300 bg-white'}`}
            >
              {o}
            </button>
          ))}
          {solved && <ResultBadge ok={!!ok} expected={solved.accept[0]!} />}
        </span>
      )
    }
    const kind = blank.input ?? 'text'
    return (
      <span className="mx-1 inline-flex items-center align-middle">
        <input
          value={value}
          disabled={!!solution}
          onChange={(e) => set(id, e.target.value)}
          inputMode={kind === 'number' ? 'decimal' : kind === 'time' ? 'numeric' : 'text'}
          placeholder={kind === 'time' ? 'h:mm' : ''}
          autoComplete="off"
          autoCapitalize="off"
          className={`${inputClass} ${kind === 'text' ? 'w-40' : 'w-24'} ${color}`}
        />
        {solved && <ResultBadge ok={!!ok} expected={solved.accept[0]!} />}
      </span>
    )
  }

  return <RichText value={body.prompt} lang={lang} renderBlank={renderBlank} className="text-2xl" />
}

export function NumberInput({ body, solution, response, onChange }: QuestionProps<'number_input'>) {
  const value = field<string>(response, 'value', '')
  return (
    <div className="flex items-center justify-center gap-3">
      <input
        value={value}
        disabled={!!solution}
        onChange={(e) => onChange({ value: e.target.value })}
        inputMode="decimal"
        autoComplete="off"
        className={`${inputClass} w-36 text-3xl`}
      />
      {body.unit && <span className="text-xl">{body.unit}</span>}
      {solution && <ResultBadge ok={gradeQuestion(solution, response) === 1} expected={String(solution.answer)} />}
    </div>
  )
}

/** Tách–gộp qua 10 (§4): a + b = → a + x + y = kết quả, kiểu mẫu Math-Drills. */
export function SplitStrategy({ body, solution, response, onChange }: QuestionProps<'split_strategy'>) {
  const cells = field<string[]>(response, 'cells', ['', '', '', ''])
  const set = (i: number, v: string) => onChange({ cells: cells.map((c, j) => (j === i ? v : c)) })
  const expected = deriveSplit(body.op, body.a, body.b)
  const op = body.op === '+' ? '+' : '−'

  const cell = (i: number) => {
    const ok = solution && expected ? Number(cells[i]) === expected.cells[i] : null
    return (
      <span className="inline-flex flex-col items-center">
        <input
          value={cells[i] ?? ''}
          disabled={!!solution}
          onChange={(e) => set(i, e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          autoComplete="off"
          aria-label={['Số giữ lại', 'Số để tròn chục', 'Số còn lại', 'Kết quả'][i]}
          className={`${inputClass} w-20 ${ok === null ? '' : ok ? 'border-emerald-500!' : 'border-red-400!'}`}
        />
        {solution && expected && !ok && <span className="text-base text-emerald-700">{expected.cells[i]}</span>}
      </span>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 text-3xl">
      <p className="font-semibold">
        {body.a} {op} {body.b} =
      </p>
      <div className="flex gap-10 text-sm text-slate-500">
        <span>↓ Giữ</span>
        <span>↘ Tách</span>
      </div>
      <div className="flex flex-wrap items-start justify-center gap-2">
        {cell(0)}
        <span className="pt-2">{op}</span>
        {cell(1)}
        <span className="pt-2">{op}</span>
        {cell(2)}
        <span className="pt-2">=</span>
        {cell(3)}
      </div>
      {expected && <p className="text-sm text-slate-500">Tròn {expected.target}</p>}
    </div>
  )
}

/** Đặt tính dọc: chỉ nhập hàng kết quả. */
export function ColumnArith({ body, solution, response, onChange }: QuestionProps<'column_arith'>) {
  const result = field<string>(response, 'result', '')
  const [a, b] = body.operands
  const width = Math.max(String(a).length, String(b).length, String(columnArithResult(body)).length) + 1
  const ok = solution ? Number(result) === columnArithResult(solution) : null
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="font-mono text-4xl leading-tight" style={{ width: `${width + 1}ch` }}>
        <div className="text-right">{a}</div>
        <div className="flex justify-between">
          <span>{body.op === '+' ? '+' : '−'}</span>
          <span>{b}</span>
        </div>
        <div className="mt-1 border-t-4 border-slate-700" />
        <input
          value={result}
          disabled={!!solution}
          onChange={(e) => onChange({ result: e.target.value.replace(/\D/g, '') })}
          inputMode="numeric"
          autoComplete="off"
          aria-label="Kết quả"
          className={`mt-1 w-full rounded-lg border-2 bg-white px-1 text-right font-mono text-4xl outline-none ${
            ok === null ? 'border-slate-300 focus:border-sky-500' : ok ? 'border-emerald-500' : 'border-red-400'
          }`}
        />
      </div>
      {solution && !ok && <span className="text-emerald-700">Đáp án: {columnArithResult(solution)}</span>}
    </div>
  )
}

export function Info({ body, lang }: QuestionProps<'info'>) {
  return (
    <div className="flex flex-col gap-6">
      {body.pages?.map((p, i) => <RichText key={i} value={p} lang={lang} />)}
    </div>
  )
}
