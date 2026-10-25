import type { Profile } from '@for-kids/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api, errorMessage, post } from '../api'
import { Modal } from '../components/Modal'
import { PinPad } from '../components/PinPad'
import { usePinSubmit } from '../usePinSubmit'

type Dialog = { kind: 'child'; child: Profile } | { kind: 'parent' } | null

/**
 * Màn chọn profile kiểu Netflix (§6 bé, mục 1). Bé cũng dùng màn này nên không có nút đăng xuất;
 * đăng xuất nằm trong khu phụ huynh.
 */
export function ProfilesPage() {
  const navigate = useNavigate()
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: () => api<Profile[]>('/profiles') })
  const [dialog, setDialog] = useState<Dialog>(null)

  const select = usePinSubmit(
    (child: Profile, pin?: string) => post(`/profiles/${child.id}/select`, pin ? { pin } : {}),
    () => navigate('/kid'),
  )
  const unlock = usePinSubmit((pin: string) => post('/parent/unlock', { pin }), () => navigate('/parent'))

  const open = (d: Dialog) => {
    select.clearError()
    unlock.clearError()
    setDialog(d)
  }

  return (
    <main className="flex min-h-dvh flex-col items-center gap-10 bg-amber-50 p-6 pt-16 text-kid">
      <h1 className="text-4xl font-bold">Ai đang học nào? 👋</h1>

      {profiles.isPending ? (
        <p className="text-slate-500">Đang tải…</p>
      ) : profiles.error ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-red-600">Không tải được danh sách: {errorMessage(profiles.error)}</p>
          <button type="button" onClick={() => profiles.refetch()} className="min-h-touch rounded-xl bg-white px-6 shadow">
            Thử lại
          </button>
        </div>
      ) : profiles.data.length === 0 ? (
        <p className="max-w-md text-center text-slate-600">
          Chưa có bé nào. Vào <b>Khu phụ huynh</b> → <b>Hồ sơ các bé</b> để thêm.
        </p>
      ) : (
        <ul className="flex flex-wrap justify-center gap-8">
          {profiles.data.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => (p.hasPin ? open({ kind: 'child', child: p }) : select.submit(p).catch(() => {}))}
                className="flex w-40 flex-col items-center gap-3 rounded-3xl bg-white p-6 shadow active:scale-95"
              >
                <span className="text-7xl">{p.avatar}</span>
                <span className="text-2xl font-semibold">{p.name}</span>
                {p.hasPin && <span className="text-sm text-slate-400">🔒</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!dialog && select.error && <p className="text-red-600">{select.error}</p>}

      <button type="button" onClick={() => open({ kind: 'parent' })} className="mt-auto min-h-touch rounded-xl bg-slate-800 px-6 text-base text-white">
        Khu phụ huynh
      </button>

      {dialog && (
        <Modal onClose={() => setDialog(null)}>
          {dialog.kind === 'child' ? (
            <PinPad
              title={`${dialog.child.avatar} ${dialog.child.name}`}
              subtitle="Nhập mã PIN của con"
              error={select.error}
              onSubmit={(pin) => select.submit(dialog.child, pin)}
              onCancel={() => setDialog(null)}
            />
          ) : (
            <PinPad
              title="Khu phụ huynh"
              subtitle="Nhập PIN phụ huynh"
              error={unlock.error}
              onSubmit={unlock.submit}
              onCancel={() => setDialog(null)}
            />
          )}
        </Modal>
      )}
    </main>
  )
}
