import { useState } from 'react'

type Props = {
  title: string
  subtitle?: string
  error?: string | null
  /** Gửi PIN; nếu Promise bị từ chối thì xoá các số đã nhập để nhập lại. */
  onSubmit: (pin: string) => Promise<unknown>
  onCancel?: () => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const

/** Bàn phím PIN 4 số, tự gửi khi đủ 4 số. */
export function PinPad({ title, subtitle, error, onSubmit, onCancel }: Props) {
  const [pin, setPin] = useState('')
  const [pending, setPending] = useState(false)
  const [failures, setFailures] = useState(0)

  const press = (k: string) => {
    if (pending) return
    if (k === '⌫') return setPin((p) => p.slice(0, -1))
    if (!k || pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      setPending(true)
      onSubmit(next)
        .catch(() => {
          setPin('')
          setFailures((n) => n + 1)
        })
        .finally(() => setPending(false))
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">{title}</h2>
        {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
      </div>
      <div key={failures} className={`flex gap-4 ${failures ? 'animate-shake' : ''}`} aria-label={`Đã nhập ${pin.length} trên 4 số`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`size-5 rounded-full border-2 border-slate-700 ${i < pin.length ? 'bg-slate-700' : ''}`} />
        ))}
      </div>
      <p className="min-h-6 text-center text-red-600" role="alert">
        {error}
      </p>
      <div className="grid grid-cols-3 gap-4">
        {KEYS.map((k, i) =>
          k ? (
            <button
              key={i}
              type="button"
              onClick={() => press(k)}
              disabled={pending}
              className="size-20 rounded-full bg-slate-100 text-3xl font-semibold active:bg-slate-300 disabled:opacity-50"
              aria-label={k === '⌫' ? 'Xoá' : k}
            >
              {k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} className="min-h-touch px-6 text-slate-500 underline">
          Huỷ
        </button>
      )}
    </div>
  )
}
