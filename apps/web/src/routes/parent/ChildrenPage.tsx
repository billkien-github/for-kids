import { AVATARS, GRADE_MAX, GRADE_MIN, gradeLabel, type ChildInput, type Profile } from '@for-kids/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../../api'
import { Modal } from '../../components/Modal'

const childrenKey = ['parent', 'children'] as const
const GRADES = Array.from({ length: GRADE_MAX - GRADE_MIN + 1 }, (_, i) => GRADE_MIN + i)

/** Các con (§6 phụ huynh, mục 5): một mục trong Cài đặt. */
export function ChildrenSection() {
  const queryClient = useQueryClient()
  const children = useQuery({ queryKey: childrenKey, queryFn: () => api<Profile[]>('/parent/children') })
  const [editing, setEditing] = useState<Profile | 'new' | null>(null)

  const archive = useMutation({
    mutationFn: (c: Profile) => api(`/parent/children/${c.id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: childrenKey }),
  })

  // Kéo thả: `order` là thứ tự tạm trong lúc kéo/lưu, null = theo server.
  const [order, setOrder] = useState<Profile[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const rows = useRef(new Map<string, HTMLLIElement>())
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api<Profile[]>('/parent/children/order', { method: 'PUT', body: { ids } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(childrenKey, saved)
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
    onSettled: () => setOrder(null),
  })
  const list = order ?? children.data ?? []
  const commit = (next: Profile[]) => {
    if (next.some((c, i) => c.id !== children.data?.[i]?.id)) {
      setOrder(next)
      reorder.mutate(next.map((c) => c.id))
    } else setOrder(null)
  }
  const moveTo = (from: Profile[], id: string, index: number) => {
    const rest = from.filter((c) => c.id !== id)
    return [...rest.slice(0, index), from.find((c) => c.id === id)!, ...rest.slice(index)]
  }
  const onDragMove = (clientY: number) => {
    if (!dragId) return
    // Vị trí mới = số bé khác có tâm nằm trên ngón tay/chuột.
    const index = list.filter((c) => {
      const r = c.id !== dragId && rows.current.get(c.id)?.getBoundingClientRect()
      return r && r.top + r.height / 2 < clientY
    }).length
    if (list[index]?.id !== dragId) setOrder(moveTo(list, dragId, index))
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Các con</h2>
        <button type="button" onClick={() => setEditing('new')} className="min-h-touch rounded-xl bg-slate-800 px-5 text-white">
          + Thêm con
        </button>
      </div>

      {children.isPending && <p className="mt-6 text-slate-500">Đang tải…</p>}
      {children.error && <p className="mt-6 text-red-600">{errorMessage(children.error)}</p>}
      {list.length > 1 && <p className="mt-2 text-sm text-slate-500">Kéo ⠿ để sắp thứ tự. Các con hiện theo thứ tự này ở màn chọn người học và mọi danh sách.</p>}
      {reorder.error && <p className="mt-2 text-red-600">{errorMessage(reorder.error)}</p>}
      <ul className="mt-4 flex flex-col gap-3">
        {list.map((c, i) => (
          <li
            key={c.id}
            ref={(el) => {
              if (el) rows.current.set(c.id, el)
              else rows.current.delete(c.id)
            }}
            className={`flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm transition-shadow ${dragId === c.id ? 'relative z-10 shadow-lg ring-2 ring-sky-400' : ''}`}
          >
            {list.length > 1 && (
              <button
                type="button"
                aria-label={`Kéo để đổi thứ tự của ${c.name} (hoặc dùng phím mũi tên lên/xuống)`}
                disabled={reorder.isPending}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  setDragId(c.id)
                }}
                onPointerMove={(e) => onDragMove(e.clientY)}
                onPointerUp={() => {
                  setDragId(null)
                  commit(list)
                }}
                onPointerCancel={() => {
                  setDragId(null)
                  setOrder(null)
                }}
                onKeyDown={(e) => {
                  const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null
                  if (to === null || to < 0 || to >= list.length) return
                  e.preventDefault()
                  commit(moveTo(list, c.id, to))
                }}
                className={`-my-2 -ml-2 flex min-h-touch w-10 touch-none items-center justify-center rounded-xl text-2xl text-slate-400 select-none disabled:opacity-40 ${dragId === c.id ? 'cursor-grabbing' : 'cursor-grab'}`}
              >
                ⠿
              </button>
            )}
            <span className="text-5xl">{c.avatar}</span>
            <div className="flex-1">
              <p className="text-xl font-semibold">{c.name}</p>
              <p className="text-slate-500">
                {gradeLabel(c.grade)} · {c.hasPin ? '🔒 Có mã PIN' : 'Không cần mã PIN'}
              </p>
            </div>
            <button type="button" onClick={() => setEditing(c)} className="min-h-touch rounded-xl bg-slate-100 px-4">
              ✏️ Sửa
            </button>
            <button
              type="button"
              onClick={() => confirm(`Ẩn ${c.name} khỏi màn chọn người học? Kết quả học vẫn được giữ.`) && archive.mutate(c)}
              className="min-h-touch rounded-xl px-4 text-red-600"
            >
              Ẩn
            </button>
          </li>
        ))}
      </ul>
      {children.data?.length === 0 && <p className="mt-6 text-slate-500">Chưa có con nào. Bấm "+ Thêm con" để bắt đầu nhé.</p>}

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <ChildForm
            initial={editing === 'new' ? null : editing}
            onDone={() => {
              setEditing(null)
              queryClient.invalidateQueries({ queryKey: childrenKey })
            }}
          />
        </Modal>
      )}
    </section>
  )
}

function ChildForm({ initial, onDone }: { initial: Profile | null; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [avatar, setAvatar] = useState<ChildInput['avatar']>((initial?.avatar as ChildInput['avatar']) ?? AVATARS[0])
  const [grade, setGrade] = useState(initial?.grade ?? 1)
  const [pin, setPin] = useState('')
  const [removePin, setRemovePin] = useState(false)

  const save = useMutation({
    mutationFn: () => {
      const body: ChildInput = {
        name,
        avatar,
        grade,
        pin: removePin ? null : pin ? pin : initial ? undefined : null,
      }
      return initial
        ? api(`/parent/children/${initial.id}`, { method: 'PUT', body })
        : api('/parent/children', { method: 'POST', body })
    },
    onSuccess: onDone,
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }

  return (
    <form onSubmit={submit} className="flex w-[min(28rem,80vw)] flex-col gap-4">
      <h2 className="text-xl font-bold">{initial ? `Sửa thông tin của ${initial.name}` : 'Thêm con'}</h2>
      <label className="flex flex-col gap-1">
        Tên gọi ở nhà
        <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className="min-h-touch rounded-xl border border-slate-300 px-4" />
      </label>
      <fieldset>
        <legend className="mb-1">Chọn con vật yêu thích</legend>
        <div className="grid grid-cols-8 gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              className={`size-12 rounded-xl text-3xl ${a === avatar ? 'bg-amber-200 ring-2 ring-amber-500' : 'bg-slate-100'}`}
              aria-pressed={a === avatar}
            >
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        Lớp
        <select value={grade} onChange={(e) => setGrade(Number(e.target.value))} className="min-h-touch rounded-xl border border-slate-300 px-4">
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {gradeLabel(g)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Mã PIN 4 số để vào học {initial?.hasPin ? '(để trống nếu giữ mã cũ)' : '(không bắt buộc)'}
        <input
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          value={pin}
          disabled={removePin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          className="min-h-touch rounded-xl border border-slate-300 px-4 tracking-[0.5em] disabled:opacity-50"
        />
      </label>
      {initial?.hasPin && (
        <label className="flex min-h-touch items-center gap-2">
          <input type="checkbox" checked={removePin} onChange={(e) => setRemovePin(e.target.checked)} className="size-5" />
          Bỏ mã PIN
        </label>
      )}
      {save.error && (
        <p className="text-red-600" role="alert">
          {errorMessage(save.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="submit" disabled={save.isPending} className="min-h-touch rounded-xl bg-slate-800 px-6 text-white disabled:opacity-50">
          Lưu lại
        </button>
      </div>
    </form>
  )
}
