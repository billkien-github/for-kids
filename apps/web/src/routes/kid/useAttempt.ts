import type { AttemptView } from '@for-kids/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../api'

const SAVE_DELAY_MS = 700

export const attemptKey = (id: string) => ['attempt', id] as const

/**
 * Trạng thái một lần làm bài: câu trả lời giữ ở máy, tự lưu lên server sau khi ngừng thao tác
 * (tắt app giữa chừng vẫn làm tiếp được). Nộp bài thì lưu nốt rồi mới nộp.
 */
export function useAttempt(id: string) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: attemptKey(id), queryFn: () => api<AttemptView>(`/kid/attempts/${id}`) })
  const [responses, setResponses] = useState<Record<string, unknown>>({})
  const dirty = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const responsesRef = useRef(responses)
  responsesRef.current = responses

  // Nạp câu trả lời đã lưu khi mở lại bài.
  const loadedFor = useRef<string | null>(null)
  useEffect(() => {
    if (query.data && loadedFor.current !== query.data.id) {
      loadedFor.current = query.data.id
      setResponses(Object.fromEntries(query.data.items.map((i) => [i.id, i.response])))
    }
  }, [query.data])

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    if (dirty.current.size === 0) return
    const ids = [...dirty.current]
    dirty.current.clear()
    try {
      await api(`/kid/attempts/${id}/answers`, {
        method: 'PUT',
        body: { answers: ids.map((itemId) => ({ itemId, response: responsesRef.current[itemId] ?? null })) },
      })
    } catch (err) {
      // Hết giờ / đã nộp: tải lại để hiện kết quả. Lỗi mạng: thử lại ở lần lưu sau.
      if (err instanceof ApiError && err.status === 409) {
        await queryClient.invalidateQueries({ queryKey: attemptKey(id) })
      } else {
        ids.forEach((i) => dirty.current.add(i))
      }
      throw err
    }
  }, [id, queryClient])

  const setResponse = useCallback(
    (itemId: string, response: unknown) => {
      setResponses((r) => ({ ...r, [itemId]: response }))
      dirty.current.add(itemId)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush().catch(() => {}), SAVE_DELAY_MS)
    },
    [flush],
  )

  const submit = useCallback(async () => {
    await flush().catch((err) => {
      if (!(err instanceof ApiError && err.status === 409)) throw err
    })
    const view = await api<AttemptView>(`/kid/attempts/${id}/submit`, { method: 'POST' })
    queryClient.setQueryData(attemptKey(id), view)
    await queryClient.invalidateQueries({ queryKey: ['kid', 'home'] })
    return view
  }, [flush, id, queryClient])

  // Rời trang thì lưu nốt.
  useEffect(() => () => void flush().catch(() => {}), [flush])

  return { query, responses, setResponse, submit, flush }
}
