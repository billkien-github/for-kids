/**
 * Hình học cho các câu vẽ/chạm trên ảnh (hotspot, maze, trace).
 * Toạ độ tính theo pixel của ảnh gốc (gốc ở góc trên trái), cùng hệ với `width`/`height` trong đề.
 */

import type { Point } from './question.js'

export type Rect = { x: number; y: number; w: number; h: number }

export const inRect = ([x, y]: Point, r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

/** Rải điểm đều dọc đường gấp khúc, cách nhau không quá `step`, để đoạn dài không lọt qua lúc chấm. */
export function densify(line: Point[], step: number): Point[] {
  if (line.length < 2) return [...line]
  const out: Point[] = [line[0]!]
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]!
    const [bx, by] = line[i]!
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step))
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n])
  }
  return out
}

/** Trần số điểm rải trên một nhóm đường: câu trả lời gửi lên bất thường cũng không làm chấm bài chậm. */
const MAX_SAMPLES = 5000

/** Rải điểm trên các đường; tổng chiều dài lớn thì giãn bước. Trả về cả bước thực dùng. */
function sample(lines: Point[][], step: number) {
  let length = 0
  for (const l of lines) for (let i = 1; i < l.length; i++) length += Math.hypot(l[i]![0] - l[i - 1]![0], l[i]![1] - l[i - 1]![1])
  const s = Math.max(step, length / MAX_SAMPLES)
  return { points: lines.flatMap((l) => densify(l, s)), step: s }
}

/** Lưới ô vuông để hỏi nhanh "có điểm nào cách p không quá r" (r ≤ cạnh ô). */
class PointGrid {
  private cells = new Map<number, Point[]>()
  constructor(
    points: Point[],
    private cell: number,
  ) {
    for (const p of points) {
      const k = this.key(Math.floor(p[0] / cell), Math.floor(p[1] / cell))
      const list = this.cells.get(k)
      if (list) list.push(p)
      else this.cells.set(k, [p])
    }
  }
  private key = (cx: number, cy: number) => cx * 1_000_003 + cy
  near(p: Point, r: number) {
    const cx = Math.floor(p[0] / this.cell)
    const cy = Math.floor(p[1] / this.cell)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const q of this.cells.get(this.key(cx + dx, cy + dy)) ?? []) if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= r) return true
      }
    }
    return false
  }
}

/**
 * Tỉ lệ điểm trong `points` cách đường đã rải điểm `target` không quá `r`.
 * Cộng nửa bước rải để bù chỗ điểm nằm giữa hai điểm rải.
 */
function fractionNear(points: Point[], target: { points: Point[]; step: number }, r: number) {
  if (points.length === 0 || target.points.length === 0) return 0
  const radius = r + target.step / 2
  const grid = new PointGrid(target.points, radius)
  return points.filter((p) => grid.near(p, radius)).length / points.length
}

/** Nét vẽ của bé kéo về trong khung ảnh (toạ độ ngoài ảnh không có nghĩa, và không để làm phình phép tính). */
const clampToCanvas = (lines: Point[][], width: number, height: number) =>
  lines.map((l) => l.map(([x, y]): Point => [Math.min(width, Math.max(0, x)), Math.min(height, Math.max(0, y))]))

type Canvas = { width: number; height: number; tolerance: number }

/**
 * Chạm vào hình: mỗi vùng đúng có ít nhất một lần chạm thì được tính; mỗi lần chạm ra ngoài mọi vùng trừ một.
 * Điểm = max(0, số vùng trúng − số lần chạm trượt) / số vùng.
 */
export function gradeHotspot(targets: Rect[], taps: Point[]) {
  const hit = new Set<number>()
  let misses = 0
  for (const t of taps) {
    const idx = targets.findIndex((r) => inRect(t, r))
    if (idx < 0) misses++
    else targets.forEach((r, i) => inRect(t, r) && hit.add(i))
  }
  return Math.max(0, hit.size - misses) / targets.length
}

/** Mê cung: phần lớn nét vẽ nằm trong lối đi đúng, đi gần hết lối đó, và tới được đích. */
export const MAZE_ON_PATH_MIN = 0.9
export const MAZE_COVERAGE_MIN = 0.85

export function gradeMaze(q: Canvas & { path: Point[] }, strokes: Point[][]) {
  const tol = q.tolerance
  const drawn = sample(clampToCanvas(strokes, q.width, q.height), tol / 2)
  if (drawn.points.length < 2) return 0
  const path = sample([q.path], tol / 2)
  const end = q.path[q.path.length - 1]!
  const reachedEnd = drawn.points.some((p) => Math.hypot(p[0] - end[0], p[1] - end[1]) <= tol * 2)
  const onPath = fractionNear(drawn.points, path, tol)
  const covered = fractionNear(path.points, drawn, tol * 1.5)
  return reachedEnd && onPath >= MAZE_ON_PATH_MIN && covered >= MAZE_COVERAGE_MIN ? 1 : 0
}

/**
 * Tô theo nét: nét của bé phải sát nét mẫu (độ chính xác), và phủ được nét mẫu (độ phủ).
 * Chính xác dưới ngưỡng thì 0 điểm; còn lại điểm theo độ phủ, làm tròn xuống từng 1/4.
 */
export const TRACE_PRECISION_MIN = 0.7
export const TRACE_COVERAGE_FULL = 0.85

export type TraceStats = { precision: number; coverage: number }

export function traceStats(q: Canvas & { paths: Point[][] }, strokes: Point[][]): TraceStats {
  const tol = q.tolerance
  const drawn = sample(clampToCanvas(strokes, q.width, q.height), tol / 2)
  const target = sample(q.paths, tol / 2)
  return {
    precision: fractionNear(drawn.points, target, tol * 1.5),
    coverage: fractionNear(target.points, drawn, tol),
  }
}

export const traceScore = ({ precision, coverage }: TraceStats) =>
  precision < TRACE_PRECISION_MIN ? 0 : Math.floor(Math.min(1, coverage / TRACE_COVERAGE_FULL) * 4) / 4

export const gradeTrace = (q: Canvas & { paths: Point[][] }, strokes: Point[][]) => traceScore(traceStats(q, strokes))
