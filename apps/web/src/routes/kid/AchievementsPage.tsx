import type { Achievements } from '@for-kids/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorMessage, post } from '../../api'
import { kidHomeKey } from './KidLayout'

const STATUS = { pending: '⏳ Đang chờ bố mẹ', approved: '🎉 Đã nhận', rejected: '🙅 Lần sau nhé' } as const
const REASON: Record<string, string> = { worksheet: 'Làm bài', review: 'Ôn bài', badge: 'Huy hiệu', redeem: 'Đổi quà', manual: 'Bố mẹ tặng' }

/** Tab Quà của con (§6 bé, mục 5): đổi quà, huy hiệu, sao đã nhận. */
export function AchievementsPage() {
  const queryClient = useQueryClient()
  const data = useQuery({ queryKey: ['kid', 'achievements'], queryFn: () => api<Achievements>('/kid/achievements') })
  const redeem = useMutation({
    mutationFn: (rewardId: string) => post(`/kid/rewards/${rewardId}/redeem`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['kid', 'achievements'] })
      void queryClient.invalidateQueries({ queryKey: kidHomeKey })
    },
  })

  if (data.isPending) return <p className="p-8 text-center text-slate-500">Đang tải…</p>
  if (data.error) return <p className="p-8 text-center text-red-600">{errorMessage(data.error)}</p>
  const a = data.data
  const earned = a.badges.filter((b) => b.earnedAt).length

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6">
      <section className="pt-5">
        <h2 className="text-2xl font-bold">🎁 Đổi quà</h2>
        <p className="text-base text-slate-500">
          Con đang có {a.available} ⭐ để đổi
          {a.available !== a.stars ? ` (${a.stars - a.available} ⭐ đang chờ bố mẹ)` : ''}
        </p>
        {redeem.error && <p className="mt-2 text-red-600">{errorMessage(redeem.error)}</p>}
        {a.rewards.length === 0 && <p className="mt-2 text-slate-500">Bố mẹ chưa thêm quà nào. Nhắc bố mẹ nhé! 😉</p>}
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {a.rewards.map((r) => {
            const missing = r.costStars - a.available
            return (
              <li key={r.id} className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm">
                <span className="text-4xl">{r.icon}</span>
                <span className="flex flex-1 flex-col">
                  <span className="font-semibold">{r.name}</span>
                  {missing > 0 && <span className="text-sm text-slate-500">Cố thêm {missing} ⭐ nữa!</span>}
                </span>
                <button
                  type="button"
                  disabled={missing > 0 || redeem.isPending}
                  onClick={() => confirm(`Dùng ${r.costStars} ⭐ để đổi "${r.name}" nhé?`) && redeem.mutate(r.id)}
                  className="min-h-touch rounded-2xl bg-amber-500 px-4 font-bold text-white disabled:bg-slate-300"
                >
                  Đổi {r.costStars} ⭐
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

      <section className="mt-8">
        <h2 className="text-2xl font-bold">
          🏅 Huy hiệu <span className="text-lg font-normal text-slate-500">({earned}/{a.badges.length})</span>
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {a.badges.map((b) => (
            <li key={b.code} className={`flex flex-col items-center gap-1 rounded-3xl bg-white p-4 text-center shadow-sm ${b.earnedAt ? '' : 'opacity-40 grayscale'}`}>
              <span className="text-5xl">{b.icon}</span>
              <span className="font-semibold">{b.name}</span>
              <span className="text-sm text-slate-500">{b.earnedAt ? `Nhận ngày ${new Date(b.earnedAt).toLocaleDateString('vi-VN')}` : `Thưởng ${b.bonusStars} ⭐`}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-bold">⭐ Sao con đã nhận</h2>
        {a.history.length === 0 && <p className="mt-2 text-slate-500">Làm bài để nhận sao đầu tiên nhé!</p>}
        <ul className="mt-2 flex flex-col gap-1 text-base">
          {a.history.map((h) => (
            <li key={h.id} className="flex gap-3">
              <span className={`w-14 text-right font-bold ${h.delta > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {h.delta > 0 ? `+${h.delta}` : h.delta} ⭐
              </span>
              <span className="flex-1">{h.note ?? REASON[h.reason]}</span>
              <span className="text-slate-400">{new Date(h.createdAt).toLocaleDateString('vi-VN')}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
