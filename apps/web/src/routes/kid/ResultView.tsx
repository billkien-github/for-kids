import { COMPLETION_ONLY_TYPES, type AttemptView } from '@for-kids/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { errorMessage, post } from '../../api'
import { QuestionView } from '../../components/questions/QuestionView'

export function Stars({ count, size = 'text-5xl' }: { count: number; size?: string }) {
  return (
    <span className={size} aria-label={`${count} sao`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= count ? '' : 'opacity-20 grayscale'}>
          ⭐
        </span>
      ))}
    </span>
  )
}

const TONE = {
  ok: { border: 'border-emerald-500', text: 'text-emerald-600' },
  todo: { border: 'border-amber-400', text: 'text-amber-700' },
  wrong: { border: 'border-red-400', text: 'text-red-600' },
}

const cheer = (pct: number) => (pct >= 90 ? 'Xuất sắc! 🎉' : pct >= 75 ? 'Giỏi lắm! 👏' : pct >= 50 ? 'Khá rồi, cố thêm nhé! 💪' : 'Mình làm lại nhé! 🌱')

/**
 * Kết quả (§6 bé, mục 4): % đúng, sao, từng câu kèm đáp án đúng và lời giải.
 * `readOnly`: phụ huynh xem lại, không có nút làm lại.
 */
export function ResultView({ view, timeUp, readOnly }: { view: AttemptView; timeUp?: boolean; readOnly?: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const result = view.result!
  const responses = new Map(view.items.map((i) => [i.id, i.response]))
  const langOf = new Map(view.items.map((i) => [i.id, i.ttsLang]))

  const retry = async () => {
    try {
      const next = await post<AttemptView>('/kid/attempts', { worksheetId: view.worksheet!.id })
      await queryClient.invalidateQueries({ queryKey: ['kid', 'home'] })
      navigate(`/kid/attempt/${next.id}`)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <main className={`min-h-dvh text-kid ${readOnly ? '' : 'bg-sky-50'}`}>
      <section className="flex flex-col items-center gap-3 bg-white px-4 py-8 text-center shadow-sm">
        {timeUp && <p className="rounded-full bg-amber-100 px-4 py-1 text-amber-800">⏰ Hết giờ rồi, app đã nộp bài giúp con</p>}
        <p className="text-slate-500">{view.worksheet?.title ?? '🔁 Ôn bài'}</p>
        <Stars count={result.stars} />
        <p className="text-5xl font-bold">{Math.round(result.scorePct)}%</p>
        {!readOnly && <p className="text-2xl">{cheer(result.scorePct)}</p>}
        {result.starsGained > 0 && !readOnly && <p className="text-amber-700">Con nhận thêm {result.starsGained} ⭐</p>}
        {result.newBadges.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            {result.newBadges.map((b) => (
              <span key={b.code} className="animate-bounce rounded-2xl bg-amber-100 px-4 py-2 font-semibold">
                {b.icon} Huy hiệu mới: {b.name}
              </span>
            ))}
          </div>
        )}
        {!readOnly && (
          <div className="mt-2 flex gap-3">
            {view.worksheet && (
              <button type="button" onClick={retry} className="min-h-touch rounded-2xl bg-sky-600 px-6 font-bold text-white">
                🔁 Làm lại nhé
              </button>
            )}
            <Link to="/kid" className="flex min-h-touch items-center rounded-2xl bg-slate-200 px-6 font-semibold">
              📚 Chọn bài khác
            </Link>
          </div>
        )}
        {error && <p className="text-red-600">{error}</p>}
      </section>

      <ol className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        {result.items
          .filter((it) => it.body.type !== 'info')
          .map((it, i) => {
            // Tô màu không có đúng/sai, chỉ là đã tô hay chưa.
            const completion = COMPLETION_ONLY_TYPES.includes(it.body.type)
            const tone = it.isCorrect ? TONE.ok : completion ? TONE.todo : TONE.wrong
            const label = completion
              ? it.isCorrect
                ? '🎨 Tranh của con'
                : 'Con chưa tô bức tranh này'
              : it.isCorrect
                ? '✓ Đúng'
                : it.score && it.score > 0
                  ? 'Đúng một phần'
                  : '✗ Chưa đúng, xem lại nhé'
            return (
              <li key={it.id} className={`rounded-3xl border-l-8 bg-white p-5 shadow-sm ${tone.border}`}>
                <p className="mb-3 flex items-center justify-between text-base font-semibold">
                  <span className="text-slate-400">Câu {i + 1}</span>
                  <span className={tone.text}>{label}</span>
                </p>
                <QuestionView body={it.body} solution={it.body} response={responses.get(it.id)} lang={langOf.get(it.id) ?? 'vi-VN'} />
                {it.explanation && <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-lg">💡 {it.explanation}</p>}
              </li>
            )
          })}
      </ol>
    </main>
  )
}
