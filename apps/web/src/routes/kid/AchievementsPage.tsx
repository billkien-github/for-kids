import type { Achievements } from '@for-kids/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api, errorMessage, post } from '../../api'

const STATUS = { pending: '⏳ Chờ bố mẹ duyệt', approved: '✅ Đã đổi', rejected: '✖ Chưa được' } as const

/** Thành tích (§6 bé, mục 5): huy hiệu, lịch sử sao, đổi quà. */
export function AchievementsPage() {
  const queryClient = useQueryClient()
  const data = useQuery({ queryKey: ['kid', 'achievements'], queryFn: () => api<Achievements>('/kid/achievements') })
  const redeem = useMutation({
    mutationFn: (rewardId: string) => post(`/kid/rewards/${rewardId}/redeem`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kid', 'achievements'] }),
  })

  if (data.isPending) return <p className="p-8 text-center text-kid text-slate-500">Đang tải…</p>
  if (data.error) return <p className="p-8 text-center text-red-600">{errorMessage(data.error)}</p>
  const a = data.data

  return (
    <main className="min-h-dvh bg-amber-50 pb-10 text-kid">
      <header className="flex items-center gap-4 bg-white px-6 py-4 shadow-sm">
        <Link to="/kid" className="flex min-h-touch items-center rounded-xl bg-slate-100 px-4 text-base">
          ← Trang chủ
        </Link>
        <h1 className="text-2xl font-bold">🏆 Thành tích</h1>
        <span className="ml-auto rounded-full bg-orange-100 px-4 py-2 font-bold">🔥 {a.streak}</span>
        <span className="rounded-full bg-amber-100 px-4 py-2 font-bold">⭐ {a.stars}</span>
      </header>

      <section className="p-6">
        <h2 className="text-2xl font-bold">Huy hiệu</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {a.badges.map((b) => (
            <li key={b.code} className={`flex flex-col items-center gap-1 rounded-3xl bg-white p-4 text-center shadow-sm ${b.earnedAt ? '' : 'opacity-40 grayscale'}`}>
              <span className="text-5xl">{b.icon}</span>
              <span className="font-semibold">{b.name}</span>
              <span className="text-sm text-slate-500">{b.earnedAt ? new Date(b.earnedAt).toLocaleDateString('vi-VN') : `+${b.bonusStars} ⭐`}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-6">
        <h2 className="text-2xl font-bold">🎁 Đổi quà</h2>
        <p className="text-base text-slate-500">Con còn đổi được {a.available} ⭐</p>
        {redeem.error && <p className="mt-2 text-red-600">{errorMessage(redeem.error)}</p>}
        {a.rewards.length === 0 && <p className="mt-2 text-slate-500">Bố mẹ chưa thêm quà nào.</p>}
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {a.rewards.map((r) => {
            const enough = a.available >= r.costStars
            return (
              <li key={r.id} className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm">
                <span className="text-4xl">{r.icon}</span>
                <span className="flex-1 font-semibold">{r.name}</span>
                <button
                  type="button"
                  disabled={!enough || redeem.isPending}
                  onClick={() => confirm(`Đổi ${r.costStars} ⭐ lấy "${r.name}"?`) && redeem.mutate(r.id)}
                  className="min-h-touch rounded-2xl bg-amber-500 px-4 font-bold text-white disabled:bg-slate-300"
                >
                  {r.costStars} ⭐
                </button>
              </li>
            )
          })}
        </ul>
        {a.redemptions.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1 text-base">
            {a.redemptions.map((r) => (
              <li key={r.id}>
                {r.reward.icon} {r.reward.name} · {STATUS[r.status]}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="p-6">
        <h2 className="text-2xl font-bold">Lịch sử sao</h2>
        <ul className="mt-2 flex flex-col gap-1 text-base">
          {a.history.map((h) => (
            <li key={h.id} className="flex gap-3">
              <span className={`w-14 text-right font-bold ${h.delta > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {h.delta > 0 ? `+${h.delta}` : h.delta} ⭐
              </span>
              <span className="flex-1">{h.note ?? h.reason}</span>
              <span className="text-slate-400">{new Date(h.createdAt).toLocaleDateString('vi-VN')}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
