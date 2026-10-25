import { gradeLabel, type ParentSummary, type WorksheetStatus, type WorksheetSummary } from '@for-kids/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { api, errorMessage } from '../../api'
import { WORKSHEET_STATUS } from '../../copy'

const ORDER: WorksheetStatus[] = ['draft', 'published', 'archived']

const EMPTY: Record<WorksheetStatus, string> = {
  draft: 'Không có bài nào đang soạn.',
  published: 'Chưa có bài nào mở cho con. Mở một bài đang soạn để con thấy trong kho bài nhé.',
  archived: 'Chưa cất bài nào.',
}

/** Kho bài (§6 phụ huynh, mục 2). */
export function WorksheetsPage() {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  // Mặc định: có bài đang soạn thì mở tab đó (việc cần làm), không thì xem bài đang mở cho con.
  const drafts = queryClient.getQueryData<ParentSummary>(['parent', 'summary'])?.draftWorksheets ?? 0
  const fromUrl = params.get('status') as WorksheetStatus | null
  const status: WorksheetStatus = fromUrl && ORDER.includes(fromUrl) ? fromUrl : drafts > 0 ? 'draft' : 'published'
  const list = useQuery({
    queryKey: ['parent', 'worksheets', status],
    queryFn: () => api<WorksheetSummary[]>(`/parent/worksheets?status=${status}`),
  })

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Kho bài</h1>
        <Link to="/parent/worksheets/new" className="ml-auto flex min-h-touch items-center rounded-xl bg-slate-800 px-5 font-semibold text-white">
          ✨ Soạn bài mới
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">Mẹo: nhờ trợ lý AI soạn bài từ file PDF/ảnh (Cài đặt → Trợ lý AI), bài sẽ nằm ở mục "Đang soạn" để bố mẹ xem lại.</p>

      <div className="mt-4 flex gap-1 rounded-xl bg-slate-200/60 p-1 sm:w-fit">
        {ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setParams({ status: s }, { replace: true })}
            className={`min-h-11 flex-1 rounded-lg px-4 text-sm font-medium whitespace-nowrap ${status === s ? 'bg-white shadow-sm' : 'text-slate-600'}`}
          >
            {WORKSHEET_STATUS[s].tab}
            {s === 'draft' && drafts > 0 ? ` (${drafts})` : ''}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-slate-400">{WORKSHEET_STATUS[status].hint}</p>

      {list.isPending && <p className="mt-6 text-slate-500">Đang tải…</p>}
      {list.error && <p className="mt-6 text-red-600">{errorMessage(list.error)}</p>}
      {list.data?.length === 0 && <p className="mt-6 text-slate-500">{EMPTY[status]}</p>}
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
                  {w.layout === 'grid' ? ' · nhiều câu một màn' : ''}
                </p>
              </div>
              <span className="text-sm text-slate-400">{w.source === 'mcp' ? '🤖 AI soạn' : '✍️ Bố mẹ soạn'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
