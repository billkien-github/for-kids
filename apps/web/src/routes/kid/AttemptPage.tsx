import { isAnswered, type AttemptItem, type AttemptView } from '@for-kids/shared'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { errorMessage } from '../../api'
import { Modal } from '../../components/Modal'
import { QuestionView } from '../../components/questions/QuestionView'
import { Countdown } from './Countdown'
import { ResultView } from './ResultView'
import { useAttempt } from './useAttempt'

/** Màn làm bài (§6 bé, mục 3). */
export function AttemptPage() {
  const { id } = useParams() as { id: string }
  const { query, responses, setResponse, submit } = useAttempt(id)
  const [index, setIndex] = useState(0)
  const [reviewing, setReviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeUp, setTimeUp] = useState(false)

  if (query.isPending) return <p className="p-8 text-center text-kid text-slate-500">Đang mở bài, chờ chút nhé…</p>
  if (query.error) return <p className="p-8 text-center text-red-600">{errorMessage(query.error)}</p>
  const view = query.data
  if (view.submittedAt) return <ResultView view={view} timeUp={timeUp || view.autoSubmitted} />

  const items = view.items
  // Ảnh chụp câu hỏi gửi cho bé không có đáp án, nhưng đủ để biết câu đã trả lời chưa.
  const answered = (item: AttemptItem) => isAnswered(item.body as never, responses[item.id])
  const answeredCount = items.filter((i) => i.body.type !== 'info' && answered(i)).length
  const questionCount = items.filter((i) => i.body.type !== 'info').length

  const doSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await submit()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const grid = view.worksheet?.layout === 'grid'
  const item = items[Math.min(index, items.length - 1)]!
  const isLast = index >= items.length - 1

  return (
    <main className="flex min-h-dvh flex-col bg-sky-50 text-kid">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <Link to="/kid" className="flex min-h-touch shrink-0 items-center rounded-xl bg-slate-100 px-3 text-base text-slate-600" title="Bài đã được lưu, lúc khác con làm tiếp nhé">
          ← Để sau
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{view.worksheet?.title ?? '🔁 Ôn bài'}</p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(answeredCount / Math.max(1, questionCount)) * 100}%` }} />
          </div>
        </div>
        {view.deadlineAt && (
          <Countdown
            deadlineAt={view.deadlineAt}
            serverNow={view.serverNow}
            totalSec={(new Date(view.deadlineAt).getTime() - new Date(view.startedAt).getTime()) / 1000}
            onExpire={() => {
              setTimeUp(true)
              void doSubmit()
            }}
          />
        )}
      </header>

      {grid ? (
        <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-4 p-4 landscape:grid-cols-2">
          {items.map((it, i) => (
            <section key={it.id} className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="mb-3 text-base font-semibold text-slate-400">Câu {i + 1}</p>
              <QuestionView body={it.body} response={responses[it.id]} onChange={(r) => setResponse(it.id, r)} lang={it.ttsLang} />
            </section>
          ))}
          <div className="col-span-full flex justify-center py-4">
            <button type="button" onClick={() => setReviewing(true)} className="min-h-touch rounded-2xl bg-emerald-600 px-10 py-3 text-2xl font-bold text-white">
              Xong rồi, nộp bài!
            </button>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col p-4">
          <p className="mb-2 text-base text-slate-500">
            Câu {index + 1} trên {items.length}
          </p>
          <section key={item.id} className="flex-1 rounded-3xl bg-white p-6 shadow-sm">
            <QuestionView body={item.body} response={responses[item.id]} onChange={(r) => setResponse(item.id, r)} lang={item.ttsLang} />
          </section>
          <nav className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
              className="min-h-touch flex-1 rounded-2xl bg-white py-3 font-semibold shadow-sm disabled:opacity-30"
            >
              ← Quay lại
            </button>
            {isLast ? (
              <button type="button" onClick={() => setReviewing(true)} className="min-h-touch flex-1 rounded-2xl bg-emerald-600 py-3 font-bold text-white">
                Xong rồi! Kiểm tra lại
              </button>
            ) : (
              <button type="button" onClick={() => setIndex(index + 1)} className="min-h-touch flex-1 rounded-2xl bg-sky-600 py-3 font-bold text-white">
                Tiếp theo →
              </button>
            )}
          </nav>
        </div>
      )}

      {reviewing && (
        <Modal onClose={() => setReviewing(false)}>
          <ReviewBeforeSubmit
            view={view}
            answered={answered}
            submitting={submitting}
            error={error}
            onGoTo={(i) => {
              setReviewing(false)
              if (grid) document.querySelectorAll('section')[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              else setIndex(i)
            }}
            onSubmit={doSubmit}
          />
        </Modal>
      )}
      {submitting && !reviewing && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-white/70 text-2xl font-bold">{timeUp ? '⏰ Hết giờ rồi! Đang nộp bài cho con…' : 'Đang nộp bài…'}</div>
      )}
    </main>
  )
}

function ReviewBeforeSubmit(props: {
  view: AttemptView
  answered: (item: AttemptItem) => boolean
  submitting: boolean
  error: string | null
  onGoTo: (index: number) => void
  onSubmit: () => void
}) {
  const missing = props.view.items.filter((i) => i.body.type !== 'info' && !props.answered(i)).length
  return (
    <div className="flex w-[min(32rem,85vw)] flex-col gap-5 text-kid">
      <h2 className="text-2xl font-bold">Con kiểm tra lại nhé</h2>
      <div className="grid grid-cols-5 gap-2">
        {props.view.items.map((it, i) => {
          const ok = it.body.type === 'info' || props.answered(it)
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => props.onGoTo(i)}
              className={`min-h-touch rounded-xl font-bold ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800 ring-2 ring-amber-400'}`}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
      <p className={missing ? 'text-amber-700' : 'text-emerald-700'}>
        {missing ? `Còn ${missing} câu con chưa làm. Chạm vào ô màu vàng để làm tiếp nhé.` : 'Con đã làm hết rồi! 🎉'}
      </p>
      {props.error && <p className="text-red-600">{props.error}</p>}
      <button
        type="button"
        disabled={props.submitting}
        onClick={props.onSubmit}
        className="min-h-touch rounded-2xl bg-emerald-600 py-3 text-2xl font-bold text-white disabled:opacity-50"
      >
        {props.submitting ? 'Đang nộp…' : missing ? 'Nộp luôn' : 'Nộp bài!'}
      </button>
    </div>
  )
}
