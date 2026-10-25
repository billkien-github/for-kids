import type { WorksheetDetail } from '@for-kids/shared'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage, post } from '../../api'
import { emptyDraft, WorksheetEditor } from '../../components/editor/WorksheetEditor'

/** Tạo bài mới: soạn bằng form, hoặc dán JSON (vd. do agent soạn sẵn). Bài mới ở trạng thái nháp. */
export function NewWorksheetPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'form' | 'json'>('form')

  const create = async (input: unknown) => {
    const w = await post<WorksheetDetail>('/parent/worksheets', input)
    navigate(`/parent/worksheets/${w.id}`)
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">✨ Soạn bài mới</h1>
        <div className="ml-auto flex gap-2">
          {(
            [
              ['form', '✏️ Soạn từng câu'],
              ['json', '{ } Dán JSON'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`min-h-touch rounded-xl px-4 ${mode === m ? 'bg-slate-800 text-white' : 'bg-white shadow-sm'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">{mode === 'form' ? <WorksheetEditor initial={emptyDraft()} onSave={create} saveLabel="💾 Lưu bài (chưa mở cho con)" /> : <JsonCreate onCreate={create} />}</div>
    </main>
  )
}

function JsonCreate({ onCreate }: { onCreate: (input: unknown) => Promise<void> }) {
  const [text, setText] = useState(() => JSON.stringify(emptyDraft(), null, 2))
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    let input: unknown
    try {
      input = JSON.parse(text)
    } catch (err) {
      setError(`JSON lỗi: ${(err as Error).message}`)
      return
    }
    try {
      await onCreate(input)
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">Định dạng xem docs/spec.md §4; agent có thể gọi tool get_question_schema để lấy JSON Schema và ví dụ.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} className="h-[60vh] rounded-xl border border-slate-300 p-3 font-mono text-sm" />
      {error && <p className="whitespace-pre-line text-red-600">{error}</p>}
      <button className="min-h-touch self-end rounded-xl bg-slate-800 px-6 text-white">💾 Lưu bài (chưa mở cho con)</button>
    </form>
  )
}
