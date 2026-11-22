const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    localStorage.removeItem('token')
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new Error('Session expired. Please log in again.')
  }
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Request failed')
  }
  return data as T
}

export function setToken(token: string) {
  localStorage.setItem('token', token)
}
export function getToken() {
  return localStorage.getItem('token')
}
export function clearToken() {
  localStorage.removeItem('token')
}
