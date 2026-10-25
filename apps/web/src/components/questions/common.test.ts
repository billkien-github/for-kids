import { describe, expect, it } from 'vitest'
import { handwrittenDigits } from './common'

describe('handwrittenDigits', () => {
  it('đổi chữ Scribble đọc nhầm về chữ số', () => {
    expect(handwrittenDigits('l0')).toBe('10')
    expect(handwrittenDigits('IO')).toBe('10')
    expect(handwrittenDigits('S')).toBe('5')
    expect(handwrittenDigits('3g')).toBe('39')
  })

  it('bỏ ký tự lạ, chỉ giữ ký tự được phép', () => {
    expect(handwrittenDigits('4 1-')).toBe('41')
    expect(handwrittenDigits('-2,S', '.,-')).toBe('-2,5')
    expect(handwrittenDigits('5:3o', ':.hH ')).toBe('5:30')
  })
})
