import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Text, Title, TextInput, PasswordInput, Alert } from '@mantine/core'
import { apiFetch, setToken } from '../lib/api'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await apiFetch<{ token: string; user: { role: string } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setToken(res.token)
      const role = res.user.role.toLowerCase()
      if (role === 'student') navigate('/student')
      else if (role === 'proctor') navigate('/proctor')
      else navigate('/instructor')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>RollCall</Title>
          <Button variant="subtle" onClick={() => navigate('/')}>Home</Button>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xs" py="xl">
          <Stack gap="md">
            <Title order={2}>Log in</Title>
            {error && <Alert color="red">{error}</Alert>}
            <form onSubmit={handleSubmit}>
              <Stack gap="sm">
                <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <PasswordInput label="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <Button type="submit" loading={loading} fullWidth>Log in</Button>
              </Stack>
            </form>
            <Text size="sm" c="dimmed">
              No account? <Button variant="subtle" p={0} onClick={() => navigate('/signup')}>Sign up</Button>
            </Text>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
