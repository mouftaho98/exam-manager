import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Title, TextInput, Alert } from '@mantine/core'
import { clearToken, apiFetch } from '../lib/api'

export default function ProctorPage() {
  const navigate = useNavigate()
  const [examId, setExamId] = useState('')
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const logout = () => {
    clearToken()
    navigate('/login')
  }
  const checkIn = async () => {
    setMsg(''); setError('')
    try {
      const res = await apiFetch<{ assignment: any }>(`/exams/${examId}/checkin`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      setMsg(`Checked in: ${res.assignment.rosterEntry?.name} at seat ${res.assignment.seat?.label}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed')
    }
  }
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>RollCall</Title>
          <Button variant="subtle" onClick={logout}>Log out</Button>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="sm" py="xl">
          <Stack gap="md">
            <Title order={2}>Proctor check-in</Title>
            <TextInput label="Exam ID" value={examId} onChange={(e) => setExamId(e.target.value)} placeholder="paste exam id" />
            <TextInput label="Student email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@..." />
            <Button onClick={checkIn}>Check in student</Button>
            {msg && <Alert color="green">{msg}</Alert>}
            {error && <Alert color="red">{error}</Alert>}
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
