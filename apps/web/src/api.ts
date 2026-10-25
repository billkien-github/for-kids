export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`)
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text()
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}
