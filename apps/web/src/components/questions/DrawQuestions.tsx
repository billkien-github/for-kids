import { gradeQuestion, inRect, MAX_STROKE_POINTS, MAX_STROKES, traceScore, traceStats, type Point } from '@for-kids/shared'
import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { field, type QuestionProps } from './common'

const round1 = (n: number) => Math.round(n * 10) / 10

/** Toạ độ màn hình → pixel của ảnh (SVG có viewBox theo kích thước ảnh, kể cả khi bị thu nhỏ/chừa lề). */
export function toImage(svg: SVGSVGElement, clientX: number, clientY: number, width: number, height: number): Point {
  const m = svg.getScreenCTM()
  if (!m) return [0, 0]
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse())
  return [round1(Math.min(width, Math.max(0, p.x))), round1(Math.min(height, Math.max(0, p.y)))]
}

export const polyline = (pts: Point[]) => pts.map(([x, y]) => `${x},${y}`).join(' ')

type CanvasProps = {
  width: number
  height: number
  image?: string
  /** Đang vẽ thì chặn cuộn trang. */
  drawing?: boolean
  children?: ReactNode
  svgRef?: React.Ref<SVGSVGElement>
} & Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height' | 'ref'>

/** Khung ảnh dùng chung: mọi thứ vẽ bên trong dùng toạ độ pixel của ảnh. */
export function ImageCanvas({ width, height, image, drawing, children, svgRef, className, ...rest }: CanvasProps) {
  if (!(width > 0 && height > 0)) return <p className="rounded-xl bg-slate-100 p-6 text-center text-base text-slate-500">Chưa có ảnh</p>
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full max-h-[70vh] rounded-xl bg-white select-none ${drawing ? 'touch-none' : ''} ${className ?? ''}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      {...rest}
    >
      {image && <image href={`/api/assets/${image}`} width={width} height={height} />}
      {children}
    </svg>
  )
}

type PadProps = {
  width: number
  height: number
  image?: string
  strokes: Point[][]
  onStrokes?: (strokes: Point[][]) => void
  strokeWidth: number
  color?: string
  /** Vẽ dưới nét của bé (nét mẫu, điểm đầu/cuối…). */
  under?: ReactNode
  over?: ReactNode
}

/**
 * Bảng vẽ bằng ngón tay / Apple Pencil, vẽ được nhiều ngón cùng lúc (bài tô bằng hai tay). Đã dùng bút thì
 * bỏ qua chạm tay (tì lòng bàn tay lên màn hình không thành nét). Chỉ báo `onStrokes` khi nhấc tay.
 */
export function DrawPad({ width, height, image, strokes, onStrokes, strokeWidth, color = '#0284c7', under, over }: PadProps) {
  const svg = useRef<SVGSVGElement>(null)
  const penSeen = useRef(false)
  // Các nét đang vẽ theo pointerId, giữ trong ref (nhấc tay có thể tới trước lần render sau lần di chuyển cuối).
  const active = useRef(new Map<number, Point[]>())
  // Danh sách nét mới nhất: hai ngón nhấc gần như cùng lúc không làm mất nét của nhau.
  const latest = useRef(strokes)
  latest.current = strokes
  const [, redraw] = useState(0)
  const minStep = Math.max(width, height) / 300
  const readOnly = !onStrokes
  // Server chỉ chấm tới trần số nét / số điểm mỗi nét; đủ rồi thì không nhận thêm để bé biết mà xoá bớt.
  const full = latest.current.length + active.current.size >= MAX_STROKES

  const down = (e: ReactPointerEvent) => {
    if (readOnly || full) return
    if (e.pointerType === 'pen') penSeen.current = true
    else if (e.pointerType === 'touch' && penSeen.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    active.current.set(e.pointerId, [toImage(svg.current!, e.clientX, e.clientY, width, height)])
    redraw((n) => n + 1)
  }
  const move = (e: ReactPointerEvent) => {
    const cur = active.current.get(e.pointerId)
    if (!cur) return
    const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? []
    for (const ev of coalesced.length ? coalesced : [e.nativeEvent]) {
      const p = toImage(svg.current!, ev.clientX, ev.clientY, width, height)
      const last = cur[cur.length - 1]!
      if (cur.length < MAX_STROKE_POINTS && Math.hypot(p[0] - last[0], p[1] - last[1]) >= minStep) cur.push(p)
    }
    redraw((n) => n + 1)
  }
  const up = (e: ReactPointerEvent) => {
    const cur = active.current.get(e.pointerId)
    if (!cur) return
    active.current.delete(e.pointerId)
    latest.current = [...latest.current, cur]
    onStrokes!(latest.current)
    redraw((n) => n + 1)
  }

  return (
    <div className="flex flex-col gap-2">
      <ImageCanvas
        svgRef={svg}
        width={width}
        height={height}
        image={image}
        drawing={!readOnly}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className={readOnly ? '' : 'cursor-crosshair ring-2 ring-sky-200'}
      >
        {under}
        <g fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={0.75}>
          {[...strokes, ...active.current.values()].map((s, i) =>
            s.length === 1 ? <circle key={i} cx={s[0]![0]} cy={s[0]![1]} r={strokeWidth / 2} fill={color} stroke="none" /> : <polyline key={i} points={polyline(s)} />,
          )}
        </g>
        {over}
      </ImageCanvas>
      {!readOnly && (
        <div className="flex gap-2 text-base">
          <button type="button" onClick={() => onStrokes(strokes.slice(0, -1))} disabled={strokes.length === 0} className="min-h-touch rounded-xl bg-slate-100 px-4 disabled:opacity-30">
            ↶ Xoá nét vừa vẽ
          </button>
          <button type="button" onClick={() => onStrokes([])} disabled={strokes.length === 0} className="min-h-touch rounded-xl bg-slate-100 px-4 disabled:opacity-30">
            🗑 Vẽ lại
          </button>
          {full && <span className="self-center text-sm text-amber-700">Đã đủ nét, con xoá bớt để vẽ tiếp nhé.</span>}
        </div>
      )}
    </div>
  )
}

function Verdict({ score, detail }: { score: number; detail?: string }) {
  const ok = score === 1
  return (
    <p className={`rounded-xl px-3 py-2 text-base ${ok ? 'bg-emerald-50 text-emerald-700' : score > 0 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>
      {ok ? '✓ Đúng rồi!' : score > 0 ? `Gần đúng (${Math.round(score * 100)}%)` : 'Chưa đúng'}
      {detail && <span className="ml-2 text-slate-500">{detail}</span>}
    </p>
  )
}

/** Chạm vào hình: chạm để đánh dấu, chạm lại dấu đó để bỏ. */
export function Hotspot({ body, solution, response, onChange }: QuestionProps<'hotspot'>) {
  const svg = useRef<SVGSVGElement>(null)
  const taps = field<Point[]>(response, 'taps', [])
  // Xem thử trong trình soạn bài nhận đề đầy đủ (có targets) thay vì bản đã giấu đáp án.
  const total = solution?.targets.length ?? body.targetCount ?? (body as unknown as { targets?: unknown[] }).targets?.length ?? 0
  const r = Math.max(body.width, body.height) * 0.022

  const tap = (e: React.MouseEvent) => {
    if (solution) return
    const p = toImage(svg.current!, e.clientX, e.clientY, body.width, body.height)
    // Chỉ bỏ dấu khi chạm đúng vào dấu đó, để hai chỗ đúng nằm sát nhau vẫn đánh dấu được cả hai.
    const near = taps.findIndex((t) => Math.hypot(t[0] - p[0], t[1] - p[1]) <= r)
    if (near >= 0) onChange({ taps: taps.filter((_, i) => i !== near) })
    else if (taps.length < 100) onChange({ taps: [...taps, p] })
  }

  return (
    <div className="flex flex-col gap-2">
      {!solution && (
        <p className="text-base text-slate-500">
          Chạm vào hình để đánh dấu, chạm lại để bỏ. Đã đánh dấu <b className="text-sky-700">{taps.length}</b>
          {total > 0 && ` / ${total}`}
        </p>
      )}
      <ImageCanvas svgRef={svg} width={body.width} height={body.height} image={body.image} onClick={tap} className={solution ? '' : 'cursor-pointer'}>
        {solution?.targets.map((t, i) => (
          <rect key={i} x={t.x} y={t.y} width={t.w} height={t.h} rx={r / 2} fill="rgb(16 185 129 / 0.15)" stroke="#059669" strokeWidth={r / 4} strokeDasharray={`${r / 2} ${r / 3}`} />
        ))}
        {taps.map((t, i) => {
          const hit = solution ? solution.targets.some((x) => inRect(t, x)) : null
          const color = hit === null ? '#0284c7' : hit ? '#059669' : '#dc2626'
          return <circle key={i} cx={t[0]} cy={t[1]} r={r} fill={`${color}33`} stroke={color} strokeWidth={r / 4} />
        })}
      </ImageCanvas>
      {solution && <Verdict score={gradeQuestion(solution, { taps }) ?? 0} detail={`(${total} chỗ cần tìm)`} />}
    </div>
  )
}

function Marker({ at, size, label, color }: { at: Point; size: number; label: string; color: string }) {
  return (
    <g>
      <circle cx={at[0]} cy={at[1]} r={size} fill={color} stroke="white" strokeWidth={size / 4} opacity={0.9} />
      <text x={at[0]} y={at[1]} fontSize={size * 1.1} textAnchor="middle" dominantBaseline="central" fill="white">
        {label}
      </text>
    </g>
  )
}

/** Mê cung: vẽ đường từ điểm xuất phát tới đích. */
export function Maze({ body, solution, response, onChange }: QuestionProps<'maze'>) {
  const strokes = field<Point[][]>(response, 'strokes', [])
  // Đề đầy đủ (chế độ xem lại, hoặc xem thử trong trình soạn bài) có path; bản giấu đáp án chỉ có start/end.
  const path = solution?.path ?? (body as unknown as { path?: Point[] }).path
  const start = path ? path[0]! : body.start
  const end = path ? path[path.length - 1]! : body.end
  const size = Math.max(body.tolerance, Math.max(body.width, body.height) / 50)
  const score = solution ? (gradeQuestion(solution, { strokes }) ?? 0) : null
  return (
    <div className="flex flex-col gap-2">
      {!solution && <p className="text-base text-slate-500">Vẽ đường đi từ ▶ tới 🏁 bằng ngón tay hoặc bút.</p>}
      <DrawPad
        width={body.width}
        height={body.height}
        image={body.image}
        strokes={strokes}
        onStrokes={solution ? undefined : (s) => onChange({ strokes: s })}
        strokeWidth={body.tolerance * 0.8}
        under={
          solution && (
            <polyline
              points={polyline(solution.path)}
              fill="none"
              stroke="#059669"
              strokeWidth={body.tolerance * 0.5}
              strokeDasharray={`${body.tolerance} ${body.tolerance * 0.6}`}
              strokeLinecap="round"
              opacity={0.8}
            />
          )
        }
        over={
          <>
            <Marker at={start} size={size} label="▶" color="#16a34a" />
            <Marker at={end} size={size} label="🏁" color="#f59e0b" />
          </>
        }
      />
      {score !== null && <Verdict score={score} detail={score === 1 ? undefined : 'Đường đúng là nét đứt màu xanh.'} />}
    </div>
  )
}

/** Tô theo nét: nét mẫu do app vẽ (khi không có ảnh) hoặc có sẵn trong ảnh. */
export function Trace({ body, solution, response, onChange }: QuestionProps<'trace'>) {
  const strokes = field<Point[][]>(response, 'strokes', [])
  const tol = body.tolerance
  const showGuide = !body.image || !!solution
  const numbered = body.paths.length > 1
  const guide = (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {!body.image && body.paths.map((p, i) => <polyline key={`bg${i}`} points={polyline(p)} stroke="#e2e8f0" strokeWidth={tol * 2} />)}
      {body.paths.map((p, i) => (
        <polyline key={i} points={polyline(p)} stroke={solution ? '#059669' : '#94a3b8'} strokeWidth={tol * 0.35} strokeDasharray={`${tol * 0.6} ${tol * 0.5}`} />
      ))}
      {!solution &&
        body.paths.map((p, i) => (
          <g key={`s${i}`}>
            <circle cx={p[0]![0]} cy={p[0]![1]} r={tol * (numbered ? 0.7 : 0.45)} fill="#22c55e" />
            {numbered && (
              <text x={p[0]![0]} y={p[0]![1]} fontSize={tol} textAnchor="middle" dominantBaseline="central" fill="white" fontWeight="bold">
                {i + 1}
              </text>
            )}
          </g>
        ))}
    </g>
  )
  const stats = solution ? traceStats(solution, strokes) : null
  const score = stats ? traceScore(stats) : 0
  return (
    <div className="flex flex-col gap-2">
      {!solution && (
        <p className="text-base text-slate-500">
          {body.image ? 'Tô theo các nét có trong hình.' : `Tô theo nét đứt, bắt đầu từ chấm xanh${numbered ? ' (theo thứ tự số)' : ''}.`}
        </p>
      )}
      <DrawPad
        width={body.width}
        height={body.height}
        image={body.image}
        strokes={strokes}
        onStrokes={solution ? undefined : (s) => onChange({ strokes: s })}
        strokeWidth={tol * 1.1}
        color="#e11d48"
        under={showGuide && guide}
      />
      {stats && <Verdict score={score} detail={`Tô kín ${Math.round(stats.coverage * 100)}% nét, ${Math.round(stats.precision * 100)}% nét vẽ nằm đúng chỗ.`} />}
    </div>
  )
}
