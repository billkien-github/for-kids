import type { RedemptionView, RewardInput, RewardView } from '@for-kids/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api, errorMessage, post } from '../../api'

const STATUS = { pending: '⏳ Đang chờ', approved: '🎉 Đã tặng', rejected: '🙅 Chưa đồng ý' } as const

/** Quà (§6 phụ huynh, mục 4): danh sách quà và duyệt yêu cầu đổi quà. */
export function RewardsPage() {
  const queryClient = useQueryClient()
  const rewards = useQuery({ queryKey: ['parent', 'rewards'], queryFn: () => api<RewardView[]>('/parent/rewards') })
  const redemptions = useQuery({ queryKey: ['parent', 'redemptions'], queryFn: () => api<RedemptionView[]>('/parent/redemptions') })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['parent', 'rewards'] })
    void queryClient.invalidateQueries({ queryKey: ['parent', 'redemptions'] })
  }

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => post(`/parent/redemptions/${id}/${approve ? 'approve' : 'reject'}`),
    onSuccess: refresh,
  })
  const toggle = useMutation({
    mutationFn: (r: RewardView) => api(`/parent/rewards/${r.id}`, { method: 'PUT', body: { name: r.name, icon: r.icon, costStars: r.costStars, active: !r.active } }),
    onSuccess: refresh,
  })

  const pending = redemptions.data?.filter((r) => r.status === 'pending') ?? []

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">Quà cho con</h1>

      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">🙋 Con đang xin đổi quà ({pending.length})</h2>
        {decide.error && <p className="mt-2 text-red-600">{errorMessage(decide.error)}</p>}
        {pending.length === 0 && <p className="mt-1 text-sm text-slate-500">Chưa con nào xin đổi quà.</p>}
        <ul className="mt-2 flex flex-col gap-2">
          {pending.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl bg-amber-50 p-3">
              <span className="text-2xl">{r.child.avatar}</span>
              <span className="flex-1">
                {r.child.name} muốn đổi lấy <b>{r.reward.icon} {r.reward.name}</b> ({r.costStars} ⭐)
              </span>
              <button type="button" onClick={() => decide.mutate({ id: r.id, approve: true })} className="min-h-touch rounded-xl bg-emerald-600 px-4 text-white">
                🎉 Đồng ý
              </button>
              <button type="button" onClick={() => decide.mutate({ id: r.id, approve: false })} className="min-h-touch rounded-xl px-4 text-red-600">
                Chưa được
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">🎁 Các món quà con có thể đổi</h2>
        <NewReward onCreated={refresh} />
        <ul className="mt-3 flex flex-col gap-2">
          {rewards.data?.map((r) => (
            <li key={r.id} className={`flex items-center gap-3 rounded-xl bg-slate-50 p-3 ${r.active ? '' : 'opacity-50'}`}>
              <span className="text-2xl">{r.icon}</span>
              <span className="flex-1">{r.name}</span>
              <span className="font-semibold">{r.costStars} ⭐</span>
              <button type="button" onClick={() => toggle.mutate(r)} className="min-h-touch px-3 text-sm text-slate-600">
                {r.active ? 'Tạm ẩn' : 'Hiện lại'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Quà đã đổi</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {redemptions.data
            ?.filter((r) => r.status !== 'pending')
            .map((r) => (
              <li key={r.id}>
                {STATUS[r.status]} · {r.child.avatar} {r.child.name} · {r.reward.icon} {r.reward.name} ({r.costStars} ⭐) ·{' '}
                {new Date(r.decidedAt ?? r.createdAt).toLocaleDateString('vi-VN')}
              </li>
            ))}
        </ul>
      </section>
    </main>
  )
}

function NewReward({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<RewardInput>({ name: '', icon: '🎁', costStars: 10, active: true })
  const create = useMutation({
    mutationFn: () => post('/parent/rewards', form),
    onSuccess: () => {
      setForm({ ...form, name: '' })
      onCreated()
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate()
  }
  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-sm">
        Hình
        <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} maxLength={16} className="min-h-touch w-20 rounded-xl border border-slate-300 px-3 text-center text-2xl" />
      </label>
      <label className="flex flex-1 flex-col text-sm">
        Tên quà
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={60} placeholder="vd. 30 phút xem hoạt hình" className="min-h-touch rounded-xl border border-slate-300 px-3" />
      </label>
      <label className="flex flex-col text-sm">
        Cần bao nhiêu ⭐
        <input
          type="number"
          min={1}
          value={form.costStars}
          onChange={(e) => setForm({ ...form, costStars: Number(e.target.value) })}
          className="min-h-touch w-24 rounded-xl border border-slate-300 px-3"
        />
      </label>
      <button disabled={create.isPending} className="min-h-touch rounded-xl bg-slate-800 px-5 text-white">
        ➕ Thêm quà
      </button>
      {create.error && <p className="w-full text-red-600">{errorMessage(create.error)}</p>}
    </form>
  )
}
