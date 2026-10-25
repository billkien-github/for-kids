import { z } from 'zod'
import { GRADE_MAX, GRADE_MIN } from './constants.js'

// Dữ liệu vào/ra của REST API (§7), dùng chung cho api và web.

export const Pin = z.string().regex(/^\d{4}$/, 'PIN gồm 4 chữ số')

export const LoginInput = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(200),
})

export const PinInput = z.object({ pin: Pin })
export const SelectProfileInput = z.object({ pin: Pin.optional() })

export const AVATARS = ['🦊', '🐼', '🐯', '🐸', '🐵', '🦄', '🐙', '🐧', '🐰', '🐶', '🐱', '🦁', '🐨', '🐳', '🦖', '🐝'] as const

export const ChildInput = z.object({
  name: z.string().trim().min(1).max(40),
  avatar: z.enum(AVATARS),
  grade: z.number().int().min(GRADE_MIN).max(GRADE_MAX),
  // undefined = giữ nguyên, null = bỏ PIN, chuỗi = đặt PIN mới.
  pin: Pin.nullable().optional(),
})

export type LoginInput = z.infer<typeof LoginInput>
export type ChildInput = z.infer<typeof ChildInput>

export type Profile = { id: string; name: string; avatar: string; grade: number; hasPin: boolean }

export type Me = {
  parent: { id: string; email: string }
  family: { id: string; name: string }
  activeChild: Profile | null
  parentUnlockedUntil: string | null
}

export type ApiErrorBody = {
  error: string
  message?: string
  issues?: { path: string; message: string }[]
  retryAfterSec?: number
}

export const gradeLabel = (grade: number) => (grade === 0 ? 'Mầm non' : `Lớp ${grade}`)
