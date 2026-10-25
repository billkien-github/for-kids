import { gradeLabel, type Profile, type WorksheetDetail } from '@for-kids/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api, errorMessage, post } from '../../api'
import { Modal } from '../../components/Modal'
import { draftFromDetail, WorksheetEditor } from '../../components/editor/WorksheetEditor'
import { QuestionView } from '../../components/questions/QuestionView'

type Tab = 'answers' | 'try' | 'edit' | 'json'

/** Chi tiết bài: xem đáp án, thử làm như bé, sửa JSON, xuất bản, giao bài. */
export function WorksheetDetailPage() {
  const { id } = useParams() as { id: string }
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const key = ['parent', 'worksheet', id]
  const ws = useQuery({ queryKey: key, queryFn: () => api<WorksheetDetail>(`/parent/worksheets/${id}`) })
  const [tab, setTab] = useState<Tab>('answers')
  const [assigning, setAssigning] = useState(false)

  const action = useMutation({
    mutationFn: (path: 'publish' | 'unpublish' | 'archive') => post(`/parent/worksheets/${id}/${path}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key })
      void queryClient.invalidateQueries({ queryKey: ['parent', 'worksheets'] })
    },
  })

  if (ws.isPending) return <p className="p-6 text-slate-500">Đang tải…</p>
  if (ws.error) return <p className="p-6 text-red-600">{errorMessage(ws.error)}</p>
  const w = ws.data

  return (
    <main className="mx-auto max-w-4xl p-6">
      <button type="button" onClick={() => navigate('/parent/worksheets')} className="min-h-touch text-slate-500">
        ← Danh sách bài
      </button>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{w.title}</h1>
          <p className="text-slate-500">
            {w.subjectName} · {gradeLabel(w.grade)}
            {w.topic ? ` · ${w.topic}` : ''} · {w.questionCount} câu · đọc bằng {w.ttsLang}
            {w.timeLimitSec ? ` · ⏱ ${Math.round(w.timeLimitSec / 60)} phút` : ''}
          </p>
          {w.description && <p className="mt-1">{w.description}</p>}
          {w.sourceNote && <p className="mt-1 text-sm text-slate-400">Nguồn: {w.sourceNote}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {w.status === 'published' ? (
            <>
              <button type="button" onClick={() => setAssigning(true)} className="min-h-touch rounded-xl bg-emerald-600 px-4 text-white">
                Giao bài
              </button>
              <button type="button" onClick={() => action.mutate('unpublish')} className="min-h-touch rounded-xl bg-white px-4 shadow-sm">
                Về nháp
              </button>
            </>
          ) : (
            <button type="button" onClick={() => action.mutate('publish')} className="min-h-touch rounded-xl bg-emerald-600 px-4 text-white">
              Xuất bản
            </button>
          )}
          {w.status !== 'archived' && (
            <button type="button" onClick={() => confirm('Lưu trữ bài này?') && action.mutate('archive')} className="min-h-touch rounded-xl px-4 text-red-600">
              Lưu trữ
            </button>
          )}
        </div>
      </div>
      {action.error && <p className="mt-2 text-red-600">{errorMessage(action.error)}</p>}

      <div className="mt-6 flex gap-2">
        {(
          [
            ['answers', 'Đáp án'],
            ['try', 'Thử làm như bé'],
            ['edit', 'Sửa'],
            ['json', 'JSON'],
          ] as const
        ).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`min-h-touch rounded-xl px-4 ${tab === t ? 'bg-slate-800 text-white' : 'bg-white shadow-sm'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'edit' ? (
        <div className="mt-4">
          <WorksheetEditor
            key={w.updatedAt}
            initial={draftFromDetail(w)}
            saveLabel="Lưu thay đổi"
            onSave={async (draft) => {
              // Không đổi câu nào thì không gửi questions, để server không đụng tới câu hỏi
              // (hàng đợi ôn và lịch sử của bé gắn với từng câu).
              const changed = JSON.stringify(draft.questions) !== JSON.stringify(draftFromDetail(w).questions)
              await api(`/parent/worksheets/${w.id}`, { method: 'PUT', body: changed ? draft : { ...draft, questions: undefined } })
              await queryClient.invalidateQueries({ queryKey: key })
            }}
          />
        </div>
      ) : tab === 'json' ? (
        <JsonEditor worksheet={w} onSaved={() => queryClient.invalidateQueries({ queryKey: key })} />
      ) : (
        <ol className="mt-4 flex flex-col gap-4 text-kid">
          {w.questions.map((q, i) => (
            <QuestionCard key={`${tab}-${q.id}`} index={i} question={q} lang={q.ttsLang ?? w.ttsLang} mode={tab} />
          ))}
        </ol>
      )}

      {assigning && (
        <Modal onClose={() => setAssigning(false)}>
          <AssignForm worksheetId={w.id} onDone={() => setAssigning(false)} />
        </Modal>
      )}
    </main>
  )
}

function QuestionCard({ index, question, lang, mode }: { index: number; question: WorksheetDetail['questions'][number]; lang: string; mode: 'answers' | 'try' }) {
  const [response, setResponse] = useState<unknown>(undefined)
  const [checked, setChecked] = useState(false)
  const showSolution = mode === 'answers' || checked
  return (
    <li className="rounded-3xl bg-white p-5 shadow-sm">
      <p className="mb-3 flex justify-between text-base text-slate-400">
        <span>
          Câu {index + 1} · {question.body.type}
        </span>
        <span>{question.skillCodes.join(', ')}</span>
      </p>
      <QuestionView body={question.body} solution={showSolution ? question.body : undefined} response={response} onChange={setResponse} lang={lang} />
      {mode === 'try' && question.body.type !== 'info' && (
        <button type="button" onClick={() => setChecked(!checked)} className="mt-3 min-h-touch rounded-xl bg-slate-100 px-4 text-base">
          {checked ? 'Làm lại' : 'Kiểm tra'}
        </button>
      )}
      {showSolution && question.explanation && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-lg">💡 {question.explanation}</p>}
    </li>
  )
}

function JsonEditor({ worksheet, onSaved }: { worksheet: WorksheetDetail; onSaved: () => void }) {
  const initial = draftFromDetail(worksheet)
  const [text, setText] = useState(() => JSON.stringify(initial, null, 2))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    let patch: unknown
    try {
      patch = JSON.parse(text)
    } catch (err) {
      setError(`JSON lỗi: ${(err as Error).message}`)
      return
    }
    try {
      await api(`/parent/worksheets/${worksheet.id}`, { method: 'PUT', body: patch })
      setSaved(true)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form onSubmit={save} className="mt-4 flex flex-col gap-3">
      <p className="text-sm text-slate-500">Sửa rồi bấm Lưu. Định dạng câu hỏi xem docs/spec.md §4. Lịch sử làm bài cũ không bị ảnh hưởng.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="h-[60vh] rounded-xl border border-slate-300 p-3 font-mono text-sm"
      />
      {error && <p className="whitespace-pre-line text-red-600">{error}</p>}
      {saved && <p className="text-emerald-700">Đã lưu.</p>}
      <button className="min-h-touch self-end rounded-xl bg-slate-800 px-6 text-white">Lưu</button>
    </form>
  )
}

function AssignForm({ worksheetId, onDone }: { worksheetId: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const kids = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api<Profile[]>('/parent/children') })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [due, setDue] = useState('')
  const assign = useMutation({
    mutationFn: () =>
      post('/parent/assignments', {
        worksheetId,
        childIds: [...selected],
        dueAt: due ? new Date(due).toISOString() : null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['parent', 'assignments'] })
      onDone()
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        assign.mutate()
      }}
      className="flex w-[min(26rem,80vw)] flex-col gap-4"
    >
      <h2 className="text-xl font-bold">Giao bài</h2>
      <div className="flex flex-col gap-2">
        {kids.data?.map((k) => (
          <label key={k.id} className="flex min-h-touch items-center gap-3 rounded-xl bg-slate-50 px-3">
            <input
              type="checkbox"
              className="size-5"
              checked={selected.has(k.id)}
              onChange={(e) => {
                const next = new Set(selected)
                if (e.target.checked) next.add(k.id)
                else next.delete(k.id)
                setSelected(next)
              }}
            />
            <span className="text-2xl">{k.avatar}</span> {k.name} <span className="text-sm text-slate-500">{gradeLabel(k.grade)}</span>
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        Hạn nộp (không bắt buộc)
        <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="min-h-touch rounded-xl border border-slate-300 px-3" />
      </label>
      {assign.error && <p className="text-red-600">{errorMessage(assign.error)}</p>}
      <button disabled={selected.size === 0 || assign.isPending} className="min-h-touch rounded-xl bg-emerald-600 font-semibold text-white disabled:opacity-50">
        Giao cho {selected.size} bé
      </button>
    </form>
  )
}
