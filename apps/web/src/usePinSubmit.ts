import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage, meQueryKey } from './api'

/**
 * Gửi PIN (chọn bé, mở khoá phụ huynh): sai thì giữ thông báo lỗi và ném lại để PinPad xoá ô nhập;
 * đúng thì tải lại /auth/me rồi gọi onSuccess.
 */
export function usePinSubmit<A extends unknown[]>(request: (...args: A) => Promise<unknown>, onSuccess: () => void) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const submit = async (...args: A) => {
    try {
      await request(...args)
    } catch (err) {
      setError(errorMessage(err))
      throw err
    }
    setError(null)
    await queryClient.invalidateQueries({ queryKey: meQueryKey })
    onSuccess()
  }

  return { error, submit, clearError: () => setError(null) }
}
