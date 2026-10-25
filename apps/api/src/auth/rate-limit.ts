import { HttpError } from '../http.js'

const SWEEP_ABOVE = 1000

/**
 * Giới hạn số lần thử theo khoá (ip + email, child id…), lưu trong bộ nhớ.
 * Đủ dùng vì app chỉ chạy 1 tiến trình cho 1 gia đình.
 */
export class AttemptLimiter {
  private readonly entries = new Map<string, { attempts: number; resetAt: number }>()

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly now: () => number,
  ) {}

  /**
   * Ghi nhận một lần thử, ném 429 nếu đã hết lượt. Phải gọi TRƯỚC khi kiểm tra mật khẩu/PIN:
   * hàm chạy đồng bộ nên các request song song không thể cùng lọt qua trước khi lần sai được đếm.
   */
  hit(key: string) {
    const now = this.now()
    if (this.entries.size > SWEEP_ABOVE) this.sweep(now)

    const e = this.entries.get(key)
    if (!e || e.resetAt <= now) {
      this.entries.set(key, { attempts: 1, resetAt: now + this.windowMs })
      return
    }
    if (e.attempts >= this.maxAttempts) {
      const retryAfterSec = Math.ceil((e.resetAt - now) / 1000)
      throw new HttpError(429, { error: 'too_many_attempts', message: 'Thử sai quá nhiều lần, đợi một lát nhé', retryAfterSec })
    }
    e.attempts++
  }

  /** Nhập đúng thì xoá bộ đếm. */
  reset(key: string) {
    this.entries.delete(key)
  }

  private sweep(now: number) {
    for (const [key, e] of this.entries) if (e.resetAt <= now) this.entries.delete(key)
  }
}
