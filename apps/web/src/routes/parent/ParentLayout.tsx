import { useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { meQueryKey, post, useMe } from '../../api'
import { PinPad } from '../../components/PinPad'
import { usePinSubmit } from '../../usePinSubmit'

const NAV = [{ to: '/parent/children', label: 'Hồ sơ các bé' }] as const

/** Khu phụ huynh (§6): hết hạn mở khoá thì hiện bàn phím PIN ngay tại chỗ. */
export function ParentLayout() {
  const me = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const unlock = usePinSubmit((pin: string) => post('/parent/unlock', { pin }), () => {})

  const lock = async () => {
    await post('/parent/lock')
    await queryClient.invalidateQueries({ queryKey: meQueryKey })
    navigate('/')
  }

  const logout = async () => {
    if (!confirm('Đăng xuất khỏi máy này? Lần sau phải nhập lại email và mật khẩu.')) return
    await post('/auth/logout')
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  if (me.data?.parentUnlockedUntil == null) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <PinPad title="Khu phụ huynh" subtitle="Nhập PIN phụ huynh" error={unlock.error} onSubmit={unlock.submit} onCancel={() => navigate('/')} />
      </main>
    )
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="flex flex-wrap items-center gap-2 bg-slate-800 px-4 py-3 text-white">
        <span className="mr-4 font-bold">Khu phụ huynh · {me.data.family.name}</span>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) => `flex min-h-touch items-center rounded-lg px-4 ${isActive ? 'bg-white/20' : ''}`}
          >
            {n.label}
          </NavLink>
        ))}
        <button type="button" onClick={lock} className="ml-auto min-h-touch rounded-lg bg-white/10 px-4">
          🔒 Khoá
        </button>
        <button type="button" onClick={logout} className="min-h-touch rounded-lg px-4 text-white/70" title={me.data.parent.email}>
          Đăng xuất
        </button>
      </header>
      <Outlet />
    </div>
  )
}
