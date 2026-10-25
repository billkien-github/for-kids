import type { AssignmentView, Profile } from '@for-kids/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, errorMessage } from '../../api'

const fmt = (iso: string) => new Date(iso).toLocaleString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const GROUPS = [
  { key: 'overdue', title: '⏰ Trễ hạn', hint: 'Nhắc con làm nhé', match: (a: AssignmentView) => a.overdue },
  { key: 'pending', title: '⏳ Con chưa làm', hint: '', match: (a: AssignmentView) => !a.completedAt && !a.overdue },
  { key: 'done', title: '✓ Con đã làm xong', hint: '', match: (a: AssignmentView) => !!a.completedAt },
] as const

/** Bài đã giao (§6 phụ huynh, mục 3), chia theo việc cần để ý: trễ hạn → chưa làm → đã xong. */
export function AssignmentsPage() {
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['parent', 'assignments'], queryFn: () => api<AssignmentView[]>('/parent/assignments') })
  const children = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api<Profile[]>('/parent/children') })
  const [childId, setChildId] = useState<string | null>(null)
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/parent/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['parent', 'assignments'] }),
  })

  // Nút lọc theo bé: theo thứ tự ưu tiên phụ huynh đã sắp ở Cài đặt → Các con.
  const rank = new Map(children.data?.map((c, i) => [c.id, i]))
  const kids = [...new Map((list.data ?? []).map((a) => [a.child.id, a.child])).values()].sort(
    (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
  )
  const shown = (list.data ?? []).filter((a) => !childId || a.child.id === childId)

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">Bài đã giao</h1>
      <p className="mt-1 text-sm text-slate-500">
        Muốn giao bài mới: vào{' '}
        <Link to="/parent/worksheets?status=published" className="underline">
          Kho bài
        </Link>{' '}
        → chọn bài đang mở → 📌 Giao cho con.
      </p>

      {kids.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setChildId(null)} className={`min-h-11 rounded-xl px-4 ${!childId ? 'bg-slate-900 text-white' : 'bg-white shadow-sm'}`}>
            Tất cả
          </button>
          {kids.map((k) => (
            <button key={k.id} type="button" onClick={() => setChildId(k.id)} className={`min-h-11 rounded-xl px-4 ${childId === k.id ? 'bg-slate-900 text-white' : 'bg-white shadow-sm'}`}>
              {k.avatar} {k.name}
            </button>
          ))}
        </div>
      )}

      {list.isPending && <p className="mt-6 text-slate-500">Đang tải…</p>}
      {list.error && <p className="mt-6 text-red-600">{errorMessage(list.error)}</p>}
      {list.data?.length === 0 && <p className="mt-6 text-slate-500">Chưa giao bài nào cho con.</p>}
      {cancel.error && <p className="mt-2 text-red-600">{errorMessage(cancel.error)}</p>}

      {GROUPS.map((g) => {
        const items = shown.filter(g.match)
        if (items.length === 0) return null
        return (
          <section key={g.key} className="mt-6">
            <h2 className="font-semibold">
              {g.title} <span className="font-normal text-slate-400">({items.length})</span>
              {g.hint && <span className="ml-2 text-sm font-normal text-red-600">{g.hint}</span>}
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {items.map((a) => (
                <li key={a.id} className={`flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ${a.overdue ? 'ring-2 ring-red-200' : ''}`}>
                  <span className="text-3xl">{a.child.avatar}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {a.child.name} · {a.worksheet.title}
                    </p>
                    <p className="text-sm text-slate-500">
                      Giao {fmt(a.createdAt)}
                      {a.dueAt ? ` · hạn ${fmt(a.dueAt)}` : ' · không có hạn'}
                    </p>
                  </div>
                  {a.completedAt ? (
                    <span className="text-right text-emerald-700">
                      {a.scorePct !== null ? `${Math.round(a.scorePct)}%` : '✓'}
                      <span className="block text-xs text-slate-400">{fmt(a.completedAt)}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => confirm(`Bỏ giao "${a.worksheet.title}" cho ${a.child.name}?`) && cancel.mutate(a.id)}
                      className="min-h-touch px-3 text-sm text-slate-500"
                    >
                      Bỏ giao
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </main>
  )
}
