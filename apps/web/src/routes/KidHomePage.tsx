import { gradeLabel } from '@for-kids/shared'
import { Link, Navigate } from 'react-router'
import { useMe } from '../api'

// Khung tạm cho trang chủ của bé (§6 bé, mục 2): bài hôm nay, ôn tập, thư viện làm ở bước sau.
export function KidHomePage() {
  const me = useMe()
  const kid = me.data?.activeChild
  if (!kid) return <Navigate to="/" replace />

  return (
    <main className="min-h-dvh bg-sky-50 text-kid">
      <header className="flex items-center gap-4 bg-white px-6 py-4 shadow-sm">
        <span className="text-5xl">{kid.avatar}</span>
        <div>
          <p className="text-2xl font-bold">{kid.name}</p>
          <p className="text-base text-slate-500">{gradeLabel(kid.grade)}</p>
        </div>
        <Link to="/" className="ml-auto flex min-h-touch items-center rounded-xl bg-slate-100 px-5 text-base">
          Đổi bé
        </Link>
      </header>
      <section className="p-6">
        <h2 className="text-2xl font-semibold">Bài hôm nay</h2>
        <p className="mt-2 text-slate-500">Chưa có bài nào.</p>
      </section>
    </main>
  )
}
