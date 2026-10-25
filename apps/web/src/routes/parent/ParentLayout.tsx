import type { ParentSummary } from '@for-kids/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { api, meQueryKey, post, useMe } from '../../api'
import { PinPad } from '../../components/PinPad'
import { BACK_TO_KIDS, PARENT_AREA } from '../../copy'
import { usePinSubmit } from '../../usePinSubmit'

type NavItem = {
  to: string
  icon: string
  label: string
  /** Số đếm trên menu: việc cần bố mẹ để ý (đỏ) hoặc chỉ để biết (xám). */
  badge?: (s: ParentSummary) => { n: number; alert: boolean }
}

const NAV: NavItem[] = [
  { to: '/parent/overview', icon: '🏠', label: 'Tổng quan' },
  { to: '/parent/worksheets', icon: '📚', label: 'Kho bài', badge: (s) => ({ n: s.draftWorksheets, alert: false }) },
  { to: '/parent/assignments', icon: '📌', label: 'Đã giao', badge: (s) => ({ n: s.overdueAssignments, alert: true }) },
  { to: '/parent/rewards', icon: '🎁', label: 'Quà', badge: (s) => ({ n: s.pendingRedemptions, alert: true }) },
  { to: '/parent/settings', icon: '⚙️', label: 'Cài đặt' },
]

function Badge({ n, alert }: { n: number; alert: boolean }) {
  if (n <= 0) return null
  return (
    <span className={`min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-bold ${alert ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-700'}`}>
      {n > 99 ? '99+' : n}
    </span>
  )
}

/**
 * Góc bố mẹ (§6). iPad ngang: menu cột bên trái; iPad dọc: thanh tab ở đáy (dễ bấm bằng ngón cái).
 * Hết hạn mở khoá thì hiện bàn phím PIN ngay tại chỗ.
 */
export function ParentLayout() {
  const me = useMe()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const unlock = usePinSubmit((pin: string) => post('/parent/unlock', { pin }), () => {})
  const unlocked = me.data?.parentUnlockedUntil != null

  const summary = useQuery({
    queryKey: ['parent', 'summary'],
    queryFn: () => api<ParentSummary>('/parent/summary'),
    enabled: unlocked,
    refetchInterval: 60_000,
  })
  // Chuyển trang thì cập nhật số đếm (vừa duyệt quà, vừa giao bài…).
  useEffect(() => {
    if (unlocked) void summary.refetch()
  }, [location.pathname, unlocked])

  const backToKids = async () => {
    await post('/parent/lock')
    await queryClient.invalidateQueries({ queryKey: meQueryKey })
    navigate('/')
  }

  if (!unlocked) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <PinPad title={`🔐 ${PARENT_AREA}`} subtitle="Nhập mã PIN của bố mẹ" error={unlock.error} onSubmit={unlock.submit} onCancel={() => navigate('/')} />
      </main>
    )
  }

  const badgeOf = (n: NavItem) => (n.badge && summary.data ? n.badge(summary.data) : null)
  const familyName = me.data?.family.name ?? ''

  return (
    <div className="min-h-dvh bg-slate-50 lg:flex">
      {/* iPad ngang / máy tính: menu cột trái */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-4 lg:flex">
        <p className="px-3 text-sm text-slate-400">{PARENT_AREA}</p>
        <p className="truncate px-3 pb-4 text-lg font-bold">{familyName}</p>
        {NAV.map((n) => {
          const b = badgeOf(n)
          return (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex min-h-touch items-center gap-3 rounded-xl px-3 font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
              }
            >
              <span className="text-xl">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {b && <Badge {...b} />}
            </NavLink>
          )
        })}
        <button type="button" onClick={backToKids} className="mt-auto flex min-h-touch items-center gap-3 rounded-xl bg-amber-100 px-3 font-semibold text-amber-900">
          <span className="text-xl">🧒</span> {BACK_TO_KIDS}
        </button>
      </aside>

      <div className="min-w-0 flex-1 pb-24 lg:pb-0">
        {/* iPad dọc: thanh trên gọn, có nút về với các con */}
        <header className="sticky top-0 z-20 flex items-center gap-2 bg-white/95 px-4 py-2 shadow-sm backdrop-blur lg:hidden">
          <span className="truncate font-semibold">
            {PARENT_AREA} · {familyName}
          </span>
          <button type="button" onClick={backToKids} className="ml-auto flex min-h-touch shrink-0 items-center gap-2 rounded-xl bg-amber-100 px-3 text-sm font-semibold text-amber-900">
            🧒 {BACK_TO_KIDS}
          </button>
        </header>
        <Outlet />
      </div>

      {/* iPad dọc: thanh tab ở đáy */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.map((n) => {
          const b = badgeOf(n)
          return (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => `relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'font-bold text-slate-900' : 'text-slate-500'}`}
            >
              {({ isActive }) => (
                <>
                  <span className={`rounded-full px-4 py-0.5 text-2xl ${isActive ? 'bg-slate-200' : ''}`}>{n.icon}</span>
                  {n.label}
                  {b && (
                    <span className="absolute top-1 left-1/2 ml-3">
                      <Badge {...b} />
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
