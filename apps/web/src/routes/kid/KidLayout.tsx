import { gradeLabel, type AttemptView, type KidHome } from '@for-kids/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useNavigate } from 'react-router'
import { api, errorMessage, post, useMe } from '../../api'

export const kidHomeKey = ['kid', 'home'] as const
export const useKidHome = (enabled = true) => useQuery({ queryKey: kidHomeKey, queryFn: () => api<KidHome>('/kid/home'), enabled })

/**
 * Khung chung cho các trang của con (trừ màn làm bài): đầu trang có tên, 🔥, ⭐;
 * thanh tab to ở đáy: Học · Ôn bài · Quà.
 */
export function KidLayout() {
  const me = useMe()
  const navigate = useNavigate()
  const kid = me.data?.activeChild
  const home = useKidHome(!!kid)
  const [notice, setNotice] = useState<string | null>(null)

  if (me.data && !kid) return <Navigate to="/" replace />
  if (!kid) return null
  const reviewDue = home.data?.reviewDue ?? 0

  const startReview = async () => {
    setNotice(null)
    if (reviewDue === 0) return setNotice('Hôm nay con không có câu nào cần ôn. Giỏi lắm! 🎉')
    try {
      const attempt = await post<AttemptView>('/kid/review')
      navigate(`/kid/attempt/${attempt.id}`)
    } catch (err) {
      setNotice(errorMessage(err))
    }
  }

  const tab = (active: boolean) => `flex min-h-18 flex-col items-center justify-center gap-0.5 text-base ${active ? 'font-bold text-sky-700' : 'text-slate-500'}`

  return (
    <div className="min-h-dvh bg-sky-50 pb-28 text-kid">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
        <span className="text-5xl">{kid.avatar}</span>
        <div className="min-w-0">
          <p className="truncate text-2xl font-bold">{kid.name}</p>
          <p className="text-base text-slate-500">{gradeLabel(kid.grade)}</p>
        </div>
        <span className="ml-auto rounded-full bg-orange-100 px-3 py-1.5 text-xl font-bold" title="Số ngày học liền mạch">
          🔥 {home.data?.streak ?? 0}
        </span>
        <Link to="/kid/achievements" className="rounded-full bg-amber-100 px-3 py-1.5 text-xl font-bold" title="Sao của con">
          ⭐ {home.data?.stars ?? 0}
        </Link>
        <Link to="/" className="flex min-h-touch items-center rounded-xl bg-slate-100 px-4 text-base" title="Chuyển sang bé khác">
          👋 Chuyển sang bé khác
        </Link>
      </header>

      {notice && (
        <p className="mx-4 mt-4 rounded-2xl bg-white p-4 text-center shadow-sm sm:mx-6" role="status" onClick={() => setNotice(null)}>
          {notice}
        </p>
      )}
      <Outlet />

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <NavLink to="/kid" end className={({ isActive }) => tab(isActive)}>
          <span className="text-3xl">📚</span> Học
        </NavLink>
        <button type="button" onClick={startReview} className={`relative ${tab(false)}`}>
          <span className="text-3xl">🔁</span> Ôn bài
          {reviewDue > 0 && (
            <span className="absolute top-1.5 left-1/2 ml-4 min-w-6 rounded-full bg-red-500 px-1.5 text-sm leading-6 font-bold text-white">{reviewDue}</span>
          )}
        </button>
        <NavLink to="/kid/achievements" className={({ isActive }) => tab(isActive)}>
          <span className="text-3xl">🏆</span> Quà
        </NavLink>
      </nav>
    </div>
  )
}
