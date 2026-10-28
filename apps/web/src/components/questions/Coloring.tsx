import { COLORING_PALETTE, coloringPoints, MAX_COLORING_OPS, MAX_COLORING_POINTS, MAX_STROKE_POINTS, type ColoringOp, type Point } from '@for-kids/shared'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Regions, shrinkWalls, wallMask, type Region } from '../../lib/coloring'
import { field, type QuestionProps } from './common'

/** Cạnh dài nhất của ảnh raster dùng để tô: đủ nét trên iPad, không tốn bộ nhớ. */
const MAX_RASTER = 1024
/** Số điểm ảnh tối đa của bản to dùng để tìm nét (tranh lớn), tránh tốn bộ nhớ trên iPad. */
const MAX_WALL_PIXELS = 6_500_000
/** Hằng số rỗng: chưa có câu trả lời thì mỗi lần render vẫn là cùng một mảng. */
const NO_OPS: ColoringOp[] = []

type Tool = 'fill' | 'brush' | 'erase'
const BRUSH = { small: 1 / 70, big: 1 / 28 }

type Painter = {
  ctx: CanvasRenderingContext2D
  regions: Regions
  /** Toạ độ đề → toạ độ raster. */
  scale: number
  stencils: Map<number, HTMLCanvasElement>
}

/** Mặt nạ một vùng, cắt theo khung bao của vùng để không tốn bộ nhớ cho vùng nhỏ. */
function stencil(p: Painter, r: Region) {
  let c = p.stencils.get(r.id)
  if (c) return c
  const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1
  c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const W = p.regions.w
  for (const i of r.pixels) {
    const x = (i % W) - r.x0, y = Math.floor(i / W) - r.y0
    img.data[(y * w + x) * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  p.stencils.set(r.id, c)
  return c
}

function strokePath(ctx: CanvasRenderingContext2D, pts: Point[], s: number) {
  ctx.beginPath()
  ctx.moveTo(pts[0]![0] * s, pts[0]![1] * s)
  // Một điểm (chấm) thì kéo một đoạn rất ngắn để nét tròn vẫn hiện.
  if (pts.length === 1) ctx.lineTo(pts[0]![0] * s + 0.01, pts[0]![1] * s)
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x * s, y * s)
  ctx.stroke()
}

function applyOp(p: Painter, op: ColoringOp, tmp: HTMLCanvasElement) {
  const { ctx, scale: s } = p
  if (op.t === 'fill') {
    const r = p.regions.at(op.p[0] * s, op.p[1] * s)
    if (!r) return
    const st = stencil(p, r)
    // Nhuộm mặt nạ thành màu đã chọn rồi đè lên lớp màu.
    tmp.width = st.width
    tmp.height = st.height
    const t = tmp.getContext('2d')!
    t.drawImage(st, 0, 0)
    t.globalCompositeOperation = 'source-in'
    t.fillStyle = op.c
    t.fillRect(0, 0, st.width, st.height)
    t.globalCompositeOperation = 'source-over'
    ctx.drawImage(tmp, r.x0, r.y0)
    return
  }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = op.w * s
  if (op.t === 'erase') ctx.globalCompositeOperation = 'destination-out'
  else ctx.strokeStyle = op.c
  strokePath(ctx, op.pts, s)
  ctx.restore()
}

/**
 * Tô màu: chạm vào vùng để đổ màu, hoặc tô tự do bằng bút; có tẩy, hoàn tác, xoá hết.
 * Lớp màu là canvas, tranh nét đặt đè lên trên (multiply) nên tô lem không che mất nét.
 */
export function Coloring({ body, solution, response, onChange }: QuestionProps<'coloring'>) {
  const ops = field<ColoringOp[]>(response, 'ops', NO_OPS)
  const readOnly = !!solution
  const palette = body.palette ?? COLORING_PALETTE
  const [tool, setTool] = useState<Tool>('fill')
  const [color, setColor] = useState<string>(palette[0]!)
  const [size, setSize] = useState<keyof typeof BRUSH>('big')
  const [error, setError] = useState(false)

  const canvas = useRef<HTMLCanvasElement>(null)
  const painter = useRef<Painter | null>(null)
  const tmp = useRef<HTMLCanvasElement | null>(null)
  // Các bước đã vẽ lên canvas, để lần sau chỉ vẽ thêm bước mới thay vì vẽ lại từ đầu.
  const drawn = useRef<ColoringOp[]>([])
  const [ready, setReady] = useState(false)
  const live = useRef<{ id: number; op: Extract<ColoringOp, { t: 'brush' | 'erase' }> } | null>(null)
  const down = useRef<{ id: number; at: Point } | null>(null)
  const penSeen = useRef(false)

  const scale = Math.min(1, MAX_RASTER / Math.max(body.width, body.height))
  const rw = Math.max(1, Math.round(body.width * scale))
  const rh = Math.max(1, Math.round(body.height * scale))

  // Nạp tranh, tính nét (tường) một lần cho mỗi ảnh.
  useEffect(() => {
    let cancelled = false
    setReady(false)
    setError(false)
    const img = new Image()
    img.src = `/api/assets/${body.image}`
    img
      .decode()
      .then(() => {
        if (cancelled || !canvas.current) return
        // Tranh to hơn raster: tìm nét ở bản to gấp k lần rồi gộp xuống, để nét mảnh không bị hở khi thu nhỏ.
        const k = Math.max(1, Math.min(Math.floor(img.naturalWidth / rw), Math.floor(img.naturalHeight / rh), Math.floor(Math.sqrt(MAX_WALL_PIXELS / (rw * rh)))))
        const off = document.createElement('canvas')
        off.width = rw * k
        off.height = rh * k
        const octx = off.getContext('2d', { willReadFrequently: true })!
        octx.drawImage(img, 0, 0, rw * k, rh * k)
        const wall = shrinkWalls(wallMask(octx.getImageData(0, 0, rw * k, rh * k).data, rw * k, rh * k), rw * k, rh * k, k)
        const ctx = canvas.current.getContext('2d')!
        // Đổi tranh mà kích thước giữ nguyên thì canvas không tự xoá: xoá lớp màu của tranh cũ.
        ctx.clearRect(0, 0, rw, rh)
        painter.current = { ctx, regions: new Regions(rw, rh, wall), scale, stencils: new Map() }
        tmp.current = document.createElement('canvas')
        drawn.current = []
        setReady(true)
      })
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [body.image, rw, rh, scale])

  // Vẽ các bước mới; nếu danh sách không nối tiếp cái đã vẽ (hoàn tác, xoá hết, nạp lại) thì vẽ lại từ đầu.
  useEffect(() => {
    const p = painter.current
    if (!ready || !p || !tmp.current) return
    const prev = drawn.current
    const extends_ = prev.length <= ops.length && prev.every((o, i) => o === ops[i])
    if (!extends_) p.ctx.clearRect(0, 0, rw, rh)
    for (const op of ops.slice(extends_ ? prev.length : 0)) {
      // Nét vừa vẽ tay đã hiện trên canvas trong lúc vẽ.
      if (op !== live.current?.op) applyOp(p, op, tmp.current)
    }
    // Chỉ bỏ nét đang vẽ khi nó đã được lưu vào danh sách; render lại giữa chừng thì bé vẫn vẽ tiếp được.
    if (live.current && ops.includes(live.current.op)) live.current = null
    drawn.current = ops
  }, [ops, ready, rw, rh])

  const toBody = (e: { clientX: number; clientY: number }): Point => {
    const r = canvas.current!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * body.width
    const y = ((e.clientY - r.top) / r.height) * body.height
    // Toạ độ nguyên: đủ mịn cho nét tô, câu trả lời gọn hơn khi lưu.
    return [Math.round(Math.min(body.width, Math.max(0, x))), Math.round(Math.min(body.height, Math.max(0, y)))]
  }
  // Số điểm nét còn được thêm (server không nhận tranh vượt trần).
  const pointsLeft = MAX_COLORING_POINTS - coloringPoints(ops)
  const full = ops.length >= MAX_COLORING_OPS || pointsLeft <= 1
  const commit = (op: ColoringOp) => onChange({ ops: [...ops, op] })

  const onDown = (e: ReactPointerEvent) => {
    if (readOnly || !ready || full) return
    if (e.pointerType === 'pen') penSeen.current = true
    else if (e.pointerType === 'touch' && penSeen.current) return
    if (live.current || down.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const at = toBody(e)
    if (tool === 'fill') {
      down.current = { id: e.pointerId, at }
      return
    }
    const w = Math.max(body.width, body.height) * (tool === 'erase' ? BRUSH.big : BRUSH[size])
    const op: ColoringOp = tool === 'erase' ? { t: 'erase', w, pts: [at] } : { t: 'brush', c: color, w, pts: [at] }
    live.current = { id: e.pointerId, op }
    applyOp(painter.current!, op, tmp.current!)
  }
  const onMove = (e: ReactPointerEvent) => {
    const l = live.current
    if (!l || l.id !== e.pointerId) return
    const p = painter.current!
    const min = Math.max(body.width, body.height) / 400
    const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? []
    for (const ev of coalesced.length ? coalesced : [e.nativeEvent]) {
      const pt = toBody(ev)
      const last = l.op.pts[l.op.pts.length - 1]!
      if (l.op.pts.length >= Math.min(MAX_STROKE_POINTS, pointsLeft) || Math.hypot(pt[0] - last[0], pt[1] - last[1]) < min) continue
      l.op.pts.push(pt)
      // Chỉ vẽ đoạn mới, không vẽ lại cả nét.
      applyOp(p, { ...l.op, pts: [last, pt] }, tmp.current!)
    }
  }
  const onUp = (e: ReactPointerEvent) => {
    const d = down.current
    if (d && d.id === e.pointerId) {
      down.current = null
      const at = toBody(e)
      // Kéo đi xa thì coi như lỡ tay; chạm vào chỗ toàn nét (không có vùng) thì không tính là đã tô.
      const moved = Math.hypot(at[0] - d.at[0], at[1] - d.at[1]) >= Math.max(body.width, body.height) / 30
      if (!moved && painter.current!.regions.at(d.at[0] * scale, d.at[1] * scale)) commit({ t: 'fill', p: d.at, c: color })
      return
    }
    const l = live.current
    if (l && l.id === e.pointerId) commit(l.op)
  }

  const toolBtn = (t: Tool, icon: string, label: string) => (
    <button
      type="button"
      onClick={() => setTool(t)}
      aria-pressed={tool === t}
      className={`flex min-h-touch items-center gap-1.5 rounded-xl px-3 text-base ${tool === t ? 'bg-sky-600 font-semibold text-white' : 'bg-white ring-1 ring-slate-200'}`}
    >
      <span className="text-xl">{icon}</span>
      {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`relative mx-auto w-full overflow-hidden rounded-xl bg-white ring-2 ${readOnly ? 'ring-slate-200' : 'ring-sky-200'}`}
        style={{ aspectRatio: `${body.width} / ${body.height}`, maxWidth: `calc(70vh * ${body.width / body.height})` }}
      >
        <canvas
          ref={canvas}
          width={rw}
          height={rh}
          className={`absolute inset-0 size-full ${readOnly ? '' : 'touch-none'} ${tool === 'fill' ? 'cursor-pointer' : 'cursor-crosshair'}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        <img src={`/api/assets/${body.image}`} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full mix-blend-multiply select-none" />
        {!ready && !error && <p className="absolute inset-0 grid place-items-center text-slate-400">Đang tải tranh…</p>}
        {error && <p className="absolute inset-0 grid place-items-center text-red-600">Không tải được tranh</p>}
      </div>

      {!readOnly && (
        <>
          <div role="radiogroup" aria-label="Màu" className="flex flex-wrap justify-center gap-2">
            {palette.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => {
                  setColor(c)
                  if (tool === 'erase') setTool('fill')
                }}
                className={`size-11 rounded-full ring-offset-2 transition active:scale-90 ${color === c && tool !== 'erase' ? 'scale-110 ring-4 ring-slate-700' : 'ring-1 ring-black/10'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {toolBtn('fill', '🪣', 'Đổ màu')}
            {toolBtn('brush', '🖍️', 'Bút')}
            {tool === 'brush' && (
              <span className="flex gap-1">
                {(['small', 'big'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSize(k)}
                    aria-pressed={size === k}
                    aria-label={k === 'small' ? 'Nét nhỏ' : 'Nét to'}
                    className={`grid size-11 place-items-center rounded-xl ${size === k ? 'bg-sky-100 ring-2 ring-sky-500' : 'bg-white ring-1 ring-slate-200'}`}
                  >
                    <span className="rounded-full" style={{ backgroundColor: color, width: k === 'small' ? 8 : 20, height: k === 'small' ? 8 : 20 }} />
                  </button>
                ))}
              </span>
            )}
            {toolBtn('erase', '🧽', 'Tẩy')}
            <button
              type="button"
              onClick={() => onChange({ ops: ops.slice(0, -1) })}
              disabled={ops.length === 0}
              className="min-h-touch rounded-xl bg-slate-100 px-3 text-base disabled:opacity-30"
            >
              ↶ Hoàn tác
            </button>
            <button type="button" onClick={() => onChange({ ops: [] })} disabled={ops.length === 0} className="min-h-touch rounded-xl bg-slate-100 px-3 text-base disabled:opacity-30">
              🗑 Xoá hết
            </button>
          </div>
          {full && <p className="text-center text-sm text-amber-700">Con tô nhiều quá rồi! Hoàn tác bớt để tô tiếp nhé.</p>}
        </>
      )}
    </div>
  )
}
