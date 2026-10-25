import type { AttemptSummary, AttemptView } from '@for-kids/shared'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { api, errorMessage } from '../../api'
import { ResultView, Stars } from '../kid/ResultView'

const fmt = (iso: string) => new Date(iso).toLocaleString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const duration = (sec: number | null) => (sec === null ? '' : sec < 60 ? `${sec} giây` : `${Math.round(sec / 60)} phút`)

/** Lịch sử làm bài của một con (một tab trong Tổng quan). Bấm vào để xem lại từng câu. */
export function AttemptHistory({ childId }: { childId: string }) {
  const attempts = useQuery({
    queryKey: ['parent', 'attempts', childId],
    queryFn: () => api<AttemptSummary[]>(`/parent/children/${childId}/attempts`),
  })
  if (attempts.isPending) return <p className="mt-6 text-slate-500">Đang tải…</p>
  if (attempts.error) return <p className="mt-6 text-red-600">{errorMessage(attempts.error)}</p>
  if (attempts.data.length === 0) return <p className="mt-6 text-slate-500">Con chưa làm bài nào.</p>

  return (
    <ul className="mt-4 flex flex-col gap-2">
      {attempts.data.map((a) => (
        <li key={a.id}>
          <Link to={`/parent/attempts/${a.id}`} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm hover:bg-slate-50">
            <div className="flex-1">
              <p className="font-semibold">
                {a.worksheetTitle ?? '🔁 Ôn bài'}
                {a.kind === 'normal' && (
                  <span className="ml-2 text-sm font-normal text-slate-400">{a.attemptNo === 1 ? 'lần đầu' : `làm lại lần ${a.attemptNo - 1}`}</span>
                )}
              </p>
              <p className="text-sm text-slate-500">
                {fmt(a.startedAt)}
                {a.submittedAt ? ` · làm trong ${duration(a.durationSec)}` : ' · đang làm dở'}
                {a.autoSubmitted ? ' · hết giờ nên tự nộp' : ''}
              </p>
            </div>
            {a.scorePct !== null && (
              <div className="text-right">
                <p className="text-xl font-bold">{Math.round(a.scorePct)}%</p>
                <Stars count={a.stars ?? 0} size="text-base" />
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Xem lại một lần làm bài của con: từng câu, con trả lời gì, đáp án đúng. */
export function ParentAttemptPage() {
  const { id } = useParams() as { id: string }
  const view = useQuery({ queryKey: ['parent', 'attempt', id], queryFn: () => api<AttemptView>(`/parent/attempts/${id}`) })
  return (
    <div>
      <Link to="/parent/overview?tab=history" className="mt-4 ml-6 inline-flex min-h-touch items-center text-slate-500">
        ← Lịch sử làm bài
      </Link>
      {view.isPending && <p className="p-6 text-slate-500">Đang tải…</p>}
      {view.error && <p className="p-6 text-red-600">{errorMessage(view.error)}</p>}
      {view.data && !view.data.result && <p className="p-6 text-slate-500">Con đang làm dở bài này.</p>}
      {view.data?.result && <ResultView view={view.data} readOnly />}
    </div>
  )
}
