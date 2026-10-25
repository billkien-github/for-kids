import { useRef, type PointerEvent } from 'react'

type Props = {
  /** Góc kim giờ (độ, 0 = số 12). */
  hourAngle: number
  /** Kim phút (0–59); null = không vẽ kim phút. */
  minute: number | null
  size?: number
  /** Kéo/chạm trên mặt đồng hồ để đặt kim đang chọn. */
  onPointAngle?: (angle: number) => void
  highlight?: 'hour' | 'minute'
}

export const angleForTime = (h: number, m: number) => ((h % 12) * 30 + m * 0.5) % 360

/** Đồng hồ kim vẽ bằng SVG (§4: RichText.clock), dùng cho cả hiển thị và câu quay kim. */
export function Clock({ hourAngle, minute, size = 160, onPointAngle, highlight }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  const point = (e: PointerEvent<SVGSVGElement>) => {
    if (!onPointAngle || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = e.clientX - (r.left + r.width / 2)
    const y = e.clientY - (r.top + r.height / 2)
    onPointAngle(((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360)
  }

  const hand = (angle: number, length: number, width: number, color: string) => (
    <line
      x1="0"
      y1="0"
      x2="0"
      y2={-length}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      transform={`rotate(${angle})`}
    />
  )

  return (
    <svg
      ref={ref}
      viewBox="-110 -110 220 220"
      width={size}
      height={size}
      className={onPointAngle ? 'touch-none select-none' : undefined}
      role="img"
      aria-label="Đồng hồ"
      onPointerDown={(e) => {
        if (!onPointAngle) return
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        point(e)
      }}
      onPointerMove={(e) => dragging.current && point(e)}
      onPointerUp={() => (dragging.current = false)}
    >
      <circle r="104" fill="#fff7d6" stroke="#475569" strokeWidth="5" />
      {Array.from({ length: 60 }, (_, i) => (
        <line
          key={i}
          x1="0"
          y1={i % 5 === 0 ? -88 : -93}
          x2="0"
          y2="-98"
          stroke={i % 5 === 0 ? '#334155' : '#94a3b8'}
          strokeWidth={i % 5 === 0 ? 3 : 1.5}
          transform={`rotate(${i * 6})`}
        />
      ))}
      {Array.from({ length: 12 }, (_, i) => {
        const n = i + 1
        const a = (n * 30 * Math.PI) / 180
        return (
          <text key={n} x={Math.sin(a) * 72} y={-Math.cos(a) * 72 + 8} textAnchor="middle" fontSize="22" fontWeight="600" fill="#1e293b">
            {n}
          </text>
        )
      })}
      {minute !== null && hand(minute * 6, 82, highlight === 'minute' ? 6 : 4, highlight === 'minute' ? '#2563eb' : '#0f172a')}
      {hand(hourAngle, 52, highlight === 'hour' ? 9 : 7, highlight === 'hour' ? '#dc2626' : '#b91c1c')}
      <circle r="6" fill="#0f172a" />
    </svg>
  )
}
