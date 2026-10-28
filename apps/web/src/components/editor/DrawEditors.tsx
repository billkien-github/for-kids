import type { Point, QuestionBody } from '@for-kids/shared'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { errorMessage } from '../../api'
import { DrawPad, ImageCanvas, polyline, toImage } from '../questions/DrawQuestions'
import { fieldClass, RichTextEditor, uploadImage } from './RichTextEditor'

type EditorProps<T extends QuestionBody['type']> = { body: Extract<QuestionBody, { type: T }>; onChange: (b: QuestionBody) => void }

async function naturalSize(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { width: img.naturalWidth, height: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Tải ảnh nền; toạ độ trong câu tính theo kích thước thật của ảnh này. */
function ImagePicker({ has, onPick }: { has: boolean; onPick: (v: { image: string; width: number; height: number }) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const [size, image] = await Promise.all([naturalSize(file), uploadImage(file)])
      onPick({ image, ...size })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex min-h-11 cursor-pointer items-center rounded-lg bg-slate-100 px-3">
        {busy ? 'Đang tải…' : has ? '🖼 Đổi ảnh' : '🖼 Chọn ảnh'}
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  )
}

/** Bỏ bớt điểm sát nhau của nét vẽ tay. */
function simplify(line: Point[], step: number): Point[] {
  const out: Point[] = []
  for (const p of line) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= step) out.push([Math.round(p[0]), Math.round(p[1])])
  }
  // Luôn giữ điểm cuối thật của nét (kể cả nét ngắn hơn một bước), để đường không bị rút còn một điểm.
  const end = line[line.length - 1]
  if (end) {
    const e: Point = [Math.round(end[0]), Math.round(end[1])]
    const first = out[0]!
    if (out.length > 1) out[out.length - 1] = e
    else if (e[0] !== first[0] || e[1] !== first[1]) out.push(e)
  }
  return out
}

function ToleranceInput({ value, onChange, hint }: { value: number; onChange: (v: number) => void; hint: string }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-500">Sai lệch cho phép (px)</span>
      <input type="number" min={1} value={value} onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))} className={`${fieldClass} w-20`} />
      <span className="text-xs text-slate-400">{hint}</span>
    </label>
  )
}

export function HotspotEditor({ body, onChange }: EditorProps<'hotspot'>) {
  const svg = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ from: Point; to: Point } | null>(null)
  const pt = (e: ReactPointerEvent) => toImage(svg.current!, e.clientX, e.clientY, body.width, body.height)
  const rectOf = ({ from, to }: { from: Point; to: Point }) => ({
    x: Math.round(Math.min(from[0], to[0])),
    y: Math.round(Math.min(from[1], to[1])),
    w: Math.round(Math.abs(to[0] - from[0])),
    h: Math.round(Math.abs(to[1] - from[1])),
  })
  const stroke = Math.max(body.width, body.height) / 250

  return (
    <div className="flex flex-col gap-3">
      <RichTextEditor value={body.prompt} onChange={(prompt) => onChange({ ...body, prompt })} placeholder="Đề, vd. Tìm và chạm vào tất cả các số 1" />
      <ImagePicker has={!!body.image} onPick={(v) => onChange({ ...body, ...v, targets: [] })} />
      {body.image && (
        <>
          <p className="text-sm text-slate-500">Kéo trên ảnh để khoanh từng chỗ đúng ({body.targets.length} chỗ):</p>
          <ImageCanvas
            svgRef={svg}
            width={body.width}
            height={body.height}
            image={body.image}
            drawing
            className="cursor-crosshair"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setDrag({ from: pt(e), to: pt(e) })
            }}
            onPointerMove={(e) => drag && setDrag({ ...drag, to: pt(e) })}
            onPointerUp={() => {
              if (drag) {
                const r = rectOf(drag)
                if (r.w > 3 && r.h > 3) onChange({ ...body, targets: [...body.targets, r] })
              }
              setDrag(null)
            }}
          >
            {[...body.targets, ...(drag ? [rectOf(drag)] : [])].map((t, i) => (
              <g key={i}>
                <rect x={t.x} y={t.y} width={t.w} height={t.h} fill="rgb(16 185 129 / 0.2)" stroke="#059669" strokeWidth={stroke} />
                <text x={t.x + stroke * 2} y={t.y + stroke * 8} fontSize={stroke * 8} fill="#047857" fontWeight="bold">
                  {i + 1}
                </text>
              </g>
            ))}
          </ImageCanvas>
          <div className="flex flex-wrap gap-2 text-sm">
            {body.targets.map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onChange({ ...body, targets: body.targets.filter((_, j) => j !== i) })}
                className="min-h-11 rounded-lg bg-slate-100 px-3"
                title={`x ${t.x}, y ${t.y}, ${t.w}×${t.h}`}
              >
                {i + 1} ✕
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function MazeEditor({ body, onChange }: EditorProps<'maze'>) {
  const start = body.path[0]
  const end = body.path[body.path.length - 1]
  const r = Math.max(body.tolerance, Math.max(body.width, body.height) / 60)
  return (
    <div className="flex flex-col gap-3">
      <RichTextEditor value={body.prompt} onChange={(prompt) => onChange({ ...body, prompt })} placeholder="Đề, vd. Giúp chú rồng tìm đường về lâu đài" />
      <ImagePicker
        has={!!body.image}
        onPick={(v) => onChange({ ...body, ...v, path: [], tolerance: Math.round(Math.max(v.width, v.height) / 40) })}
      />
      {body.image && (
        <>
          <p className="text-sm text-slate-500">Vẽ một nét theo giữa lối đi đúng, từ chỗ xuất phát tới đích. Vẽ lại thì nét mới thay nét cũ.</p>
          <DrawPad
            width={body.width}
            height={body.height}
            image={body.image}
            strokes={body.path.length ? [body.path] : []}
            onStrokes={(s) => onChange({ ...body, path: s.length ? simplify(s[s.length - 1]!, body.tolerance / 2) : [] })}
            strokeWidth={body.tolerance * 2}
            color="#10b981"
            over={
              start &&
              end && (
                <>
                  <circle cx={start[0]} cy={start[1]} r={r} fill="#16a34a" />
                  <circle cx={end[0]} cy={end[1]} r={r} fill="#f59e0b" />
                </>
              )
            }
          />
          <ToleranceInput value={body.tolerance} onChange={(tolerance) => onChange({ ...body, tolerance })} hint="≈ nửa bề rộng lối đi; dải xanh là vùng bé được phép vẽ" />
        </>
      )}
    </div>
  )
}

export function TraceEditor({ body, onChange }: EditorProps<'trace'>) {
  return (
    <div className="flex flex-col gap-3">
      <RichTextEditor value={body.prompt} onChange={(prompt) => onChange({ ...body, prompt })} placeholder="Đề, vd. Tô theo nét số 3" />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ImagePicker has={!!body.image} onPick={(v) => onChange({ ...body, ...v, paths: [] })} />
        {body.image ? (
          <button type="button" onClick={() => onChange({ ...body, image: undefined })} className="min-h-11 rounded-lg bg-slate-100 px-3">
            Bỏ ảnh (app tự vẽ nét đứt)
          </button>
        ) : (
          <span className="text-slate-500">Không có ảnh: app tự vẽ nét đứt theo nét mẫu bên dưới.</span>
        )}
      </div>
      <p className="text-sm text-slate-500">Vẽ từng nét mẫu theo đúng thứ tự bé cần tô ({body.paths.length} nét):</p>
      <DrawPad
        width={body.width}
        height={body.height}
        image={body.image}
        strokes={body.paths}
        onStrokes={(s) => onChange({ ...body, paths: s.map((p) => simplify(p, body.tolerance / 2)) })}
        strokeWidth={body.tolerance * 2}
        color="#f43f5e"
        under={body.paths.map((p, i) => (
          <polyline key={i} points={polyline(p)} fill="none" stroke="#475569" strokeWidth={body.tolerance * 0.2} strokeDasharray={`${body.tolerance / 2} ${body.tolerance / 2}`} />
        ))}
      />
      <ToleranceInput value={body.tolerance} onChange={(tolerance) => onChange({ ...body, tolerance })} hint="≈ nửa bề rộng nét chữ" />
    </div>
  )
}

export function ColoringEditor({ body, onChange }: EditorProps<'coloring'>) {
  return (
    <div className="flex flex-col gap-3">
      <RichTextEditor value={body.prompt} onChange={(prompt) => onChange({ ...body, prompt })} placeholder="Đề, vd. Tô màu chú mèo" />
      <ImagePicker has={!!body.image} onPick={(v) => onChange({ ...body, ...v })} />
      <p className="text-sm text-slate-500">
        Dùng tranh nét đen trên nền trắng. Bé chạm vào vùng kín giữa các nét để đổ màu, hoặc tô tự do bằng bút. Không chấm đúng sai: tô là được điểm.
      </p>
      {body.image && (
        <ImageCanvas width={body.width} height={body.height} image={body.image} className="max-w-md ring-1 ring-slate-200" />
      )}
    </div>
  )
}

export function ArithGenEditor({ body, onChange }: EditorProps<'arith_gen'>) {
  const toggle = (op: '+' | '-') => {
    const ops = body.ops.includes(op) ? body.ops.filter((o) => o !== op) : [...body.ops, op]
    if (ops.length) onChange({ ...body, ops })
  }
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0))
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-slate-500">Mỗi lần con làm bài, app sinh một bộ phép tính mới theo các thông số này (đáp án tự tính).</p>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={body.ops.includes('+')} onChange={() => toggle('+')} className="size-5" /> Cộng
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={body.ops.includes('-')} onChange={() => toggle('-')} className="size-5" /> Trừ
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-500">Phạm vi</span>
        <input type="number" min={0} value={body.min ?? 0} onChange={(e) => onChange({ ...body, min: num(e.target.value) || undefined })} className={`${fieldClass} w-20`} aria-label="Số nhỏ nhất" />
        <span>đến</span>
        <input type="number" min={1} max={1000} value={body.max} onChange={(e) => onChange({ ...body, max: num(e.target.value) })} className={`${fieldClass} w-24`} aria-label="Phạm vi" />
        <span className="text-slate-500">· Số phép tính</span>
        <input type="number" min={1} max={50} value={body.count} onChange={(e) => onChange({ ...body, count: num(e.target.value) })} className={`${fieldClass} w-20`} />
      </div>
      <label className="flex flex-wrap items-center gap-2">
        <span className="text-slate-500">Ô bé điền</span>
        <select value={body.missing ?? 'result'} onChange={(e) => onChange({ ...body, missing: e.target.value === 'result' ? undefined : (e.target.value as 'operand' | 'mixed') })} className={fieldClass}>
          <option value="result">Kết quả (3 + 4 = □)</option>
          <option value="operand">Số hạng (3 + □ = 7)</option>
          <option value="mixed">Trộn cả hai</option>
        </select>
      </label>
    </div>
  )
}
