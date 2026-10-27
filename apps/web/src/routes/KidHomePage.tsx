import { gradeLabel, type AttemptView, type LibraryItem } from '@for-kids/shared'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { errorMessage, post } from '../api'
import { useKidHome } from './kid/KidLayout'
import { Stars } from './kid/ResultView'

const SUBJECT_ICON: Record<string, string> = { math: '🔢', vi: '📖', en: '🔤' }
const NO_TOPIC = 'Khác'

const SHOW_FILTER = {
  all: { label: 'Tất cả', keep: () => true },
  todo: { label: 'Ẩn bài đủ 3 ⭐', keep: (w: LibraryItem) => w.bestStars === null || w.bestStars < 3 },
  new: { label: 'Chỉ bài mới', keep: (w: LibraryItem) => w.bestStars === null },
}
type ShowFilter = keyof typeof SHOW_FILTER

const dueLabel = (iso: string) => new Date(iso).toLocaleString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const greeting = () => {
  const h = new Date().getHours()
  return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'
}

/** Trang Học của con (§6 bé, mục 2): bài bố mẹ giao, kho bài theo môn. */
export function KidHomePage() {
  const navigate = useNavigate()
  const home = useKidHome()
  // Bộ lọc kho bài nằm trên URL: làm bài xong quay lại vẫn đúng tab.
  const [params, setParams] = useSearchParams()
  const setFilter = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) p.delete(k)
          else p.set(k, v)
        }
        return p
      },
      { replace: true },
    )
  const allGrades = params.get('grades') === 'all'
  const [error, setError] = useState<string | null>(null)

  if (home.isPending) return <p className="p-8 text-center text-slate-500">Đang tải…</p>
  if (home.error) return <p className="p-8 text-center text-red-600">{errorMessage(home.error)}</p>
  const { child, reviewDue, today, library } = home.data

  const go = async (start: () => Promise<AttemptView>) => {
    setError(null)
    try {
      const attempt = await start()
      navigate(`/kid/attempt/${attempt.id}`)
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  const open = (worksheetId: string, assignmentId?: string) => go(() => post<AttemptView>('/kid/attempts', { worksheetId, assignmentId }))

  // Ẩn bài đã xong: lọc trước để số bài trên các tab khớp với bài đang hiện.
  const showParam = params.get('show') ?? ''
  const show: ShowFilter = Object.hasOwn(SHOW_FILTER, showParam) ? (showParam as ShowFilter) : 'all'
  const visible = library.filter(SHOW_FILTER[show].keep)
  const hiddenCount = library.length - visible.length

  // Xem lớp khác: hiện tab lớp, mặc định "Tất cả lớp".
  // Tab lớp lấy theo cả kho (lọc xong mà lớp đang chọn hết bài thì vẫn giữ tab đó), số đếm theo bài đang hiện.
  const gradeCounts = new Map<number, number>()
  for (const w of library) gradeCounts.set(w.grade, gradeCounts.get(w.grade) ?? 0)
  for (const w of visible) gradeCounts.set(w.grade, gradeCounts.get(w.grade)! + 1)
  const grades = [...gradeCounts].sort(([a], [b]) => a - b)
  const pickedGrade = params.get('grade') === null ? null : Number(params.get('grade'))
  const grade = !allGrades ? child.grade : pickedGrade !== null && gradeCounts.has(pickedGrade) ? pickedGrade : null
  const ofGrade = grade === null ? visible : visible.filter((w) => w.grade === grade)
  const subjects = [...new Map(ofGrade.map((w) => [w.subjectCode, w.subjectName])).entries()]
  const subject = subjects.some(([code]) => code === params.get('subject')) ? params.get('subject') : null
  const ofSubject = ofGrade.filter((w) => !subject || w.subjectCode === subject)
  const topicCounts = new Map<string, number>()
  for (const w of ofSubject) topicCounts.set(w.topic ?? NO_TOPIC, (topicCounts.get(w.topic ?? NO_TOPIC) ?? 0) + 1)
  const topic = topicCounts.has(params.get('topic') ?? '') ? params.get('topic') : null
  const shown = ofSubject.filter((w) => !topic || (w.topic ?? NO_TOPIC) === topic)

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6">
      <p className="pt-5 text-2xl font-bold">
        {greeting()}, {child.name}! 👋
      </p>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}

      {reviewDue > 0 && (
        <button
          type="button"
          onClick={() => go(() => post<AttemptView>('/kid/review'))}
          className="mt-4 flex w-full items-center gap-4 rounded-3xl bg-violet-600 p-5 text-left text-white shadow-sm active:scale-[0.98]"
        >
          <span className="text-4xl">🔁</span>
          <span className="flex-1">
            <span className="block text-xl font-bold">Ôn lại {reviewDue} câu con chưa đúng</span>
            <span className="text-base text-violet-100">Làm xong được thêm 1 ⭐</span>
          </span>
          <span className="text-xl font-bold">Ôn ngay →</span>
        </button>
      )}

      <section className="mt-6">
        <h2 className="text-2xl font-bold">📌 Bài bố mẹ giao</h2>
        {today.length === 0 ? (
          <p className="mt-2 text-slate-500">Con làm hết bài bố mẹ giao rồi! 🎉 Chọn thêm bài trong kho bên dưới nhé.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {today.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => open(a.worksheet.id, a.id)}
                  className={`flex w-full items-center gap-4 rounded-3xl bg-white p-5 text-left shadow-sm active:scale-[0.98] ${a.overdue ? 'ring-2 ring-red-400' : ''}`}
                >
                  <span className="text-4xl">{SUBJECT_ICON[a.worksheet.subjectCode] ?? '📝'}</span>
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="text-xl font-semibold">{a.worksheet.title}</span>
                    <span className="text-base text-slate-500">
                      {a.worksheet.questionCount} câu
                      {a.worksheet.timeLimitSec ? ` · ⏱ ${Math.round(a.worksheet.timeLimitSec / 60)} phút` : ''}
                    </span>
                    {a.dueAt && (
                      <span className={`text-base ${a.overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                        {a.overdue ? '⏰ Trễ hạn rồi, làm ngay nhé!' : `Hạn: ${dueLabel(a.dueAt)}`}
                      </span>
                    )}
                  </span>
                  <span className="rounded-2xl bg-sky-600 px-4 py-2 font-bold text-white">Làm bài</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center gap-x-4">
          <h2 className="text-2xl font-bold">📚 Kho bài của con</h2>
          <label className="ml-auto flex min-h-touch items-center gap-2 text-base text-slate-600">
            <input
              type="checkbox"
              checked={allGrades}
              onChange={(e) => setFilter(e.target.checked ? { grades: 'all' } : { grades: null, grade: null })}
              className="size-5"
            />
            Xem bài của lớp khác
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-base text-slate-600">Hiện:</span>
          {(Object.keys(SHOW_FILTER) as ShowFilter[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={show === k}
              onClick={() => setFilter({ show: k === 'all' ? null : k })}
              className={`min-h-touch rounded-full px-4 text-base ${show === k ? 'bg-slate-700 font-semibold text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
            >
              {SHOW_FILTER[k].label}
            </button>
          ))}
          {hiddenCount > 0 && <span className="text-sm text-slate-500">Đang ẩn {hiddenCount} bài</span>}
        </div>
        {allGrades && grades.length > 1 && (
          <TabBar>
            <Tab active={grade === null} count={visible.length} onClick={() => setFilter({ grade: null })}>
              Tất cả lớp
            </Tab>
            {grades.map(([g, n]) => (
              <Tab key={g} active={grade === g} count={n} onClick={() => setFilter({ grade: String(g) })}>
                {gradeLabel(g)}
                {g === child.grade ? ' ⭐' : ''}
              </Tab>
            ))}
          </TabBar>
        )}
        {subjects.length > 1 && (
          <TabBar>
            <Tab active={!subject} onClick={() => setFilter({ subject: null, topic: null })}>
              Tất cả môn
            </Tab>
            {subjects.map(([code, name]) => (
              <Tab key={code} active={subject === code} onClick={() => setFilter({ subject: code, topic: null })}>
                {SUBJECT_ICON[code] ?? '📝'} {name}
              </Tab>
            ))}
          </TabBar>
        )}
        {topicCounts.size > 1 && (
          <TabBar>
            <Tab active={!topic} count={ofSubject.length} onClick={() => setFilter({ topic: null })}>
              Tất cả
            </Tab>
            {[...topicCounts].map(([name, n]) => (
              <Tab key={name} active={topic === name} count={n} onClick={() => setFilter({ topic: name })}>
                {name}
              </Tab>
            ))}
          </TabBar>
        )}
        {shown.length === 0 && (
          <p className="mt-3 text-slate-500">
            {hiddenCount === 0
              ? 'Chưa có bài nào ở đây.'
              : show === 'new'
                ? 'Ở đây không còn bài mới. Chọn "Tất cả" để làm lại cho đủ 3 ⭐ nhé.'
                : 'Con làm hết bài ở đây rồi! 🎉'}
          </p>
        )}
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((w) => (
            <LibraryCard key={w.id} w={w} onOpen={() => open(w.id)} />
          ))}
        </ul>
      </section>
    </main>
  )
}

/** Hàng tab; nhiều chủ đề thì xuống dòng để bé thấy hết, không phải cuộn ngang. */
function TabBar({ children }: { children: React.ReactNode }) {
  return (
    // pt + gap chừa chỗ cho badge số bài lòi ra góc trên phải mỗi tab.
    <div role="tablist" className="mt-3 flex flex-wrap gap-x-4 gap-y-4 pt-2">
      {children}
    </div>
  )
}

function Tab({ active, count, onClick, children }: { active: boolean; count?: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative min-h-touch rounded-full px-5 text-base whitespace-nowrap ${active ? 'bg-sky-600 font-semibold text-white shadow-sm' : 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-200'}`}
    >
      {children}
      {count !== undefined && (
        <span
          className={`absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs leading-none font-bold text-white ring-2 ring-white ${active ? 'bg-amber-500' : 'bg-slate-400'}`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

// Bài mới nổi nhất; bài đủ 3 sao chìm xuống để bé thấy ngay còn bài nào cần làm.
const CARD_STYLE = {
  new: 'bg-white shadow-md ring-2 ring-amber-300',
  retry: 'bg-white shadow-sm',
  done: 'bg-slate-100/70 ring-1 ring-slate-200',
}

function LibraryCard({ w, onOpen }: { w: LibraryItem; onOpen: () => void }) {
  const state = w.bestStars === null ? 'new' : w.bestStars < 3 ? 'retry' : 'done'
  return (
    <li>
      <button type="button" onClick={onOpen} className={`flex h-full w-full flex-col gap-1 rounded-2xl p-4 text-left active:scale-[0.98] ${CARD_STYLE[state]}`}>
        <span className={`font-semibold ${state === 'done' ? 'text-slate-500' : ''}`}>{w.title}</span>
        {w.topic && <span className="text-sm text-slate-500">{w.topic}</span>}
        <span className="mt-auto pt-2">
          {w.bestStars === null ? (
            <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-sm font-bold text-white">✨ Bài mới</span>
          ) : state === 'done' ? (
            <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <Stars count={3} size="text-base" /> Xong rồi
            </span>
          ) : (
            <span className="flex flex-col">
              <Stars count={w.bestStars} size="text-xl" />
              <span className="text-xs text-slate-500">Làm lại lấy đủ 3 sao!</span>
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
