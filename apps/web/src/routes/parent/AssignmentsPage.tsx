import type { AssignmentView } from '@for-kids/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api, errorMessage } from '../../api'

const fmt = (iso: string) => new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function status(a: AssignmentView) {
  if (a.completedAt) return <span className="text-emerald-700">✓ Đã làm {a.scorePct !== null ? `· ${Math.round(a.scorePct)}%` : ''}</span>
  if (a.overdue) return <span className="font-semibold text-red-600">Quá hạn</span>
  return <span className="text-amber-700">Chưa làm</span>
}

/** Giao bài (§6 phụ huynh, mục 3): tình trạng làm bài. Giao bài mới từ trang chi tiết bài. */
export function AssignmentsPage() {
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['parent', 'assignments'], queryFn: () => api<AssignmentView[]>('/parent/assignments') })
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/parent/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['parent', 'assignments'] }),
  })

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">Bài đã giao</h1>
      <p className="mt-1 text-sm text-slate-500">
        Giao bài mới: vào <Link to="/parent/worksheets" className="underline">Bài tập</Link> → chọn bài đã xuất bản → Giao bài.
      </p>
      {list.isPending && <p className="mt-6 text-slate-500">Đang tải…</p>}
      {list.error && <p className="mt-6 text-red-600">{errorMessage(list.error)}</p>}
      {list.data?.length === 0 && <p className="mt-6 text-slate-500">Chưa giao bài nào.</p>}
      <ul className="mt-4 flex flex-col gap-2">
        {list.data?.map((a) => (
          <li key={a.id} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
            <span className="text-3xl">{a.child.avatar}</span>
            <div className="flex-1">
              <p className="font-semibold">
                {a.child.name} · {a.worksheet.title}
              </p>
              <p className="text-sm text-slate-500">
                Giao {fmt(a.createdAt)}
                {a.dueAt ? ` · hạn ${fmt(a.dueAt)}` : ''}
              </p>
            </div>
            {status(a)}
            {!a.completedAt && (
              <button type="button" onClick={() => confirm('Huỷ bài đã giao?') && cancel.mutate(a.id)} className="min-h-touch px-3 text-sm text-red-600">
                Huỷ
              </button>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
