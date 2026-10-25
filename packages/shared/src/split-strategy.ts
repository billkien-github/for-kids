export type SplitOp = '+' | '-'

export type SplitDerivation = {
  /** Số tròn chục mà `a` được làm tròn tới. */
  target: number
  /** 4 ô bé phải điền, theo thứ tự hiển thị: a, x, y, kết quả. */
  cells: [number, number, number, number]
}

/**
 * Tách–gộp qua số tròn chục (§4 spec).
 * Cộng: a + b = a + x + y, với x = T − a (T là số tròn chục ngay trên a).
 * Trừ:  a − b = a − x − y, với x = a − T (T là số tròn chục ngay dưới a).
 * Trả về null nếu phép tính không qua chục (khi đó không dùng được chiến lược này).
 */
export function deriveSplit(op: SplitOp, a: number, b: number): SplitDerivation | null {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0) return null

  if (op === '+') {
    const target = Math.floor(a / 10) * 10 + 10
    const x = target - a
    if (!(x > 0 && x < b)) return null
    return { target, cells: [a, x, b - x, a + b] }
  }

  if (a % 10 === 0) return null
  const target = Math.floor(a / 10) * 10
  const x = a - target
  if (!(x > 0 && x < b) || b > a) return null
  return { target, cells: [a, x, b - x, a - b] }
}
