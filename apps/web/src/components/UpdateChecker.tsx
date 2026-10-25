import { useEffect, useState } from 'react'

const CHECK_EVERY_MS = 5 * 60 * 1000

async function latestVersion(): Promise<string | null> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return null // khi dev không có file này
    return ((await res.json()) as { version?: string }).version ?? null
  } catch {
    return null
  }
}

/** Đang làm bài thì không tự tải lại, để không cắt ngang bé. */
const busy = () => window.location.pathname.startsWith('/kid/attempt/')

/**
 * Tự cập nhật khi có bản mới. Web app mở từ màn hình chính của iPad thường chỉ được khôi phục
 * (không tải lại trang) và không có nút tải lại, nên app tự hỏi server mỗi khi được mở lại
 * và định kỳ khi đang mở.
 */
export function UpdateChecker() {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    let checking = false
    const check = async () => {
      if (checking || document.visibilityState !== 'visible') return
      checking = true
      const v = await latestVersion()
      checking = false
      if (!v || v === __APP_VERSION__) return
      if (busy()) setAvailable(true)
      else window.location.reload()
    }

    void check()
    const onVisible = () => void check()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    window.addEventListener('focus', onVisible)
    const timer = setInterval(onVisible, CHECK_EVERY_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.removeEventListener('focus', onVisible)
      clearInterval(timer)
    }
  }, [])

  if (!available) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-3 bg-slate-900/95 p-3 text-white">
      <span>Có bản mới của app.</span>
      <button type="button" onClick={() => window.location.reload()} className="min-h-touch rounded-xl bg-white px-4 font-semibold text-slate-900">
        Tải lại
      </button>
      <button type="button" onClick={() => setAvailable(false)} className="min-h-touch px-3 text-white/70">
        Để sau
      </button>
    </div>
  )
}
