import { gradeLabel, type AttemptView, type KidHome, type LibraryItem } from '@for-kids/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { api, errorMessage, post, useMe } from '../api'
import { Stars } from './kid/ResultView'

const SUBJECT_ICON: Record<string, string> = { math: '🔢', vi: '📖', en: '🔤' }

const dueLabel = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Trang chủ của bé (§6 bé, mục 2): bài hôm nay, thư viện. */
export function KidHomePage() {
  const me = useMe()
  const navigate = useNavigate()
  const home = useQuery({ queryKey: ['kid', 'home'], queryFn: () => api<KidHome>('/kid/home'), enabled: !!me.data?.activeChild })
  const [allGrades, setAllGrades] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (me.data && !me.data.activeChild) return <Navigate to="/" replace />
  if (home.isPending) return <p className="p-8 text-center text-kid text-slate-500">Đang tải…</p>
  if (home.error) return <p className="p-8 text-center text-red-600">{errorMessage(home.error)}</p>
  const { child, stars, today, library } = home.data

  const open = async (worksheetId: string, assignmentId?: string) => {
    setError(null)
    try {
      const attempt = await post<AttemptView>('/kid/attempts', { worksheetId, assignmentId })
      navigate(`/kid/attempt/${attempt.id}`)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const shown = allGrades ? library : library.filter((w) => w.grade === child.grade)
  const bySubject = new Map<string, LibraryItem[]>()
  for (const w of shown) bySubject.set(w.subjectName, [...(bySubject.get(w.subjectName) ?? []), w])

  return (
    <main className="min-h-dvh bg-sky-50 pb-10 text-kid">
      <header className="flex items-center gap-4 bg-white px-6 py-4 shadow-sm">
        <span className="text-5xl">{child.avatar}</span>
        <div>
          <p className="text-2xl font-bold">{child.name}</p>
          <p className="text-base text-slate-500">{gradeLabel(child.grade)}</p>
        </div>
        <span className="ml-auto rounded-full bg-amber-100 px-4 py-2 text-xl font-bold">⭐ {stars}</span>
        <Link to="/" className="flex min-h-touch items-center rounded-xl bg-slate-100 px-5 text-base">
          Đổi bé
        </Link>
      </header>
      {error && <p className="mx-6 mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}

      <section className="p-6">
        <h2 className="text-2xl font-bold">📌 Bài hôm nay</h2>
        {today.length === 0 ? (
          <p className="mt-2 text-slate-500">Con làm hết bài được giao rồi! 🎉</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {today.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => open(a.worksheet.id, a.id)}
                  className={`flex w-full flex-col gap-1 rounded-3xl bg-white p-5 text-left shadow-sm active:scale-[0.98] ${a.overdue ? 'ring-2 ring-red-400' : ''}`}
                >
                  <span className="text-xl font-semibold">
                    {SUBJECT_ICON[a.worksheet.subjectCode] ?? '📝'} {a.worksheet.title}
                  </span>
                  <span className="text-base text-slate-500">
                    {a.worksheet.questionCount} câu
                    {a.worksheet.timeLimitSec ? ` · ⏱ ${Math.round(a.worksheet.timeLimitSec / 60)} phút` : ''}
                  </span>
                  {a.dueAt && (
                    <span className={`text-base ${a.overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                      {a.overdue ? 'Quá hạn: ' : 'Hạn: '}
                      {dueLabel(a.dueAt)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="px-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">📚 Thư viện</h2>
          <label className="flex min-h-touch items-center gap-2 text-base text-slate-600">
            <input type="checkbox" checked={allGrades} onChange={(e) => setAllGrades(e.target.checked)} className="size-5" />
            Xem cả các lớp khác
          </label>
        </div>
        {bySubject.size === 0 && <p className="mt-2 text-slate-500">Chưa có bài nào.</p>}
        {[...bySubject].map(([subject, items]) => (
          <div key={subject} className="mt-4">
            <h3 className="mb-2 text-lg font-semibold text-slate-600">{subject}</h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {items.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => open(w.id)}
                    className="flex h-full w-full flex-col gap-1 rounded-2xl bg-white p-4 text-left shadow-sm active:scale-[0.98]"
                  >
                    <span className="font-semibold">{w.title}</span>
                    {w.topic && <span className="text-sm text-slate-500">{w.topic}</span>}
                    <span className="mt-auto pt-2">{w.bestStars !== null ? <Stars count={w.bestStars} size="text-xl" /> : <span className="text-sm text-slate-400">Chưa làm</span>}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  )
}
