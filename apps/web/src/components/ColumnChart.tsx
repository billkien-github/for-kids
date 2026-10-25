import { useState } from 'react'

type Point = { label: string; value: number; detail?: string }

type Props = {
  title: string
  points: Point[]
  /** Giá trị trên cùng của trục; mặc định làm tròn lên từ giá trị lớn nhất. */
  max?: number
  unit?: string
  height?: number
}

// Màu chuỗi 1 của bảng màu tham chiếu (dataviz/references/palette.md).
const SERIES = '#2a78d6'
const GRID = '#e7e5e4'
const BAR_MAX = 24
const PAD = { top: 18, right: 8, bottom: 26, left: 34 }

/**
 * Biểu đồ cột một chuỗi: cột ≤ 24px, đầu cột bo 4px, gốc vuông, lưới mảnh;
 * rê/chạm vào cột để xem giá trị; nhãn số chỉ ở cột cuối. Có bảng số liệu đi kèm.
 */
export function ColumnChart({ title, points, max, unit = '', height = 180 }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const width = Math.max(280, points.length * 44 + PAD.left + PAD.right)
  const top = max ?? Math.max(1, Math.ceil(Math.max(...points.map((p) => p.value), 0) / 5) * 5)
  const plotH = height - PAD.top - PAD.bottom
  const band = (width - PAD.left - PAD.right) / Math.max(1, points.length)
  const barW = Math.min(BAR_MAX, band * 0.6)
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const ticks = [0, top / 2, top]

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-semibold text-slate-700">{title}</figcaption>
      {points.length === 0 ? (
        <p className="text-sm text-slate-400">Chưa có dữ liệu</p>
      ) : (
        <div className="relative overflow-x-auto">
          <svg width={width} height={height} role="img" aria-label={title}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
                <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#78716c">
                  {Math.round(t)}
                </text>
              </g>
            ))}
            {points.map((p, i) => {
              const cx = PAD.left + band * i + band / 2
              const h = Math.max(0, y(0) - y(p.value))
              const r = Math.min(4, h)
              const x0 = cx - barW / 2
              const x1 = cx + barW / 2
              const yTop = y(p.value)
              // Đầu cột bo 4px, gốc vuông.
              const d = `M${x0},${y(0)} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x1 - r} Q${x1},${yTop} ${x1},${yTop + r} V${y(0)} Z`
              const last = i === points.length - 1
              return (
                <g key={p.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onClick={() => setHover(i)}>
                  {/* Vùng chạm lớn hơn cột. */}
                  <rect x={cx - band / 2} y={PAD.top} width={band} height={plotH} fill="transparent" />
                  {h > 0 && <path d={d} fill={SERIES} opacity={hover === null || hover === i ? 1 : 0.55} />}
                  {last && (
                    <text x={cx} y={yTop - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill="#1c1917">
                      {p.value}
                      {unit}
                    </text>
                  )}
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize="11" fill="#78716c">
                    {p.label}
                  </text>
                </g>
              )
            })}
          </svg>
          {hover !== null && points[hover] && (
            <div
              className="pointer-events-none absolute rounded-lg bg-slate-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow"
              style={{ left: PAD.left + band * hover + band / 2, top: 0, transform: 'translateX(-50%)' }}
            >
              {points[hover].label}: <b>
                {points[hover].value}
                {unit}
              </b>
              {points[hover].detail ? ` · ${points[hover].detail}` : ''}
            </div>
          )}
        </div>
      )}
      {points.length > 0 && (
        <details className="text-sm text-slate-600">
          <summary className="cursor-pointer text-slate-400">Xem bảng số liệu</summary>
          <table className="mt-1">
            <tbody>
              {points.map((p) => (
                <tr key={p.label}>
                  <td className="pr-4">{p.label}</td>
                  <td className="pr-4 text-right font-mono">
                    {p.value}
                    {unit}
                  </td>
                  <td className="text-slate-400">{p.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </figure>
  )
}
