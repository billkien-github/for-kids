import { gradeQuestion, hourHandAngle } from '@for-kids/shared'
import { useState } from 'react'
import { Clock } from '../Clock'
import { RichText } from '../RichText'
import { field, optionClass, type Mark, type QuestionProps } from './common'

const PAIR_COLORS = ['bg-amber-200', 'bg-lime-200', 'bg-sky-200', 'bg-fuchsia-200', 'bg-orange-200', 'bg-teal-200', 'bg-rose-200', 'bg-indigo-200']

/**
 * Nối cột bằng cách chạm: chạm một ô bên trái rồi chạm ô bên phải để nối.
 * Chạm lại ô đã nối để gỡ. Cặp đã nối cùng màu.
 */
export function Matching({ body, solution, response, onChange, lang }: QuestionProps<'matching'>) {
  const pairs = field<[string, string][]>(response, 'pairs', [])
  const [pickedLeft, setPickedLeft] = useState<string | null>(null)
  const rightOf = new Map(pairs)
  const leftOf = new Map(pairs.map(([l, r]) => [r, l]))
  const colorOf = (leftId: string) => PAIR_COLORS[body.left.findIndex((l) => l.id === leftId) % PAIR_COLORS.length]
  const correct = new Map(solution?.pairs ?? [])
  const enLang = lang.startsWith('en') ? lang : undefined

  const tapLeft = (id: string) => {
    if (rightOf.has(id)) onChange({ pairs: pairs.filter(([l]) => l !== id) })
    setPickedLeft(pickedLeft === id ? null : id)
  }
  const tapRight = (id: string) => {
    const owner = leftOf.get(id)
    if (!pickedLeft) {
      if (owner) onChange({ pairs: pairs.filter(([, r]) => r !== id) })
      return
    }
    onChange({ pairs: [...pairs.filter(([l, r]) => l !== pickedLeft && r !== id), [pickedLeft, id]] })
    setPickedLeft(null)
  }

  const leftMark = (id: string): Mark => {
    if (!solution) return null
    return rightOf.get(id) === correct.get(id) ? 'correct' : 'wrong'
  }

  return (
    <div className="flex flex-col gap-3">
      {!solution && <p className="text-base text-slate-500">Chạm một ô bên trái, rồi chạm ô bên phải để nối</p>}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          {body.left.map((l) => {
            const paired = rightOf.has(l.id)
            return (
              <button
                key={l.id}
                type="button"
                disabled={!!solution}
                onClick={() => tapLeft(l.id)}
                className={`${optionClass(pickedLeft === l.id, leftMark(l.id))} ${paired && !solution ? colorOf(l.id) : ''}`}
              >
                <RichText value={l.content} clockSize={110} lang={enLang} />
                {solution && rightOf.get(l.id) !== correct.get(l.id) && (
                  <p className="mt-1 text-base text-emerald-700">
                    Đúng: {body.right.find((r) => r.id === correct.get(l.id))?.content.text ?? '…'}
                  </p>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex flex-col gap-3">
          {body.right.map((r) => {
            const owner = leftOf.get(r.id)
            return (
              <button
                key={r.id}
                type="button"
                disabled={!!solution}
                onClick={() => tapRight(r.id)}
                className={`${optionClass(false)} ${owner ? colorOf(owner) : ''}`}
              >
                <RichText value={r.content} clockSize={110} lang={enLang} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Sắp xếp: dùng nút lên/xuống (dễ bấm trên iPad hơn kéo thả với trẻ nhỏ). */
export function Ordering({ body, solution, response, onChange, lang }: QuestionProps<'ordering'>) {
  const order = field<string[]>(response, 'order', body.items.map((i) => i.id))
  const byId = new Map(body.items.map((i) => [i.id, i]))
  // Lần đầu hiện câu thì ghi luôn thứ tự hiện tại, để "không đổi gì" vẫn là một câu trả lời.
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return
    const next = [...order]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x!)
    onChange({ order: next })
  }
  const ok = solution ? gradeQuestion(solution, { order }) === 1 : null
  return (
    <div className="flex flex-col gap-2">
      {order.map((id, i) => (
        <div key={id} className={`flex items-center gap-2 ${optionClass(false, ok === null ? null : solution!.answer[i] === id ? 'correct' : 'wrong')}`}>
          <span className="w-8 text-center text-xl font-bold text-slate-400">{i + 1}</span>
          <div className="flex-1">
            <RichText value={byId.get(id)!.content} clockSize={100} lang={lang.startsWith('en') ? lang : undefined} />
          </div>
          {!solution && (
            <>
              <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="size-12 rounded-xl bg-slate-100 text-2xl disabled:opacity-30" aria-label="Lên">
                ↑
              </button>
              <button type="button" onClick={() => move(i, i + 1)} disabled={i === order.length - 1} className="size-12 rounded-xl bg-slate-100 text-2xl disabled:opacity-30" aria-label="Xuống">
                ↓
              </button>
            </>
          )}
        </div>
      ))}
      {solution && !ok && (
        <p className="text-emerald-700">Thứ tự đúng: {solution.answer.map((id) => byId.get(id)?.content.text ?? '…').join(' → ')}</p>
      )}
    </div>
  )
}

/** Quay kim đồng hồ: chọn kim rồi chạm/kéo trên mặt đồng hồ. */
export function ClockSet({ body, solution, response, onChange }: QuestionProps<'clock_set'>) {
  const snap = body.snapMinutes ?? 5
  const hourAngle = field<number>(response, 'hourAngle', 0)
  const minute = field<number>(response, 'minute', 0)
  const [active, setActive] = useState<'hour' | 'minute'>(body.hands === 'hour' ? 'hour' : 'minute')

  const setAngle = (angle: number) => {
    if (active === 'minute') {
      const m = (Math.round(angle / 6 / snap) * snap) % 60
      onChange({ hourAngle, minute: m })
    } else {
      onChange({ hourAngle: Math.round(angle / 2.5) * 2.5, minute: body.hands === 'hour' ? 0 : minute })
    }
  }

  const ok = solution ? gradeQuestion(solution, { hourAngle, minute }) === 1 : null
  return (
    <div className="flex flex-col items-center gap-4">
      {!solution && body.hands === 'both' && (
        <div className="flex gap-2">
          {(['hour', 'minute'] as const).map((h) => (
            <button key={h} type="button" onClick={() => setActive(h)} className={optionClass(active === h)}>
              {h === 'hour' ? '🔴 Kim giờ (ngắn)' : '🔵 Kim phút (dài)'}
            </button>
          ))}
        </div>
      )}
      <div className={`rounded-full ${ok === null ? '' : ok ? 'ring-4 ring-emerald-500' : 'ring-4 ring-red-400'}`}>
        <Clock
          hourAngle={hourAngle}
          minute={body.hands === 'hour' ? 0 : minute}
          size={280}
          highlight={solution ? undefined : active}
          onPointAngle={solution ? undefined : setAngle}
        />
      </div>
      {solution && !ok && (
        <div className="flex flex-col items-center text-emerald-700">
          <span>Đúng là:</span>
          <Clock hourAngle={hourHandAngle(solution.answer.h, solution.answer.m)} minute={solution.answer.m} size={140} />
        </div>
      )}
    </div>
  )
}
