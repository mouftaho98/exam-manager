/**
 * Create an account. Anyone can ask to teach; an admin approves it before
 * they can create courses. Seating needs are the student's own to set.
 */
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Anchor, Button, Checkbox, Group, PasswordInput, Stack, Switch, Text, TextInput, Title } from '@mantine/core'
import { api, errorMessage, setToken } from '../lib/api'
import PublicFrame from './PublicFrame'

export default function SignupPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/dashboard'
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: params.get('email') ?? '', password: '',
    wantsToTeach: false, needsAccessible: false, leftHanded: false,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post<{ token: string }>('/auth/register', form)
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
        <Title order={2}>Sign up</Title>
        {error && <Alert color="red">{error}</Alert>}
        <form onSubmit={submit}>
          <Stack gap="sm">
            <Group grow>
              <TextInput label="First name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
              <TextInput label="Last name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required />
            </Group>
            <TextInput label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
            <PasswordInput label="Password (at least 8 characters)" value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={8} />
            <Checkbox
              label="I'm an instructor (an admin will approve this)"
              checked={form.wantsToTeach}
              onChange={(e) => set('wantsToTeach', e.currentTarget.checked)}
            />
            <Text size="sm" fw={500} mt="xs">Exam seating needs</Text>
            <Switch label="I need an accessible seat" checked={form.needsAccessible} onChange={(e) => set('needsAccessible', e.currentTarget.checked)} />
            <Switch label="I'm left-handed" checked={form.leftHanded} onChange={(e) => set('leftHanded', e.currentTarget.checked)} />
            <Button type="submit" loading={loading} fullWidth mt="sm">Sign up</Button>
          </Stack>
        </form>
        <Text size="sm" c="dimmed">
          Already have an account? <Anchor component={Link} to={`/login?${params.toString()}`}>Log in</Anchor>
        </Text>
      </Stack>
    </PublicFrame>
  )
}
