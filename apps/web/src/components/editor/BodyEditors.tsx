import { deriveSplit, type Blank, type Choice, type QuestionBody, type QuestionType } from '@for-kids/shared'
import type { ReactNode } from 'react'
import { ArithGenEditor, HotspotEditor, MazeEditor, TraceEditor } from './DrawEditors'
import { fieldClass, RichTextEditor } from './RichTextEditor'

export const TYPE_LABEL: Record<QuestionType, string> = {
  single_choice: 'Trắc nghiệm 1 đáp án',
  multi_choice: 'Trắc nghiệm nhiều đáp án',
  true_false: 'Đúng / Sai',
  fill_blank: 'Điền chỗ trống',
  number_input: 'Nhập số',
  matching: 'Nối cột',
  ordering: 'Sắp xếp thứ tự',
  split_strategy: 'Tách–gộp qua 10',
  clock_set: 'Quay kim đồng hồ',
  column_arith: 'Đặt tính dọc',
  info: 'Thẻ bài học (không chấm)',
  hotspot: 'Chạm vào hình',
  maze: 'Mê cung (vẽ đường)',
  trace: 'Tô theo nét',
  arith_gen: 'Phép tính tự sinh',
}

const letters = 'abcdefghijklmnopqrstuvwxyz'
const choice = (i: number, text = ''): Choice => ({ id: letters[i]!, content: { text } })

/** Câu mới theo loại, đủ hợp lệ để soạn tiếp. */
export function newBody(type: QuestionType): QuestionBody {
  const prompt = { text: '' }
  switch (type) {
    case 'single_choice':
      return { type, prompt, choices: [choice(0), choice(1)], answer: 'a' }
    case 'multi_choice':
      return { type, prompt, choices: [choice(0), choice(1), choice(2)], answer: ['a'] }
    case 'true_false':
      return { type, prompt, answer: true }
    case 'fill_blank':
      return { type, prompt: { text: '3 + {{1}} = 8' }, blanks: [{ id: '1', accept: ['5'], input: 'number' }] }
    case 'number_input':
      return { type, prompt, answer: 0 }
    case 'matching':
      return {
        type,
        prompt: { text: 'Nối cho đúng' },
        left: [{ id: 'l1', content: { text: '' } }, { id: 'l2', content: { text: '' } }],
        right: [{ id: 'r1', content: { text: '' } }, { id: 'r2', content: { text: '' } }],
        pairs: [
          ['l1', 'r1'],
          ['l2', 'r2'],
        ],
      }
    case 'ordering':
      return { type, prompt: { text: 'Xếp theo thứ tự' }, items: [choice(0), choice(1), choice(2)], answer: ['a', 'b', 'c'] }
    case 'split_strategy':
      return { type, op: '+', a: 7, b: 6 }
    case 'clock_set':
      return { type, prompt: { text: 'Quay kim chỉ 3 giờ' }, answer: { h: 3, m: 0 }, hands: 'hour' }
    case 'column_arith':
      return { type, op: '+', operands: [14, 78] }
    case 'info':
      return { type, prompt: { text: '' } }
    // Câu trên ảnh: chọn ảnh xong mới có kích thước và toạ độ.
    case 'hotspot':
      return { type, prompt: { text: 'Tìm và chạm vào…' }, image: '', width: 0, height: 0, targets: [] }
    case 'maze':
      return { type, prompt: { text: 'Tìm đường đi' }, image: '', width: 0, height: 0, path: [], tolerance: 20 }
    case 'trace':
      return { type, prompt: { text: 'Tô theo nét' }, width: 400, height: 400, paths: [], tolerance: 16 }
    case 'arith_gen':
      return { type, ops: ['+'], max: 10, count: 20 }
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-28 text-slate-500">{label}</span>
      {children}
    </label>
  )
}

const num = (v: string) => (v === '' ? 0 : Number(v))
const list = (v: string) =>
  v
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)

type EditorProps<T extends QuestionType> = { body: Extract<QuestionBody, { type: T }>; onChange: (b: QuestionBody) => void }

function ChoicesEditor({ body, onChange }: EditorProps<'single_choice' | 'multi_choice'>) {
  const multi = body.type === 'multi_choice'
  const isAnswer = (id: string) => (multi ? (body.answer as string[]).includes(id) : body.answer === id)
  const toggleAnswer = (id: string) => {
    if (!multi) return onChange({ ...body, answer: id } as QuestionBody)
    const cur = body.answer as string[]
    onChange({ ...body, answer: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } as QuestionBody)
  }
  const setChoices = (choices: Choice[]) => {
    const ids = new Set(choices.map((c) => c.id))
    const answer = multi ? (body.answer as string[]).filter((a) => ids.has(a)) : ids.has(body.answer as string) ? body.answer : choices[0]?.id ?? ''
    onChange({ ...body, choices, answer } as QuestionBody)
  }
  const nextId = () => letters.split('').find((l) => !body.choices.some((c) => c.id === l)) ?? `c${body.choices.length}`

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">Phương án ({multi ? 'tick các đáp án đúng' : 'chọn đáp án đúng'}):</p>
      {body.choices.map((c, i) => (
        <div key={c.id} className="flex items-start gap-2">
          <input
            type={multi ? 'checkbox' : 'radio'}
            checked={isAnswer(c.id)}
            onChange={() => toggleAnswer(c.id)}
            className="mt-3 size-5"
            aria-label={`Đáp án ${c.id}`}
          />
          <span className="mt-3 w-5 font-semibold uppercase">{c.id}</span>
          <div className="flex-1">
            <RichTextEditor compact value={c.content} onChange={(content) => setChoices(body.choices.map((x, j) => (j === i ? { ...x, content } : x)))} />
          </div>
          <button type="button" onClick={() => setChoices(body.choices.filter((_, j) => j !== i))} disabled={body.choices.length <= 2} className="mt-2 px-2 text-red-600 disabled:opacity-30">
            ✕
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => setChoices([...body.choices, { id: nextId(), content: { text: '' } }])} className="min-h-11 rounded-lg bg-slate-100 px-3 text-sm">
          + Phương án
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!body.shuffle} onChange={(e) => onChange({ ...body, shuffle: e.target.checked || undefined } as QuestionBody)} className="size-5" />
          Xáo trộn phương án
        </label>
      </div>
    </div>
  )
}

/** Ô trống lấy theo các {{id}} trong đề; thêm/bớt ô bằng cách sửa đề. */
function FillBlankEditor({ body, onChange }: EditorProps<'fill_blank'>) {
  const ids = [...new Set([...(body.prompt.text ?? '').matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]!))]
  const blankOf = (id: string): Blank => body.blanks.find((b) => b.id === id) ?? { id, accept: [], input: 'text' }
  // Danh sách ô luôn theo đúng các {{id}} trong đề; ô đã soạn thì giữ đáp án.
  const sync = (prompt: typeof body.prompt, blanks: Blank[]) => {
    const want = [...new Set([...(prompt.text ?? '').matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]!))]
    onChange({ ...body, prompt, blanks: want.map((id) => blanks.find((b) => b.id === id) ?? { id, accept: [], input: 'text' }) })
  }
  const setBlank = (b: Blank) => sync(body.prompt, [...body.blanks.filter((x) => x.id !== b.id), b])
  const insertBlank = () => {
    const n = ids.reduce((m, id) => Math.max(m, Number(id) || 0), 0) + 1
    sync({ ...body.prompt, text: `${body.prompt.text ?? ''} {{${n}}}` }, body.blanks)
  }

  return (
    <div className="flex flex-col gap-3">
      <RichTextEditor
        value={body.prompt}
        onChange={(prompt) => sync(prompt, body.blanks)}
        placeholder="Đề, ô trống viết {{1}}, {{2}}…"
        hint="Ô trống viết {{1}}, {{2}}… ngay trong đề. Phân số viết [[2/5]]."
      />
      <button type="button" onClick={insertBlank} className="min-h-11 self-start rounded-lg bg-slate-100 px-3 text-sm">
        + Chèn ô trống
      </button>
      {ids.map((id) => {
        const b = blankOf(id)
        return (
          <div key={id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2 text-sm">
            <span className="font-mono font-semibold">{`{{${id}}}`}</span>
            <select value={b.input ?? 'text'} onChange={(e) => setBlank({ ...b, input: e.target.value as Blank['input'] })} className={fieldClass}>
              <option value="text">Chữ</option>
              <option value="number">Số</option>
              <option value="time">Giờ (h:mm)</option>
              <option value="choice">Chọn (vd. &lt; &gt; =)</option>
            </select>
            <input
              value={b.accept.join(' | ')}
              onChange={(e) => setBlank({ ...b, accept: list(e.target.value) })}
              placeholder="Đáp án đúng (nhiều đáp án cách nhau bởi |)"
              className={`${fieldClass} min-w-48 flex-1`}
            />
            {b.input === 'choice' && (
              <input
                value={(b.options ?? []).join(' | ')}
                onChange={(e) => setBlank({ ...b, options: list(e.target.value) })}
                placeholder="Các lựa chọn: < | > | ="
                className={`${fieldClass} w-40`}
              />
            )}
            {(b.input ?? 'text') === 'text' && (
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!b.caseSensitive} onChange={(e) => setBlank({ ...b, caseSensitive: e.target.checked || undefined })} />
                Phân biệt hoa/thường
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}

const emptyChoice = (): Choice => ({ id: '', content: { text: '' } })

function MatchingEditor({ body, onChange }: EditorProps<'matching'>) {
  // Mỗi hàng là một cặp đúng theo `pairs` (không theo vị trí trong mảng); ô phải không thuộc cặp nào là ô gây nhiễu.
  const pairOf = new Map(body.pairs)
  const rightById = new Map(body.right.map((r) => [r.id, r]))
  const rows = body.left.map((l) => ({ l, r: rightById.get(pairOf.get(l.id) ?? '') ?? emptyChoice() }))
  const paired = new Set(body.pairs.map(([, r]) => r))
  const extras = body.right.filter((r) => !paired.has(r.id))

  const write = (nextRows: { l: Choice; r: Choice }[], nextExtras: Choice[]) => {
    const left = nextRows.map((x, i) => ({ ...x.l, id: `l${i + 1}` }))
    const right = [...nextRows.map((x, i) => ({ ...x.r, id: `r${i + 1}` })), ...nextExtras.map((x, i) => ({ ...x, id: `x${i + 1}` }))]
    onChange({ ...body, left, right, pairs: left.map((l, i) => [l.id, `r${i + 1}`] as [string, string]) })
  }
  const setRows = (next: { l: Choice; r: Choice }[]) => write(next, extras)

  return (
    <div className="flex flex-col gap-3">
      <RichTextEditor value={body.prompt} onChange={(prompt) => onChange({ ...body, prompt })} placeholder="Đề" />
      <p className="text-sm text-slate-500">Mỗi hàng là một cặp đúng (bé sẽ thấy cột phải bị xáo):</p>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-start gap-2">
          <RichTextEditor compact value={row.l.content} onChange={(content) => setRows(rows.map((x, j) => (j === i ? { ...x, l: { ...x.l, content } } : x)))} />
          <span className="mt-3">↔</span>
          <RichTextEditor compact value={row.r.content} onChange={(content) => setRows(rows.map((x, j) => (j === i ? { ...x, r: { ...x.r, content } } : x)))} />
          <button type="button" disabled={rows.length <= 2} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="mt-2 px-2 text-red-600 disabled:opacity-30">
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { l: emptyChoice(), r: emptyChoice() }])} className="min-h-11 self-start rounded-lg bg-slate-100 px-3 text-sm">
        + Cặp
      </button>

      <p className="text-sm text-slate-500">Ô bên phải gây nhiễu (không nối với ô nào, không bắt buộc):</p>
      {extras.map((x, i) => (
        <div key={x.id || i} className="flex items-start gap-2">
          <div className="flex-1">
            <RichTextEditor compact value={x.content} onChange={(content) => write(rows, extras.map((e, j) => (j === i ? { ...e, content } : e)))} />
          </div>
          <button type="button" onClick={() => write(rows, extras.filter((_, j) => j !== i))} className="mt-2 px-2 text-red-600">
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => write(rows, [...extras, emptyChoice()])} className="min-h-11 self-start rounded-lg bg-slate-100 px-3 text-sm">
        + Ô gây nhiễu
      </button>
    </div>
  )
}

function OrderingEditor({ body, onChange }: EditorProps<'ordering'>) {
  // Soạn theo thứ tự đúng; bé thấy bị xáo.
  const ordered = body.answer.map((id) => body.items.find((x) => x.id === id)).filter((x): x is Choice => !!x)
  const setItems = (items: Choice[]) => {
    const withIds = items.map((x, i) => ({ ...x, id: letters[i] ?? `i${i}` }))
    onChange({ ...body, items: withIds, answer: withIds.map((x) => x.id) })
  }
  return (
    <div className="flex flex-col gap-3">
      <RichTextEditor value={body.prompt} onChange={(prompt) => onChange({ ...body, prompt })} placeholder="Đề" />
      <p className="text-sm text-slate-500">Nhập theo thứ tự ĐÚNG (bé sẽ thấy bị xáo):</p>
      {ordered.map((c, i) => (
        <div key={c.id} className="flex items-start gap-2">
          <span className="mt-3 w-6 text-right font-semibold text-slate-400">{i + 1}.</span>
          <div className="flex-1">
            <RichTextEditor compact value={c.content} onChange={(content) => setItems(ordered.map((x, j) => (j === i ? { ...x, content } : x)))} />
          </div>
          <button type="button" disabled={ordered.length <= 2} onClick={() => setItems(ordered.filter((_, j) => j !== i))} className="mt-2 px-2 text-red-600 disabled:opacity-30">
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setItems([...ordered, { id: '', content: { text: '' } }])} className="min-h-11 self-start rounded-lg bg-slate-100 px-3 text-sm">
        + Mục
      </button>
    </div>
  )
}

/** Phần riêng của từng loại câu. */
export function BodyEditor({ body, onChange }: { body: QuestionBody; onChange: (b: QuestionBody) => void }) {
  const promptEditor = 'prompt' in body && body.prompt && (
    <RichTextEditor value={body.prompt} onChange={(prompt) => onChange({ ...body, prompt } as QuestionBody)} placeholder="Đề bài" hint="Phân số viết [[2/5]]." />
  )

  switch (body.type) {
    case 'single_choice':
    case 'multi_choice':
      return (
        <div className="flex flex-col gap-3">
          {promptEditor}
          <ChoicesEditor body={body} onChange={onChange} />
        </div>
      )
    case 'true_false':
      return (
        <div className="flex flex-col gap-3">
          {promptEditor}
          <Row label="Đáp án">
            {[true, false].map((v) => (
              <label key={String(v)} className="flex items-center gap-1">
                <input type="radio" checked={body.answer === v} onChange={() => onChange({ ...body, answer: v })} className="size-5" />
                {v ? 'Đúng' : 'Sai'}
              </label>
            ))}
          </Row>
        </div>
      )
    case 'fill_blank':
      return <FillBlankEditor body={body} onChange={onChange} />
    case 'number_input':
      return (
        <div className="flex flex-col gap-3">
          {promptEditor}
          <Row label="Đáp án">
            <input type="number" step="any" value={body.answer} onChange={(e) => onChange({ ...body, answer: num(e.target.value) })} className={`${fieldClass} w-28`} />
            <span className="text-slate-500">sai số ±</span>
            <input
              type="number"
              step="any"
              min={0}
              value={body.tolerance ?? 0}
              onChange={(e) => onChange({ ...body, tolerance: num(e.target.value) || undefined })}
              className={`${fieldClass} w-20`}
            />
            <span className="text-slate-500">đơn vị</span>
            <input value={body.unit ?? ''} onChange={(e) => onChange({ ...body, unit: e.target.value || undefined })} className={`${fieldClass} w-24`} />
          </Row>
        </div>
      )
    case 'matching':
      return <MatchingEditor body={body} onChange={onChange} />
    case 'ordering':
      return <OrderingEditor body={body} onChange={onChange} />
    case 'split_strategy': {
      const d = deriveSplit(body.op, body.a, body.b)
      return (
        <div className="flex flex-col gap-2">
          <Row label="Phép tính">
            <input type="number" value={body.a} onChange={(e) => onChange({ ...body, a: num(e.target.value) })} className={`${fieldClass} w-20`} />
            <select value={body.op} onChange={(e) => onChange({ ...body, op: e.target.value as '+' | '-' })} className={fieldClass}>
              <option value="+">+</option>
              <option value="-">−</option>
            </select>
            <input type="number" value={body.b} onChange={(e) => onChange({ ...body, b: num(e.target.value) })} className={`${fieldClass} w-20`} />
          </Row>
          <p className={`text-sm ${d ? 'text-emerald-700' : 'text-red-600'}`}>
            {d
              ? `Bé điền: ${d.cells[0]} ${body.op === '+' ? '+' : '−'} ${d.cells[1]} ${body.op === '+' ? '+' : '−'} ${d.cells[2]} = ${d.cells[3]} (tròn ${d.target})`
              : 'Phép tính phải qua chục thì mới tách–gộp được'}
          </p>
        </div>
      )
    }
    case 'clock_set':
      return (
        <div className="flex flex-col gap-3">
          {promptEditor}
          <Row label="Giờ đúng">
            <input type="number" min={1} max={12} value={body.answer.h} onChange={(e) => onChange({ ...body, answer: { ...body.answer, h: num(e.target.value) } })} className={`${fieldClass} w-16`} />
            :
            <input
              type="number"
              min={0}
              max={59}
              step={5}
              value={body.answer.m}
              disabled={body.hands === 'hour'}
              onChange={(e) => onChange({ ...body, answer: { ...body.answer, m: num(e.target.value) } })}
              className={`${fieldClass} w-16`}
            />
          </Row>
          <Row label="Bé quay">
            <select
              value={body.hands}
              onChange={(e) => {
                const hands = e.target.value as 'hour' | 'both'
                onChange({ ...body, hands, answer: hands === 'hour' ? { ...body.answer, m: 0 } : body.answer })
              }}
              className={fieldClass}
            >
              <option value="hour">Chỉ kim giờ (giờ đúng)</option>
              <option value="both">Cả kim giờ và kim phút</option>
            </select>
            {body.hands === 'both' && (
              <select
                value={body.snapMinutes ?? 5}
                onChange={(e) => onChange({ ...body, snapMinutes: Number(e.target.value) as 1 | 5 | 15 | 30 })}
                className={fieldClass}
              >
                {[1, 5, 15, 30].map((s) => (
                  <option key={s} value={s}>
                    kim phút nhảy {s} phút
                  </option>
                ))}
              </select>
            )}
          </Row>
        </div>
      )
    case 'column_arith':
      return (
        <div className="flex flex-col gap-2">
          <Row label="Phép tính">
            <input
              type="number"
              min={0}
              value={body.operands[0]}
              onChange={(e) => onChange({ ...body, operands: [num(e.target.value), body.operands[1]] })}
              className={`${fieldClass} w-24`}
            />
            <select value={body.op} onChange={(e) => onChange({ ...body, op: e.target.value as '+' | '-' })} className={fieldClass}>
              <option value="+">+</option>
              <option value="-">−</option>
            </select>
            <input
              type="number"
              min={0}
              value={body.operands[1]}
              onChange={(e) => onChange({ ...body, operands: [body.operands[0], num(e.target.value)] })}
              className={`${fieldClass} w-24`}
            />
          </Row>
        </div>
      )
    case 'info':
      return (
        <div className="flex flex-col gap-3">
          {promptEditor}
          {(body.pages ?? []).map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1">
                <RichTextEditor value={p} onChange={(page) => onChange({ ...body, pages: body.pages!.map((x, j) => (j === i ? page : x)) })} placeholder={`Trang ${i + 2}`} />
              </div>
              <button type="button" onClick={() => onChange({ ...body, pages: body.pages!.filter((_, j) => j !== i) })} className="mt-2 px-2 text-red-600">
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onChange({ ...body, pages: [...(body.pages ?? []), { text: '' }] })} className="min-h-11 self-start rounded-lg bg-slate-100 px-3 text-sm">
            + Trang
          </button>
        </div>
      )
    case 'hotspot':
      return <HotspotEditor body={body} onChange={onChange} />
    case 'maze':
      return <MazeEditor body={body} onChange={onChange} />
    case 'trace':
      return <TraceEditor body={body} onChange={onChange} />
    case 'arith_gen':
      return <ArithGenEditor body={body} onChange={onChange} />
  }
}
