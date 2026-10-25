import { describe, expect, it } from 'vitest'
import { deriveSplit } from './split-strategy.js'

describe('deriveSplit', () => {
  // Các câu làm mẫu lấy từ docs/loaded (Math-Drills).
  it.each([
    ['+', 7, 6, 10, [7, 3, 3, 13]],
    ['+', 6, 5, 10, [6, 4, 1, 11]],
    ['+', 2, 9, 10, [2, 8, 1, 11]],
    ['+', 58, 7, 60, [58, 2, 5, 65]],
    ['+', 79, 4, 80, [79, 1, 3, 83]],
    ['-', 13, 7, 10, [13, 3, 4, 6]],
    ['-', 11, 6, 10, [11, 1, 5, 5]],
    ['-', 86, 9, 80, [86, 6, 3, 77]],
    ['-', 65, 6, 60, [65, 5, 1, 59]],
  ] as const)('%s: %i %s %i → tròn %i', (op, a, b, target, cells) => {
    expect(deriveSplit(op, a, b)).toEqual({ target, cells })
  })

  it.each([
    ['+', 3, 4], // 3 + 4 không qua chục
    ['+', 7, 3], // vừa tròn chục, y = 0
    ['+', 10, 5], // a đã tròn chục
    ['-', 15, 3], // không qua chục
    ['-', 20, 7], // a tròn chục
    ['-', 13, 3], // vừa tròn chục, y = 0
    ['-', 5, 8], // ra số âm
    ['+', 0, 5],
    ['+', 1.5, 9],
  ] as const)('không hợp lệ: %s %d %d', (op, a, b) => {
    expect(deriveSplit(op, a, b)).toBeNull()
  })
})
