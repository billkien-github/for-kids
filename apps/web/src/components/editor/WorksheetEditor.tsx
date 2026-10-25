import {
  GRADE_MAX,
  GRADE_MIN,
  gradeLabel,
  GRID_QUESTION_TYPES,
  QUESTION_TYPES,
  WorksheetInput,
  type Catalog,
  type QuestionInput,
  type QuestionType,
  type WorksheetDetail,
} from '@for-kids/shared'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../../api'
import { QuestionView } from '../questions/QuestionView'
import { BodyEditor, newBody, TYPE_LABEL } from './BodyEditors'
import { fieldClass } from './RichTextEditor'

export type WorksheetDraft = {
  subjectCode: string
  grade: number
  title: string
  topic?: string | null
  description?: string | null
  lang?: string | null
  layout: 'one_per_screen' | 'grid'
  timeLimitSec?: number | null
  sourceNote?: string | null
  questions: QuestionInput[]
}

export const emptyDraft = (): WorksheetDraft => ({
  subjectCode: 'math',
  grade: 1,
  title: '',
  layout: 'one_per_screen',
  questions: [{ body: newBody('single_choice') }],
})

/** Bài đã có → bản nháp để sửa (bỏ các giá trị mặc định cho gọn). */
export function draftFromDetail(w: WorksheetDetail): WorksheetDraft {
  return {
    subjectCode: w.subjectCode,
    grade: w.grade,
    title: w.title,
    topic: w.topic,
    description: w.description,
    lang: w.lang,
    layout: w.layout,
    timeLimitSec: w.timeLimitSec,
    sourceNote: w.sourceNote,
    questions: w.questions.map(({ body, explanation, points, ttsLang, skillCodes }) => ({
      body,
      ...(explanation ? { explanation } : {}),
      ...(points !== 1 && body.type !== 'info' ? { points } : {}),
      ...(ttsLang ? { ttsLang } : {}),
      ...(skillCodes.length ? { skillCodes } : {}),
    })),
  }
}

type Issue = { path: string; message: string }

/** Trình soạn bài dạng form cho mọi loại câu (§6 phụ huynh, mục 2). Kiểm tra bằng đúng schema của server. */
export function WorksheetEditor({ initial, onSave, saveLabel }: { initial: WorksheetDraft; onSave: (d: WorksheetDraft) => Promise<unknown>; saveLabel: string }) {
  const catalog = useQuery({ queryKey: ['parent', 'catalog'], queryFn: () => api<Catalog>('/parent/catalog') })
  const [draft, setDraft] = useState<WorksheetDraft>(initial)
  // Key ổn định cho từng câu, để trạng thái của thẻ (đang xem trước…) đi theo câu khi đổi thứ tự.
  const nextKey = useRef(initial.questions.length)
  const [keys, setKeys] = useState(() => initial.questions.map((_, i) => i))
  const [issues, setIssues] = useState<Issue[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const set = (patch: Partial<WorksheetDraft>) => {
    setSaved(false)
    setDraft((d) => ({ ...d, ...patch }))
  }
  /** Đổi danh sách câu cùng với key của chúng (`k = null` là câu mới). */
  const setQuestions = (items: { q: QuestionInput; k: number | null }[]) => {
    set({ questions: items.map((x) => x.q) })
    setKeys(items.map((x) => x.k ?? nextKey.current++))
  }
  const current = () => draft.questions.map((q, i) => ({ q, k: keys[i] ?? null }))
  const setQuestion = (i: number, q: QuestionInput) => set({ questions: draft.questions.map((x, j) => (j === i ? q : x)) })
  const move = (i: number, to: number) => {
    if (to < 0 || to >= draft.questions.length) return
    const items = current()
    const [x] = items.splice(i, 1)
    items.splice(to, 0, x!)
    setQuestions(items)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const parsed = WorksheetInput.safeParse(draft)
    if (!parsed.success) {
      setIssues(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
      return
    }
    setIssues([])
    setSaving(true)
    try {
      await onSave(draft)
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const general = issues.filter((i) => !i.path.startsWith('questions.'))
  const issuesOf = (i: number) => issues.filter((x) => x.path.startsWith(`questions.${i}.`) || x.path === `questions.${i}`)
  const topics = catalog.data?.topics.filter((t) => t.subjectCode === draft.subjectCode) ?? []
  const skills = catalog.data?.skills.filter((s) => s.subjectCode === draft.subjectCode) ?? []

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <section className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Tên bài (con sẽ thấy)
          <input value={draft.title} onChange={(e) => set({ title: e.target.value })} required className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Môn
          <select value={draft.subjectCode} onChange={(e) => set({ subjectCode: e.target.value })} className={fieldClass}>
            {(catalog.data?.subjects ?? [{ code: 'math', name: 'Toán' }]).map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Lớp
          <select value={draft.grade} onChange={(e) => set({ grade: Number(e.target.value) })} className={fieldClass}>
            {Array.from({ length: GRADE_MAX - GRADE_MIN + 1 }, (_, i) => GRADE_MIN + i).map((g) => (
              <option key={g} value={g}>
                {gradeLabel(g)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Chủ đề (chọn có sẵn hoặc gõ mới)
          <input list="topic-options" value={draft.topic ?? ''} onChange={(e) => set({ topic: e.target.value || null })} className={fieldClass} />
          <datalist id="topic-options">
            {topics.map((t) => (
              <option key={t.name} value={t.name} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Ngôn ngữ đọc đề
          <select value={draft.lang ?? ''} onChange={(e) => set({ lang: e.target.value || null })} className={fieldClass}>
            <option value="">Theo môn học</option>
            <option value="vi-VN">Tiếng Việt (vi-VN)</option>
            <option value="en-US">Tiếng Anh (en-US)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Cách hiện câu hỏi
          <select value={draft.layout} onChange={(e) => set({ layout: e.target.value as WorksheetDraft['layout'] })} className={fieldClass}>
            <option value="one_per_screen">Mỗi lần một câu</option>
            <option value="grid">Nhiều câu một màn (hợp bài tính nhanh)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Thời gian làm bài (phút, để trống nếu không giới hạn)
          <input
            type="number"
            min={0}
            step="0.5"
            value={draft.timeLimitSec ? draft.timeLimitSec / 60 : ''}
            onChange={(e) => set({ timeLimitSec: e.target.value ? Math.round(Number(e.target.value) * 60) || null : null })}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Ghi chú cho bài (không bắt buộc)
          <input value={draft.description ?? ''} onChange={(e) => set({ description: e.target.value || null })} className={fieldClass} />
        </label>
      </section>

      {draft.questions.map((q, i) => (
        <QuestionCard
          key={keys[i] ?? `new-${i}`}
          index={i}
          count={draft.questions.length}
          question={q}
          skills={skills}
          lang={draft.lang ?? (draft.subjectCode === 'en' ? 'en-US' : 'vi-VN')}
          gridLayout={draft.layout === 'grid'}
          issues={issuesOf(i)}
          onChange={(nq) => setQuestion(i, nq)}
          onMove={(to) => move(i, to)}
          onDuplicate={() => {
            const items = current()
            items.splice(i + 1, 0, { q: structuredClone(q), k: null })
            setQuestions(items)
          }}
          onRemove={() => setQuestions(current().filter((_, j) => j !== i))}
        />
      ))}

      <AddQuestion onAdd={(type) => setQuestions([...current(), { q: { body: newBody(type) }, k: null }])} />

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur">
        <button disabled={saving} className="min-h-touch rounded-xl bg-slate-800 px-6 font-semibold text-white disabled:opacity-50">
          {saving ? 'Đang lưu…' : saveLabel}
        </button>
        {saved && <span className="text-emerald-700">✓ Đã lưu.</span>}
        {issues.length > 0 && <span className="text-red-600">Còn {issues.length} chỗ cần sửa, xem các câu có viền đỏ nhé.</span>}
        {error && <span className="whitespace-pre-line text-red-600">{error}</span>}
        {general.map((g) => (
          <span key={g.path + g.message} className="text-sm text-red-600">
            {g.path}: {g.message}
          </span>
        ))}
      </div>
    </form>
  )
}

function AddQuestion({ onAdd }: { onAdd: (t: QuestionType) => void }) {
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-3">
      <span className="w-full text-sm text-slate-500">➕ Thêm câu hỏi:</span>
      {QUESTION_TYPES.map((t) => (
        <button key={t} type="button" onClick={() => onAdd(t)} className="min-h-11 rounded-lg bg-white px-3 text-sm shadow-sm">
          {TYPE_LABEL[t]}
        </button>
      ))}
    </div>
  )
}

function QuestionCard(props: {
  index: number
  count: number
  question: QuestionInput
  skills: Catalog['skills']
  lang: string
  gridLayout: boolean
  issues: Issue[]
  onChange: (q: QuestionInput) => void
  onMove: (to: number) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const { index, question: q, onChange } = props
  const [preview, setPreview] = useState(false)
  const [previewResponse, setPreviewResponse] = useState<unknown>(undefined)
  const selected = new Set(q.skillCodes ?? [])
  const gridProblem = props.gridLayout && !GRID_QUESTION_TYPES.includes(q.body.type)

  return (
    <section className={`flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ${props.issues.length ? 'ring-2 ring-red-400' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Câu {index + 1}</span>
        <select
          value={q.body.type}
          onChange={(e) => {
            const t = e.target.value as QuestionType
            if (t !== q.body.type && confirm('Đổi loại câu sẽ xoá nội dung câu này. Tiếp tục?')) onChange({ ...q, body: newBody(t) })
          }}
          className={fieldClass}
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={() => setPreview(!preview)} className="min-h-11 rounded-lg bg-sky-50 px-3 text-sm">
            {preview ? '✏️ Soạn tiếp' : '👀 Xem như con'}
          </button>
          <button type="button" onClick={() => props.onMove(index - 1)} disabled={index === 0} className="min-h-11 w-10 rounded-lg bg-slate-100 disabled:opacity-30" aria-label="Lên">
            ↑
          </button>
          <button type="button" onClick={() => props.onMove(index + 1)} disabled={index === props.count - 1} className="min-h-11 w-10 rounded-lg bg-slate-100 disabled:opacity-30" aria-label="Xuống">
            ↓
          </button>
          <button type="button" onClick={props.onDuplicate} className="min-h-11 w-10 rounded-lg bg-slate-100" aria-label="Nhân đôi" title="Nhân đôi">
            ⧉
          </button>
          <button type="button" onClick={() => confirm(`Xoá câu ${index + 1}?`) && props.onRemove()} disabled={props.count <= 1} className="min-h-11 w-10 rounded-lg text-red-600 disabled:opacity-30" aria-label="Xoá">
            ✕
          </button>
        </div>
      </div>
      {gridProblem && <p className="text-sm text-amber-700">Loại câu này không dùng được trong bố cục lưới.</p>}

      {preview ? (
        <div className="rounded-xl bg-sky-50 p-4 text-kid">
          <QuestionView body={q.body} response={previewResponse} onChange={setPreviewResponse} lang={q.ttsLang ?? props.lang} />
        </div>
      ) : (
        <BodyEditor body={q.body} onChange={(body) => onChange({ ...q, body })} />
      )}

      <label className="flex flex-col gap-1 text-sm">
        Lời giải ngắn cho con (hiện sau khi nộp bài)
        <input value={q.explanation ?? ''} onChange={(e) => onChange({ ...q, explanation: e.target.value || undefined })} className={fieldClass} />
      </label>

      {q.body.type !== 'info' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            Điểm
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={q.points ?? 1}
              onChange={(e) => onChange({ ...q, points: Number(e.target.value) === 1 ? undefined : Number(e.target.value) })}
              className={`${fieldClass} w-20`}
            />
          </label>
          <details className="flex-1">
            <summary className="cursor-pointer text-slate-500">Kỹ năng ({selected.size})</summary>
            <div className="mt-2 flex flex-wrap gap-1">
              {props.skills.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => {
                    const next = new Set(selected)
                    if (next.has(s.code)) next.delete(s.code)
                    else next.add(s.code)
                    onChange({ ...q, skillCodes: next.size ? [...next] : undefined })
                  }}
                  className={`rounded-full px-3 py-1 ${selected.has(s.code) ? 'bg-sky-600 text-white' : 'bg-slate-100'}`}
                  title={s.code}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </details>
        </div>
      )}

      {props.issues.length > 0 && (
        <ul className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {props.issues.map((i) => (
            <li key={i.path + i.message}>
              {i.path.replace(`questions.${index}.`, '')}: {i.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
