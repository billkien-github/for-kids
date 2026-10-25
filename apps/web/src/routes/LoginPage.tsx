import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage, meQueryKey, post } from '../api'

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () => post('/auth/login', { email, password }),
    onSuccess: async () => {
      // reset (không phải invalidate): query 'me' đang không có ai dùng nên invalidate sẽ không tải lại,
      // RequireAuth sẽ thấy lỗi 401 cũ và đá về /login lần nữa.
      await queryClient.resetQueries({ queryKey: meQueryKey })
      navigate('/', { replace: true })
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate()
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-amber-50 p-6">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-white p-8 shadow">
        <h1 className="text-center text-2xl font-bold">Chào bố mẹ 👋</h1>
        <p className="-mt-2 text-center text-sm text-slate-500">Đăng nhập một lần, iPad sẽ nhớ trong 90 ngày.</p>
        <label className="flex flex-col gap-1">
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-touch rounded-xl border border-slate-300 px-4"
          />
        </label>
        <label className="flex flex-col gap-1">
          Mật khẩu
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-touch rounded-xl border border-slate-300 px-4"
          />
        </label>
        {login.error && (
          <p className="text-red-600" role="alert">
            {errorMessage(login.error)}
          </p>
        )}
        <button disabled={login.isPending} className="min-h-touch rounded-xl bg-slate-800 font-semibold text-white disabled:opacity-50">
          {login.isPending ? 'Đang vào…' : 'Vào app'}
        </button>
      </form>
    </main>
  )
}
