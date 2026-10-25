import { AVATARS, GRADE_MAX, GRADE_MIN, gradeLabel, type ChildInput, type Profile } from '@for-kids/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api, errorMessage } from '../../api'
import { Modal } from '../../components/Modal'

const childrenKey = ['parent', 'children'] as const
const GRADES = Array.from({ length: GRADE_MAX - GRADE_MIN + 1 }, (_, i) => GRADE_MIN + i)

/** Hồ sơ các bé (§6 phụ huynh, mục 5). */
export function ChildrenPage() {
  const queryClient = useQueryClient()
  const children = useQuery({ queryKey: childrenKey, queryFn: () => api<Profile[]>('/parent/children') })
  const [editing, setEditing] = useState<Profile | 'new' | null>(null)

  const archive = useMutation({
    mutationFn: (c: Profile) => api(`/parent/children/${c.id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: childrenKey }),
  })

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Hồ sơ các bé</h1>
        <button type="button" onClick={() => setEditing('new')} className="min-h-touch rounded-xl bg-slate-800 px-5 text-white">
          + Thêm bé
        </button>
      </div>

      {children.isPending && <p className="mt-6 text-slate-500">Đang tải…</p>}
      {children.error && <p className="mt-6 text-red-600">{errorMessage(children.error)}</p>}
      <ul className="mt-6 flex flex-col gap-3">
        {children.data?.map((c) => (
          <li key={c.id} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
            <span className="text-5xl">{c.avatar}</span>
            <div className="flex-1">
              <p className="text-xl font-semibold">{c.name}</p>
              <p className="text-slate-500">
                {gradeLabel(c.grade)} · {c.hasPin ? 'Có PIN' : 'Không PIN'}
              </p>
            </div>
            <button type="button" onClick={() => setEditing(c)} className="min-h-touch rounded-xl bg-slate-100 px-4">
              Sửa
            </button>
            <button
              type="button"
              onClick={() => confirm(`Lưu trữ hồ sơ của ${c.name}? Lịch sử làm bài vẫn được giữ.`) && archive.mutate(c)}
              className="min-h-touch rounded-xl px-4 text-red-600"
            >
              Lưu trữ
            </button>
          </li>
        ))}
      </ul>
      {children.data?.length === 0 && <p className="mt-6 text-slate-500">Chưa có bé nào.</p>}

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
    </main>
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
      <h2 className="text-xl font-bold">{initial ? `Sửa hồ sơ ${initial.name}` : 'Thêm bé'}</h2>
      <label className="flex flex-col gap-1">
        Tên
        <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className="min-h-touch rounded-xl border border-slate-300 px-4" />
      </label>
      <fieldset>
        <legend className="mb-1">Ảnh đại diện</legend>
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
        PIN 4 số {initial?.hasPin ? '(để trống để giữ PIN cũ)' : '(không bắt buộc)'}
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
          Bỏ PIN
        </label>
      )}
      {save.error && (
        <p className="text-red-600" role="alert">
          {errorMessage(save.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="submit" disabled={save.isPending} className="min-h-touch rounded-xl bg-slate-800 px-6 text-white disabled:opacity-50">
          Lưu
        </button>
      </div>
    </form>
  )
}
