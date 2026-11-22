import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Text, Title, TextInput, PasswordInput, Select, Alert } from '@mantine/core'
import { apiFetch, setToken } from '../lib/api'

export default function SignupPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<string | null>('STUDENT')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!role) { setError('Please select a role'); return }
    setLoading(true)
    try {
      const res = await apiFetch<{ token: string; user: { role: string } }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, name, role }),
      })
      setToken(res.token)
      const r = res.user.role.toLowerCase()
      if (r === 'student') navigate('/student')
      else if (r === 'proctor') navigate('/proctor')
      else navigate('/instructor')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
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
            <Title order={2}>Sign up</Title>
            {error && <Alert color="red">{error}</Alert>}
            <form onSubmit={handleSubmit}>
              <Stack gap="sm">
                <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
                <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <PasswordInput label="Password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                <Select
                  label="Role"
                  value={role}
                  onChange={setRole}
                  data={[
                    { value: 'STUDENT', label: 'Student' },
                    { value: 'PROCTOR', label: 'Proctor' },
                    { value: 'INSTRUCTOR', label: 'Instructor' },
                  ]}
                  required
                />
                <Button type="submit" loading={loading} fullWidth>Sign up</Button>
              </Stack>
            </form>
            <Text size="sm" c="dimmed">
              Already have an account? <Button variant="subtle" p={0} onClick={() => navigate('/login')}>Log in</Button>
            </Text>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
