import { gradeLabel, type WorksheetStatus, type WorksheetSummary } from '@for-kids/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, errorMessage } from '../../api'

const TABS: { status: WorksheetStatus; label: string }[] = [
  { status: 'draft', label: 'Nháp' },
  { status: 'published', label: 'Đã xuất bản' },
  { status: 'archived', label: 'Lưu trữ' },
]

/** Danh sách bài tập (§6 phụ huynh, mục 2). */
export function WorksheetsPage() {
  const [status, setStatus] = useState<WorksheetStatus>('draft')
  const list = useQuery({
    queryKey: ['parent', 'worksheets', status],
    queryFn: () => api<WorksheetSummary[]>(`/parent/worksheets?status=${status}`),
  })

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Bài tập</h1>
        <Link to="/parent/worksheets/new" className="ml-auto flex min-h-touch items-center rounded-xl bg-slate-800 px-5 text-white">
          + Tạo bài (JSON)
        </Link>
      </div>
      <div className="mt-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.status}
            type="button"
            onClick={() => setStatus(t.status)}
            className={`min-h-touch rounded-xl px-4 ${status === t.status ? 'bg-slate-800 text-white' : 'bg-white shadow-sm'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.isPending && <p className="mt-6 text-slate-500">Đang tải…</p>}
      {list.error && <p className="mt-6 text-red-600">{errorMessage(list.error)}</p>}
      {list.data?.length === 0 && (
        <p className="mt-6 text-slate-500">
          Chưa có bài nào. Agent tạo bài qua MCP (xem <Link to="/parent/settings" className="underline">Cài đặt</Link>) hoặc bấm "Tạo bài".
        </p>
      )}
      <ul className="mt-4 flex flex-col gap-2">
        {list.data?.map((w) => (
          <li key={w.id}>
            <Link to={`/parent/worksheets/${w.id}`} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm hover:bg-slate-50">
              <div className="flex-1">
                <p className="font-semibold">{w.title}</p>
                <p className="text-sm text-slate-500">
                  {w.subjectName} · {gradeLabel(w.grade)}
                  {w.topic ? ` · ${w.topic}` : ''} · {w.questionCount} câu
                  {w.timeLimitSec ? ` · ⏱ ${Math.round(w.timeLimitSec / 60)} phút` : ''}
                  {w.layout === 'grid' ? ' · dạng lưới' : ''}
                </p>
              </div>
              <span className="text-sm text-slate-400">{w.source === 'mcp' ? '🤖 agent' : '✍️ tự soạn'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
