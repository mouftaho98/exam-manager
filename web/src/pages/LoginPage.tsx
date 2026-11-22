/** Log in, then go back to where the user was headed (`?next=`) or the dashboard. */
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { api, errorMessage, setToken } from '../lib/api'
import PublicFrame from './PublicFrame'

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/dashboard'
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post<{ token: string }>('/auth/login', { email, password })
      setToken(res.token)
      navigate(next, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicFrame>
      <Stack gap="md">
        <Title order={2}>Log in</Title>
        {error && <Alert color="red">{error}</Alert>}
        <form onSubmit={submit}>
          <Stack gap="sm">
            <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <PasswordInput label="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" loading={loading} fullWidth>Log in</Button>
          </Stack>
        </form>
        <Text size="sm" c="dimmed">
          No account? <Anchor component={Link} to={`/signup?${params.toString()}`}>Sign up</Anchor>
        </Text>
      </Stack>
    </PublicFrame>
  )
}
