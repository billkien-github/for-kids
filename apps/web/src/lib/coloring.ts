/**
 * Tìm vùng kín để đổ màu trên tranh nét (câu tô màu). Tranh là nét tối trên nền sáng hoặc trong suốt:
 * điểm ảnh tối và không trong suốt là "tường", vùng đổ màu là các điểm không phải tường nối liền nhau.
 */

/** Điểm ảnh tối hơn ngưỡng này (độ sáng 0–255) là nét. Nét khử răng cưa nhạt hơn thuộc về vùng, nằm dưới nét nên không lộ. */
const WALL_LUMA = 128
/** Chạm trúng nét thì tìm vùng gần nhất trong bán kính này (điểm ảnh). */
const SEED_RADIUS = 6
/** Tô lấn vào nét bấy nhiêu điểm ảnh để không hở viền trắng giữa màu và nét. */
const BLEED = 2

export function wallMask(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const wall = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3]!
    const luma = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!
    wall[i] = a >= 128 && luma < WALL_LUMA ? 1 : 0
  }
  return wall
}

/**
 * Thu nhỏ mặt nạ nét k lần: một điểm là nét nếu bất kỳ điểm nào trong ô k×k tương ứng là nét.
 * Tranh lớn bị thu nhỏ thì nét mảnh nhạt đi; tìm nét ở bản to hơn rồi gộp xuống để nét không bị hở.
 */
export function shrinkWalls(wall: Uint8Array, w: number, h: number, k: number): Uint8Array {
  if (k === 1) return wall
  const sw = Math.floor(w / k), sh = Math.floor(h / k)
  const out = new Uint8Array(sw * sh)
  for (let y = 0; y < sh * k; y++) {
    const row = y * w, orow = Math.floor(y / k) * sw
    for (let x = 0; x < sw * k; x++) if (wall[row + x]) out[orow + Math.floor(x / k)] = 1
  }
  return out
}

export type Region ={ id: number; x0: number; y0: number; x1: number; y1: number; pixels: Uint32Array }

export class Regions {
  private label: Int32Array
  private cache = new Map<number, Region>()
  private mark: Int32Array
  private gen = 0

  constructor(
    readonly w: number,
    readonly h: number,
    private wall: Uint8Array,
  ) {
    this.label = new Int32Array(w * h)
    this.mark = new Int32Array(w * h)
  }

  private seedNear(x: number, y: number): number | null {
    const cx = Math.round(x), cy = Math.round(y)
    let best: number | null = null
    let bestD = Infinity
    for (let dy = -SEED_RADIUS; dy <= SEED_RADIUS; dy++) {
      for (let dx = -SEED_RADIUS; dx <= SEED_RADIUS; dx++) {
        const px = cx + dx, py = cy + dy
        if (px < 0 || py < 0 || px >= this.w || py >= this.h) continue
        const d = dx * dx + dy * dy
        if (d < bestD && !this.wall[py * this.w + px]) {
          best = py * this.w + px
          bestD = d
        }
      }
    }
    return best
  }

  /** Vùng chứa điểm (x, y) theo toạ độ ảnh raster; null nếu quanh đó toàn nét. */
  at(x: number, y: number): Region | null {
    const seed = this.seedNear(x, y)
    if (seed === null) return null
    const known = this.label[seed]!
    if (known) return this.cache.get(known)!
    return this.flood(seed)
  }

  private flood(seed: number): Region {
    const { w, h, wall, label } = this
    const id = this.cache.size + 1
    const out: number[] = []
    const stack = [seed]
    label[seed] = id
    let x0 = w, y0 = h, x1 = 0, y1 = 0
    while (stack.length) {
      const i = stack.pop()!
      out.push(i)
      const x = i % w, y = (i - x) / w
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      if (x > 0 && !wall[i - 1] && !label[i - 1]) (label[i - 1] = id), stack.push(i - 1)
      if (x < w - 1 && !wall[i + 1] && !label[i + 1]) (label[i + 1] = id), stack.push(i + 1)
      if (y > 0 && !wall[i - w] && !label[i - w]) (label[i - w] = id), stack.push(i - w)
      if (y < h - 1 && !wall[i + w] && !label[i + w]) (label[i + w] = id), stack.push(i + w)
    }
    // Lấn vào nét quanh vùng (chỉ điểm nét, không lấn sang vùng bên kia nét).
    const gen = ++this.gen
    const n = out.length
    for (let k = 0; k < n; k++) {
      const i = out[k]!
      const x = i % w, y = (i - x) / w
      const edge = (x > 0 && wall[i - 1]) || (x < w - 1 && wall[i + 1]) || (y > 0 && wall[i - w]) || (y < h - 1 && wall[i + w])
      if (!edge) continue
      for (let dy = -BLEED; dy <= BLEED; dy++) {
        for (let dx = -BLEED; dx <= BLEED; dx++) {
          const px = x + dx, py = y + dy
          if (px < 0 || py < 0 || px >= w || py >= h) continue
          const j = py * w + px
          if (wall[j] && this.mark[j] !== gen) {
            this.mark[j] = gen
            out.push(j)
            if (px < x0) x0 = px
            if (px > x1) x1 = px
            if (py < y0) y0 = py
            if (py > y1) y1 = py
          }
        }
      }
    }
    const region = { id, x0, y0, x1, y1, pixels: Uint32Array.from(out) }
    this.cache.set(id, region)
    return region
  }
}
