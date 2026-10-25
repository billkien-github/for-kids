import type { FamilySettings, McpAuditEntry } from '@for-kids/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, errorMessage } from '../../api'
import { preferredVoice, setPreferredVoice, speak, voicesFor } from '../../lib/speak'

const inputClass = 'min-h-touch rounded-xl border border-slate-300 px-3'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/** Gửi một form PUT, hiện lỗi / "Đã lưu". */
function useSave<T>(path: string, onSaved?: () => void) {
  const [saved, setSaved] = useState(false)
  const m = useMutation({
    mutationFn: (body: T) => api(path, { method: 'PUT', body }),
    onMutate: () => setSaved(false),
    onSuccess: () => {
      setSaved(true)
      onSaved?.()
    },
  })
  const status = (
    <>
      {m.error && <p className="text-red-600">{errorMessage(m.error)}</p>}
      {saved && <p className="text-emerald-700">Đã lưu.</p>}
    </>
  )
  return { save: m.mutate, pending: m.isPending, status }
}

export function StarThresholdsSection() {
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: ['parent', 'settings'], queryFn: () => api<FamilySettings>('/parent/settings') })
  const [t, setT] = useState<[number, number, number] | null>(null)
  const value = t ?? settings.data?.starThresholds ?? [50, 75, 90]
  const { save, pending, status } = useSave<{ thresholds: [number, number, number] }>('/parent/settings/star-thresholds', () =>
    queryClient.invalidateQueries({ queryKey: ['parent', 'settings'] }),
  )
  const submit = (e: FormEvent) => {
    e.preventDefault()
    save({ thresholds: value })
  }
  return (
    <Section title="Cách tính sao">
      <p className="mt-1 text-sm text-slate-500">Con làm đúng bao nhiêu % thì được 1, 2, 3 sao. Áp dụng cho các bài nộp từ giờ.</p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
        {[0, 1, 2].map((i) => (
          <label key={i} className="flex flex-col text-sm">
            {'⭐'.repeat(i + 1)}
            <input
              type="number"
              min={1}
              max={100}
              value={value[i]}
              onChange={(e) => {
                const next = [...value] as [number, number, number]
                next[i] = Number(e.target.value)
                setT(next)
              }}
              className={`${inputClass} w-24`}
            />
          </label>
        ))}
        <button disabled={pending} className="min-h-touch rounded-xl bg-slate-800 px-5 text-white">
          Lưu lại
        </button>
      </form>
      {status}
    </Section>
  )
}

export function PinSection() {
  const [currentPin, setCurrent] = useState('')
  const [newPin, setNew] = useState('')
  const { save, pending, status } = useSave<{ currentPin: string; newPin: string }>('/parent/settings/pin', () => {
    setCurrent('')
    setNew('')
  })
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4)
  return (
    <Section title="Mã PIN của bố mẹ">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save({ currentPin, newPin })
        }}
        className="mt-3 flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col text-sm">
          Mã PIN đang dùng
          <input type="password" inputMode="numeric" value={currentPin} onChange={(e) => setCurrent(digits(e.target.value))} className={`${inputClass} w-32`} />
        </label>
        <label className="flex flex-col text-sm">
          Mã PIN mới (4 số)
          <input type="password" inputMode="numeric" value={newPin} onChange={(e) => setNew(digits(e.target.value))} className={`${inputClass} w-32`} />
        </label>
        <button disabled={pending || currentPin.length !== 4 || newPin.length !== 4} className="min-h-touch rounded-xl bg-slate-800 px-5 text-white disabled:opacity-50">
          Đổi mã PIN
        </button>
      </form>
      {status}
    </Section>
  )
}

export function PasswordSection() {
  const [currentPassword, setCurrent] = useState('')
  const [newPassword, setNew] = useState('')
  const { save, pending, status } = useSave<{ currentPassword: string; newPassword: string }>('/parent/settings/password', () => {
    setCurrent('')
    setNew('')
  })
  return (
    <Section title="Mật khẩu đăng nhập">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save({ currentPassword, newPassword })
        }}
        className="mt-3 flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col text-sm">
          Mật khẩu đang dùng
          <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col text-sm">
          Mật khẩu mới (≥ 8 ký tự)
          <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} className={inputClass} />
        </label>
        <button disabled={pending || !currentPassword || newPassword.length < 8} className="min-h-touch rounded-xl bg-slate-800 px-5 text-white disabled:opacity-50">
          Đổi mật khẩu
        </button>
      </form>
      {status}
    </Section>
  )
}

const VOICE_LANGS = [
  { lang: 'vi-VN', label: 'Tiếng Việt', sample: 'Ba cộng năm bằng mấy?' },
  { lang: 'en-US', label: 'Tiếng Anh', sample: 'What time is it?' },
]

/** §9: chọn giọng đọc cho từng ngôn ngữ, lưu riêng trên thiết bị này. */
export function VoiceSection() {
  const [, setTick] = useState(0)
  // Danh sách giọng có thể nạp muộn.
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const refresh = () => setTick((n) => n + 1)
    speechSynthesis.addEventListener('voiceschanged', refresh)
    return () => speechSynthesis.removeEventListener('voiceschanged', refresh)
  }, [])

  return (
    <Section title="Giọng đọc đề (riêng máy này)">
      <p className="mt-1 text-sm text-slate-500">
        Chọn giọng đọc to đề bài cho con. Trên iPad có thể tải thêm giọng hay hơn ở Cài đặt → Trợ năng → Nội dung được đọc → Giọng nói.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {VOICE_LANGS.map(({ lang, label, sample }) => {
          const voices = voicesFor(lang)
          return (
            <div key={lang} className="flex flex-wrap items-center gap-2">
              <span className="w-24">{label}</span>
              {voices.length === 0 ? (
                <span className="text-sm text-red-600">Thiết bị này chưa có giọng {label}.</span>
              ) : (
                <select
                  defaultValue={preferredVoice(lang) ?? ''}
                  onChange={(e) => setPreferredVoice(lang, e.target.value || null)}
                  className={`${inputClass} min-w-56`}
                >
                  <option value="">Để app tự chọn</option>
                  {voices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              )}
              <button type="button" onClick={() => speak(sample, lang)} className="min-h-touch rounded-xl bg-sky-100 px-4">
                🔊 Nghe thử
              </button>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

export function McpAuditSection() {
  const [open, setOpen] = useState(false)
  const audit = useQuery({ queryKey: ['parent', 'mcp-audit'], queryFn: () => api<McpAuditEntry[]>('/parent/mcp-audit'), enabled: open })
  return (
    <Section title="Trợ lý AI đã làm gì">
      <button type="button" onClick={() => setOpen(!open)} className="mt-2 min-h-touch rounded-xl bg-slate-100 px-4 text-sm">
        {open ? 'Ẩn đi' : 'Xem 200 việc gần nhất'}
      </button>
      {open && (
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1">Thời gian</th>
              <th>Trợ lý</th>
              <th>Việc</th>
              <th>Tham số</th>
              <th>Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {audit.data?.map((a) => (
              <tr key={a.id} className="border-t border-slate-100 align-top">
                <td className="py-1 whitespace-nowrap">{new Date(a.createdAt).toLocaleString('vi-VN')}</td>
                <td>{a.tokenName}</td>
                <td className="font-mono">{a.tool}</td>
                <td className="max-w-xs truncate font-mono text-xs text-slate-500" title={JSON.stringify(a.argsSummary)}>
                  {JSON.stringify(a.argsSummary)}
                </td>
                <td>{a.ok ? '✅' : '❌'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}
