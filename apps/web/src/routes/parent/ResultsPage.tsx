import type { AttemptSummary, AttemptView, Profile } from '@for-kids/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, errorMessage } from '../../api'
import { ResultView, Stars } from '../kid/ResultView'

const SUBJECT_NAME: Record<string, string> = { math: 'Toán', vi: 'Tiếng Việt', en: 'Tiếng Anh' }
const fmt = (iso: string) => new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const duration = (sec: number | null) => (sec === null ? '' : sec < 60 ? `${sec} giây` : `${Math.round(sec / 60)} phút`)

/** Báo cáo cơ bản (P1): điểm trung bình lần chính thức theo môn, lịch sử làm bài. */
export function ResultsPage() {
  const kids = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api<Profile[]>('/parent/children') })
  const [childId, setChildId] = useState<string | null>(null)
  const current = childId ?? kids.data?.[0]?.id ?? null
  const attempts = useQuery({
    queryKey: ['parent', 'attempts', current],
    queryFn: () => api<AttemptSummary[]>(`/parent/children/${current}/attempts`),
    enabled: !!current,
  })

  // Lần chính thức = attempt_no 1 (§5.2).
  const official = (attempts.data ?? []).filter((a) => a.attemptNo === 1 && a.kind === 'normal' && a.scorePct !== null)
  const bySubject = new Map<string, number[]>()
  for (const a of official) bySubject.set(a.subjectCode ?? '?', [...(bySubject.get(a.subjectCode ?? '?') ?? []), a.scorePct!])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">Kết quả học tập</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {kids.data?.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setChildId(k.id)}
            className={`min-h-touch rounded-xl px-4 ${current === k.id ? 'bg-slate-800 text-white' : 'bg-white shadow-sm'}`}
          >
            {k.avatar} {k.name}
          </button>
        ))}
      </div>

      {attempts.error && <p className="mt-6 text-red-600">{errorMessage(attempts.error)}</p>}
      {bySubject.size > 0 && (
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[...bySubject].map(([code, scores]) => (
            <div key={code} className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-slate-500">{SUBJECT_NAME[code] ?? code}</p>
              <p className="text-3xl font-bold">{Math.round(scores.reduce((s, x) => s + x, 0) / scores.length)}%</p>
              <p className="text-sm text-slate-400">trung bình {scores.length} bài (lần đầu)</p>
            </div>
          ))}
        </section>
      )}

      <h2 className="mt-8 text-lg font-semibold">Các lần làm gần đây</h2>
      {attempts.data?.length === 0 && <p className="mt-2 text-slate-500">Chưa làm bài nào.</p>}
      <ul className="mt-2 flex flex-col gap-2">
        {attempts.data?.map((a) => (
          <li key={a.id}>
            <Link to={`/parent/attempts/${a.id}`} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm hover:bg-slate-50">
              <div className="flex-1">
                <p className="font-semibold">
                  {a.worksheetTitle ?? 'Phiên ôn tập'} <span className="text-sm font-normal text-slate-400">· lần {a.attemptNo}</span>
                  {a.attemptNo === 1 && <span className="ml-2 rounded bg-sky-100 px-1.5 text-xs text-sky-800">chính thức</span>}
                </p>
                <p className="text-sm text-slate-500">
                  {fmt(a.startedAt)}
                  {a.submittedAt ? ` · làm trong ${duration(a.durationSec)}` : ' · đang làm dở'}
                  {a.autoSubmitted ? ' · hết giờ tự nộp' : ''}
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
    </main>
  )
}

export function ParentAttemptPage() {
  const { id } = useParams() as { id: string }
  const view = useQuery({ queryKey: ['parent', 'attempt', id], queryFn: () => api<AttemptView>(`/parent/attempts/${id}`) })
  if (view.isPending) return <p className="p-6 text-slate-500">Đang tải…</p>
  if (view.error) return <p className="p-6 text-red-600">{errorMessage(view.error)}</p>
  if (!view.data.result) return <p className="p-6 text-slate-500">Bé chưa nộp bài này.</p>
  return (
    <div>
      <Link to="/parent/results" className="ml-6 mt-4 inline-flex min-h-touch items-center text-slate-500">
        ← Kết quả học tập
      </Link>
      <ResultView view={view.data} readOnly />
    </div>
  )
}
