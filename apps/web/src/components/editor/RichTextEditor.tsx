import type { RichText } from '@for-kids/shared'
import { useRef, useState } from 'react'
import { ApiError, errorMessage } from '../../api'
import { angleForTime, Clock } from '../Clock'

export async function uploadImage(file: File): Promise<string> {
  const res = await fetch('/api/parent/assets', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  })
  const body = await res.json()
  if (!res.ok) throw new ApiError(res.status, body)
  return (body as { assetId: string }).assetId
}

export const fieldClass = 'min-h-11 rounded-lg border border-slate-300 bg-white px-2'

type Props = {
  value: RichText
  onChange: (v: RichText) => void
  placeholder?: string
  /** Gọn: một dòng chữ, dùng cho phương án/ô nối. */
  compact?: boolean
  /** Ghi chú dưới ô chữ (vd. cách viết ô trống). */
  hint?: string
}

/** Soạn RichText (§4): chữ (có [[a/b]]), dòng dịch, ảnh, đồng hồ, câu đọc riêng. */
export function RichTextEditor({ value, onChange, placeholder, compact, hint }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(!!(value.sub || value.ttsText))
  // Giá trị mới nhất: tải ảnh xong (bất đồng bộ) không được ghi đè chữ vừa gõ trong lúc chờ.
  const latest = useRef(value)
  latest.current = value
  const set = (patch: Partial<RichText>) => {
    const next = { ...latest.current, ...patch }
    for (const k of Object.keys(next) as (keyof RichText)[]) if (next[k] === undefined || next[k] === '') delete next[k]
    onChange(next)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      set({ imageAssetId: await uploadImage(file) })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {compact ? (
        <input value={value.text ?? ''} onChange={(e) => set({ text: e.target.value })} placeholder={placeholder} className={fieldClass} />
      ) : (
        <textarea value={value.text ?? ''} onChange={(e) => set({ text: e.target.value })} placeholder={placeholder} rows={2} className={`${fieldClass} py-1`} />
      )}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex min-h-11 cursor-pointer items-center rounded-lg bg-slate-100 px-3">
          {uploading ? 'Đang tải…' : value.imageAssetId ? '🖼 Đổi ảnh' : '🖼 Thêm ảnh'}
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <button
          type="button"
          onClick={() => set({ clock: value.clock ? undefined : { h: 3, m: 0 } })}
          className={`min-h-11 rounded-lg px-3 ${value.clock ? 'bg-sky-100' : 'bg-slate-100'}`}
        >
          🕒 {value.clock ? 'Bỏ đồng hồ' : 'Đồng hồ'}
        </button>
        {!compact && (
          <button type="button" onClick={() => setMore(!more)} className="min-h-11 rounded-lg bg-slate-100 px-3">
            {more ? 'Ẩn bớt' : '+ Dòng dịch / câu đọc'}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {value.imageAssetId && (
        <div className="flex items-start gap-2">
          <img src={`/api/assets/${value.imageAssetId}`} alt="" className="max-h-32 rounded-lg border" />
          <button type="button" onClick={() => set({ imageAssetId: undefined })} className="text-sm text-red-600">
            Xoá ảnh
          </button>
        </div>
      )}

      {value.clock && (
        <div className="flex items-center gap-3 text-sm">
          <Clock hourAngle={angleForTime(value.clock.h, value.clock.m)} minute={value.clock.m} size={80} />
          <label className="flex items-center gap-1">
            Giờ
            <input
              type="number"
              min={1}
              max={12}
              value={value.clock.h}
              onChange={(e) => set({ clock: { ...value.clock!, h: Number(e.target.value) } })}
              className={`${fieldClass} w-16`}
            />
          </label>
          <label className="flex items-center gap-1">
            Phút
            <input
              type="number"
              min={0}
              max={59}
              step={5}
              value={value.clock.m}
              onChange={(e) => set({ clock: { ...value.clock!, m: Number(e.target.value) } })}
              className={`${fieldClass} w-16`}
            />
          </label>
        </div>
      )}

      {more && !compact && (
        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-[1fr_auto]">
          <input
            value={value.sub?.text ?? ''}
            onChange={(e) => set({ sub: e.target.value ? { text: e.target.value, lang: value.sub?.lang ?? 'vi-VN' } : undefined })}
            placeholder="Dòng dịch (đề song ngữ)"
            className={fieldClass}
          />
          <select
            value={value.sub?.lang ?? 'vi-VN'}
            onChange={(e) => value.sub && set({ sub: { ...value.sub, lang: e.target.value } })}
            className={fieldClass}
          >
            <option value="vi-VN">vi-VN</option>
            <option value="en-US">en-US</option>
          </select>
          <input
            value={value.ttsText ?? ''}
            onChange={(e) => set({ ttsText: e.target.value })}
            placeholder="Câu đọc to (nếu khác chữ hiển thị), vd. ba cộng năm bằng mấy"
            className={`${fieldClass} sm:col-span-2`}
          />
        </div>
      )}
    </div>
  )
}
