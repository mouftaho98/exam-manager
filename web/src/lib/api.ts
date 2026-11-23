/**
 * Talking to the RollCall API. Every request goes through `request`, which
 * adds the login token and turns error responses into an ApiError.
 */
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/** An error response from the API: `{ error: { code, message, details } }`. */
export class ApiError extends Error {
  status: number
  code: string
  details: any
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const getToken = () => localStorage.getItem('token')
export const setToken = (token: string) => localStorage.setItem('token', token)
export const clearToken = () => localStorage.removeItem('token')

async function request<T>(method: string, path: string, body?: unknown, contentType = 'application/json'): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = contentType
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : String(body),
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))

  // A 401 with a token means the session expired: sign out and go to login.
  // Without a token (e.g. a wrong password) it's a normal error to show.
  if (res.status === 401 && token) {
    clearToken()
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
    throw new ApiError(401, 'unauthorized', 'Your session expired. Please log in again.')
  }
  if (!res.ok) {
    const e = data?.error ?? {}
    throw new ApiError(res.status, e.code ?? 'error', e.message ?? 'Something went wrong', e.details)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T = void>(path: string) => request<T>('DELETE', path),
  /** Upload CSV text (roster files). */
  csv: <T>(path: string, text: string) => request<T>('POST', path, text, 'text/csv'),
}

/** Message to show for any thrown error. */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')
