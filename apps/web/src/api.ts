import type { ApiErrorBody, Me } from '@for-kids/shared'
import { useQuery } from '@tanstack/react-query'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message ?? body.error)
  }
}

export async function api<T>(path: string, init?: Omit<RequestInit, 'body'> & { body?: unknown }): Promise<T> {
  const hasBody = init?.body !== undefined
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { ...(hasBody ? { 'content-type': 'application/json' } : {}), ...init?.headers },
    body: hasBody ? JSON.stringify(init.body) : undefined,
  })
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : { error: await res.text() }
  if (!res.ok) throw new ApiError(res.status, body as ApiErrorBody)
  return body as T
}

export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body })

/** Thông báo lỗi dễ hiểu cho người dùng. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429 && err.body.retryAfterSec) {
      return `Thử sai nhiều quá, đợi ${Math.ceil(err.body.retryAfterSec / 60)} phút nữa nhé`
    }
    if (err.body.issues?.length) return err.body.issues.map((i) => `${i.path}: ${i.message}`).join('; ')
    return err.body.message ?? err.body.error
  }
  return 'Không kết nối được máy chủ'
}

export const meQueryKey = ['me'] as const

export const useMe = () =>
  useQuery({
    queryKey: meQueryKey,
    queryFn: () => api<Me>('/auth/me'),
    retry: false,
    staleTime: 30_000,
  })
