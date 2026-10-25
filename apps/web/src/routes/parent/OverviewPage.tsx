import { addDays, type ChildReport, type Mistake, type Profile, type SkillLevel } from '@for-kids/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, errorMessage } from '../../api'
import { ColumnChart } from '../../components/ColumnChart'
import { QuestionView } from '../../components/questions/QuestionView'

const LEVEL: Record<SkillLevel, { label: string; className: string }> = {
  unrated: { label: 'Chưa đủ dữ liệu', className: 'bg-slate-100 text-slate-600' },
  needs_practice: { label: '⚠️ Cần luyện', className: 'bg-red-50 text-red-700' },
  improving: { label: '📈 Đang tiến bộ', className: 'bg-amber-50 text-amber-800' },
  mastered: { label: '✅ Thành thạo', className: 'bg-emerald-50 text-emerald-800' },
}

const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

/** Tổng quan (§6 phụ huynh, mục 1). */
export function OverviewPage() {
  const kids = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api<Profile[]>('/parent/children') })
  const [childId, setChildId] = useState<string | null>(null)
  const current = childId ?? kids.data?.[0]?.id ?? null
  const report = useQuery({
    queryKey: ['parent', 'report', current],
    queryFn: () => api<ChildReport>(`/parent/children/${current}/report`),
    enabled: !!current,
  })
  const [showMistakes, setShowMistakes] = useState(false)
  const mistakes = useQuery({
    queryKey: ['parent', 'mistakes', current],
    queryFn: () => api<Mistake[]>(`/parent/children/${current}/mistakes`),
    enabled: !!current && showMistakes,
  })

  if (kids.data?.length === 0) {
    return (
      <main className="p-6 text-slate-500">
        Chưa có bé nào. Thêm ở <Link to="/parent/children" className="underline">Hồ sơ các bé</Link>.
      </main>
    )
  }
  const r = report.data

  // 14 ngày gần nhất theo múi giờ của gia đình (server tính), kể cả ngày không học (cột 0).
  const daily = Array.from({ length: r ? 14 : 0 }, (_, i) => {
    const date = addDays(r!.today, i - 13)
    const d = r?.daily.find((x) => x.date === date)
    return { label: dm(date), value: d?.minutes ?? 0, detail: d ? `${d.attempts} lần nộp` : 'không học' }
  })

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-bold">Tổng quan</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {kids.data?.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => {
              setChildId(k.id)
              setShowMistakes(false)
            }}
            className={`min-h-touch rounded-xl px-4 ${current === k.id ? 'bg-slate-800 text-white' : 'bg-white shadow-sm'}`}
          >
            {k.avatar} {k.name}
          </button>
        ))}
      </div>

      {report.isPending && current && <p className="mt-6 text-slate-500">Đang tải…</p>}
      {report.error && <p className="mt-6 text-red-600">{errorMessage(report.error)}</p>}
      {r && (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Chuỗi ngày học" value={`🔥 ${r.streak}`} hint="ngày liên tiếp" />
            <Tile label="Sao" value={`⭐ ${r.stars}`} />
            <Tile label="Câu cần ôn hôm nay" value={r.reviewDue} />
            <Tile label="Bài quá hạn" value={r.overdue.length} hint={`${r.pending.length} bài chưa tới hạn`} />
          </section>

          <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {r.subjects.length === 0 && <p className="text-slate-500">8 tuần gần đây chưa làm bài nào.</p>}
            {r.subjects.map((s) => (
              <Tile key={s.subjectCode} label={s.subjectName} value={`${Math.round(s.avgScorePct)}%`} hint={`trung bình ${s.worksheets} bài (lần đầu)`} />
            ))}
          </section>

          <section className="mt-4 grid grid-cols-1 gap-4 rounded-2xl bg-white p-4 shadow-sm lg:grid-cols-2">
            <ColumnChart
              title="Điểm trung bình theo tuần (lần chính thức, %)"
              max={100}
              unit="%"
              points={r.weekly.map((w) => ({ label: dm(w.weekStart), value: Math.round(w.avgScorePct), detail: `${w.attempts} bài` }))}
            />
            <ColumnChart title="Số phút học mỗi ngày (14 ngày)" unit="′" points={daily} />
          </section>

          <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Kỹ năng cần luyện</h2>
            {r.weakSkills.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">Chưa có kỹ năng nào dưới 50% (cần ít nhất 5 câu để đánh giá).</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {r.weakSkills.map((s) => (
                  <li key={s.code} className="rounded-xl bg-red-50 px-3 py-1 text-sm text-red-800">
                    {s.name} · {Math.round(s.mastery * 100)}% · {s.correct}/{s.answered} câu đúng
                  </li>
                ))}
              </ul>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-slate-500">Tất cả kỹ năng ({r.skills.length})</summary>
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-1">Kỹ năng</th>
                    <th>Mức</th>
                    <th className="text-right">Thành thạo</th>
                    <th className="text-right">Đúng / đã làm</th>
                  </tr>
                </thead>
                <tbody>
                  {r.skills.map((s) => (
                    <tr key={s.code} className="border-t border-slate-100">
                      <td className="py-1">
                        {s.name} <span className="text-xs text-slate-400">{s.code}</span>
                      </td>
                      <td>
                        <span className={`rounded px-1.5 text-xs ${LEVEL[s.level].className}`}>{LEVEL[s.level].label}</span>
                      </td>
                      <td className="text-right font-mono">{Math.round(s.mastery * 100)}%</td>
                      <td className="text-right font-mono">
                        {s.correct}/{s.answered}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          {(r.overdue.length > 0 || r.pending.length > 0) && (
            <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="font-semibold">Bài được giao chưa làm</h2>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {[...r.overdue, ...r.pending].map((a) => (
                  <li key={a.id} className={a.overdue ? 'text-red-700' : ''}>
                    {a.overdue ? '⏰ Quá hạn · ' : ''}
                    {a.worksheet.title}
                    {a.dueAt ? ` · hạn ${new Date(a.dueAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Câu sai gần đây</h2>
              <button type="button" onClick={() => setShowMistakes(!showMistakes)} className="min-h-touch rounded-xl bg-slate-100 px-4 text-sm">
                {showMistakes ? 'Ẩn' : 'Xem'}
              </button>
            </div>
            {showMistakes && (
              <ol className="mt-3 flex flex-col gap-3 text-lg">
                {mistakes.data?.length === 0 && <p className="text-sm text-slate-500">Chưa có câu sai nào.</p>}
                {mistakes.data?.map((m, i) => (
                  <li key={`${m.attemptId}-${i}`} className="rounded-2xl border border-slate-100 p-4">
                    <p className="mb-2 text-sm text-slate-400">
                      {m.worksheetTitle ?? 'Ôn tập'} · {new Date(m.answeredAt).toLocaleDateString('vi-VN')} · {m.skillCodes.join(', ')}
                    </p>
                    <QuestionView body={m.question} solution={m.question} response={m.response} lang="vi-VN" />
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </main>
  )
}
