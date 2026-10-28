import { describe, expect, it } from 'vitest'
import { Regions, shrinkWalls, wallMask } from './coloring'

/** Lưới chữ: '#' là nét, '.' là nền. */
function grid(rows: string[]) {
  const h = rows.length, w = rows[0]!.length
  const wall = new Uint8Array(w * h)
  rows.forEach((r, y) => [...r].forEach((c, x) => (wall[y * w + x] = c === '#' ? 1 : 0)))
  return new Regions(w, h, wall)
}

const BOX = [
  '..........',
  '.######...',
  '.#....#...',
  '.#....#...',
  '.######...',
  '..........',
]

describe('Regions', () => {
  it('đổ màu bên trong hình kín không tràn ra ngoài', () => {
    const r = grid(BOX)
    const inside = r.at(3, 2)!
    const outside = r.at(8, 0)!
    expect(inside.id).not.toBe(outside.id)
    // 8 điểm nền bên trong + lấn vào nét (16 điểm nét quanh đó).
    const bg = [...inside.pixels].filter((i) => BOX[Math.floor(i / 10)]![i % 10] === '.')
    expect(bg).toHaveLength(8)
    expect(inside.pixels.length).toBeGreaterThan(8)
    expect([...inside.pixels].every((i) => i % 10 <= 8)).toBe(true)
  })

  it('chạm trúng nét thì lấy vùng gần nhất, chạm lại vùng cũ dùng lại kết quả', () => {
    const r = grid(BOX)
    // Điểm (3, 1) nằm trên nét, cách đều trong và ngoài: vẫn ra một vùng.
    expect(r.at(3, 1)).not.toBeNull()
    expect(r.at(2, 2)).toBe(r.at(5, 3))
    expect(r.at(0, 0)).toBe(r.at(9, 5))
    expect(grid(['###', '###']).at(1, 1)).toBeNull()
  })

  it('shrinkWalls: nét mảnh một điểm ở bản to vẫn là nét sau khi thu nhỏ', () => {
    // 4×4, nét dọc ở cột 1 → 2×2: cột 0 là nét.
    const wall = new Uint8Array([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0])
    expect([...shrinkWalls(wall, 4, 4, 2)]).toEqual([1, 0, 1, 0])
    expect(shrinkWalls(wall, 4, 4, 1)).toBe(wall)
  })

  it('wallMask: điểm tối, không trong suốt là nét', () => {
    const px = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0, 90, 90, 90, 255])
    expect([...wallMask(px, 4, 1)]).toEqual([1, 0, 0, 1])
  })
})
