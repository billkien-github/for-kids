import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../api'

// Khung tạm: màn chọn profile thật (đăng nhập, lưới avatar, PIN) làm ở bước sau.
export function ProfilesPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ ok: boolean }>('/health') })

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-8 p-6 text-kid">
      <h1 className="text-4xl font-bold">Ai đang học nào? 👋</h1>
      <p className="text-slate-500">
        Máy chủ:{' '}
        {health.isPending ? 'đang kiểm tra…' : health.data?.ok ? '✅ đang chạy' : '⚠️ không kết nối được'}
      </p>
      <Link to="/parent" className="min-h-touch rounded-xl bg-slate-800 px-6 py-3 text-white">
        Khu phụ huynh
      </Link>
    </main>
  )
}
