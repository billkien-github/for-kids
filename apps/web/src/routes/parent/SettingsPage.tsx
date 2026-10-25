import type { TokenInfo } from '@for-kids/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api, errorMessage, post } from '../../api'
import { McpAuditSection, PasswordSection, PinSection, StarThresholdsSection, VoiceSection } from './SettingsSections'

const SCOPE_LABEL: Record<string, string> = {
  'content:write': 'tạo/sửa bài',
  publish: 'xuất bản',
  assign: 'giao bài',
  'results:read': 'đọc kết quả',
}
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : 'chưa dùng')

/** Cài đặt (§6 phụ huynh, mục 6): token MCP, ngưỡng sao, giọng đọc, PIN, mật khẩu, nhật ký MCP. */
export function SettingsPage() {
  const queryClient = useQueryClient()
  const tokens = useQuery({ queryKey: ['parent', 'tokens'], queryFn: () => api<TokenInfo[]>('/parent/tokens') })
  const [name, setName] = useState('Claude')
  const [created, setCreated] = useState<string | null>(null)
  const mcpUrl = `${window.location.origin}/mcp`
  // Bản sao của /mcp cho máy có phần mềm diệt virus chặn URL chứa "mcp" (vd. Avast).
  const agentUrl = `${window.location.origin}/agent`

  const create = useMutation({
    mutationFn: () => post<{ token: string }>('/parent/tokens', { name }),
    onSuccess: (r) => {
      setCreated(r.token)
      void queryClient.invalidateQueries({ queryKey: ['parent', 'tokens'] })
    },
  })
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/parent/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['parent', 'tokens'] }),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate()
  }

  const claudeCommand = created ? `claude mcp add --scope user --transport http for-kids ${agentUrl} --header "Authorization: Bearer ${created}"` : ''

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">Cài đặt</h1>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Token cho agent (MCP)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Agent (vd. Claude) dùng token để tạo bài, xuất bản, giao bài qua địa chỉ <code className="rounded bg-slate-100 px-1">{mcpUrl}</code>, hoặc bản sao{' '}
          <code className="rounded bg-slate-100 px-1">{agentUrl}</code> nếu máy chạy agent có phần mềm diệt virus chặn URL chứa "mcp" (vd. Avast).
        </p>

        <form onSubmit={submit} className="mt-4 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Tên token" className="min-h-touch flex-1 rounded-xl border border-slate-300 px-3" />
          <button disabled={create.isPending} className="min-h-touch rounded-xl bg-slate-800 px-5 text-white">
            Tạo token
          </button>
        </form>
        {create.error && <p className="mt-2 text-red-600">{errorMessage(create.error)}</p>}

        {created && (
          <div className="mt-4 rounded-xl bg-amber-50 p-4">
            <p className="font-semibold text-amber-800">Chép token ngay: token chỉ hiện một lần.</p>
            <code className="mt-2 block break-all rounded bg-white p-2 text-sm">{created}</code>
            <p className="mt-3 text-sm">Thêm vào Claude Code:</p>
            <code className="mt-1 block break-all rounded bg-white p-2 text-xs">{claudeCommand}</code>
            <button type="button" onClick={() => navigator.clipboard?.writeText(claudeCommand)} className="mt-2 min-h-touch rounded-xl bg-white px-4 text-sm shadow-sm">
              Chép lệnh
            </button>
          </div>
        )}

        <ul className="mt-4 flex flex-col gap-2">
          {tokens.data?.map((t) => (
            <li key={t.id} className={`flex items-center gap-3 rounded-xl bg-slate-50 p-3 ${t.revokedAt ? 'opacity-50' : ''}`}>
              <div className="flex-1">
                <p className="font-semibold">{t.name}</p>
                <p className="text-sm text-slate-500">
                  {t.scopes.map((s) => SCOPE_LABEL[s] ?? s).join(', ')} · dùng lần cuối: {fmt(t.lastUsedAt)}
                </p>
              </div>
              {t.revokedAt ? (
                <span className="text-sm">Đã thu hồi</span>
              ) : (
                <button type="button" onClick={() => confirm(`Thu hồi token "${t.name}"?`) && revoke.mutate(t.id)} className="min-h-touch px-3 text-sm text-red-600">
                  Thu hồi
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <StarThresholdsSection />
      <VoiceSection />
      <PinSection />
      <PasswordSection />
      <McpAuditSection />
    </main>
  )
}
