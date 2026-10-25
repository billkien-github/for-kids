import type { TokenInfo } from '@for-kids/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router'
import { api, errorMessage, post } from '../../api'
import { ChildrenSection } from './ChildrenPage'
import { McpAuditSection, PasswordSection, PinSection, Section, StarThresholdsSection, VoiceSection } from './SettingsSections'

const SECTIONS = [
  { key: 'children', icon: '👧', label: 'Các con' },
  { key: 'ai', icon: '🤖', label: 'Trợ lý AI' },
  { key: 'learning', icon: '⭐', label: 'Học tập' },
  { key: 'account', icon: '🔐', label: 'Tài khoản' },
] as const
type SectionKey = (typeof SECTIONS)[number]['key']

/** Cài đặt (§6 phụ huynh, mục 5–6), chia thành các mục nhỏ. */
export function SettingsPage() {
  const { section } = useParams()
  const current: SectionKey = SECTIONS.some((s) => s.key === section) ? (section as SectionKey) : 'children'

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">Cài đặt</h1>
      <nav className="mt-4 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.key}
            to={`/parent/settings/${s.key}`}
            className={() => `flex min-h-touch items-center gap-2 rounded-xl px-4 ${current === s.key ? 'bg-slate-900 text-white' : 'bg-white shadow-sm'}`}
          >
            {s.icon} {s.label}
          </NavLink>
        ))}
      </nav>

      {current === 'children' && <ChildrenSection />}
      {current === 'ai' && (
        <>
          <AiConnectSection />
          <McpAuditSection />
        </>
      )}
      {current === 'learning' && (
        <>
          <StarThresholdsSection />
          <VoiceSection />
        </>
      )}
      {current === 'account' && (
        <>
          <PinSection />
          <PasswordSection />
          <LogoutSection />
        </>
      )}
    </main>
  )
}

const SCOPE_LABEL: Record<string, string> = {
  'content:write': 'soạn bài',
  publish: 'mở bài cho con',
  assign: 'giao bài',
  'results:read': 'xem kết quả',
}
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : 'chưa dùng')

/** Mã kết nối cho trợ lý AI (token MCP, §8). */
function AiConnectSection() {
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
    <Section title="Kết nối trợ lý AI">
      <p className="mt-1 text-sm text-slate-500">
        Trợ lý AI (vd. Claude) có thể soạn bài từ file PDF/ảnh, mở bài và giao cho con. Mỗi trợ lý cần một <b>mã kết nối</b> riêng.
      </p>
      <details className="mt-1 text-sm text-slate-500">
        <summary className="cursor-pointer">Thông tin kỹ thuật</summary>
        Địa chỉ MCP: <code className="rounded bg-slate-100 px-1">{mcpUrl}</code>, hoặc bản sao <code className="rounded bg-slate-100 px-1">{agentUrl}</code> nếu máy chạy trợ lý có phần mềm
        diệt virus chặn địa chỉ chứa "mcp" (vd. Avast).
      </details>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Đặt tên, vd. Claude trên laptop" className="min-h-touch flex-1 rounded-xl border border-slate-300 px-3" />
        <button disabled={create.isPending} className="min-h-touch rounded-xl bg-slate-800 px-5 text-white">
          ✨ Tạo mã kết nối
        </button>
      </form>
      {create.error && <p className="mt-2 text-red-600">{errorMessage(create.error)}</p>}

      {created && (
        <div className="mt-4 rounded-xl bg-amber-50 p-4">
          <p className="font-semibold text-amber-800">Chép mã ngay nhé, mã chỉ hiện một lần thôi.</p>
          <code className="mt-2 block rounded bg-white p-2 text-sm break-all">{created}</code>
          <p className="mt-3 text-sm">Lệnh thêm vào Claude Code:</p>
          <code className="mt-1 block rounded bg-white p-2 text-xs break-all">{claudeCommand}</code>
          <button type="button" onClick={() => navigator.clipboard?.writeText(claudeCommand)} className="mt-2 min-h-touch rounded-xl bg-white px-4 text-sm shadow-sm">
            📋 Chép lệnh
          </button>
        </div>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {tokens.data?.map((t) => (
          <li key={t.id} className={`flex items-center gap-3 rounded-xl bg-slate-50 p-3 ${t.revokedAt ? 'opacity-50' : ''}`}>
            <div className="flex-1">
              <p className="font-semibold">{t.name}</p>
              <p className="text-sm text-slate-500">
                Được phép: {t.scopes.map((s) => SCOPE_LABEL[s] ?? s).join(', ')} · dùng lần cuối: {fmt(t.lastUsedAt)}
              </p>
            </div>
            {t.revokedAt ? (
              <span className="text-sm">Đã ngắt</span>
            ) : (
              <button type="button" onClick={() => confirm(`Ngắt kết nối "${t.name}"? Trợ lý này sẽ không dùng được app nữa.`) && revoke.mutate(t.id)} className="min-h-touch px-3 text-sm text-red-600">
                Ngắt kết nối
              </button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function LogoutSection() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const logout = async () => {
    if (!confirm('Đăng xuất khỏi máy này? Lần sau cần nhập lại email và mật khẩu.')) return
    await post('/auth/logout')
    queryClient.clear()
    navigate('/login', { replace: true })
  }
  return (
    <Section title="Đăng xuất">
      <p className="mt-1 text-sm text-slate-500">Chỉ cần khi không dùng app trên máy này nữa. Để các con dùng tiếp, bấm "Về với các con" là đủ.</p>
      <button type="button" onClick={logout} className="mt-3 min-h-touch rounded-xl px-4 text-red-600 ring-1 ring-red-200">
        Đăng xuất khỏi máy này
      </button>
    </Section>
  )
}
