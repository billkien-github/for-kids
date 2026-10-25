import { Navigate, Outlet } from 'react-router'
import { ApiError, useMe } from '../api'

/** Chưa đăng nhập thì chuyển sang /login. */
export function RequireAuth() {
  const me = useMe()
  if (me.isPending) return <p className="p-8 text-center text-slate-500">Đang tải…</p>
  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/login" replace />
  if (me.error) return <p className="p-8 text-center text-red-600">Không kết nối được máy chủ</p>
  return <Outlet />
}
