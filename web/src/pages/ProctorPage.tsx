import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Title, TextInput, Alert, Text, Card } from '@mantine/core'
import { clearToken, apiFetch } from '../lib/api'
import { io } from 'socket.io-client'

export default function ProctorPage() {
  const navigate = useNavigate()
  const [examId, setExamId] = useState('')
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [assignments, setAssignments] = useState<any[]>([])

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

  const loadAssignments = async () => {
    if (!examId) return
    try {
      const res = await apiFetch<{ assignments: any[] }>(`/exams/${examId}/assignments`)
      setAssignments(res.assignments)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignments')
    }
  }

  useEffect(() => {
    if (!examId) return
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const s = io(API_URL)
    s.emit('joinExam', examId)
    s.on('checkin', (updated: any) => {
      setAssignments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
    })
    loadAssignments()
    return () => { s.disconnect() }
  }, [examId])

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
            <Title order={2}>Proctor</Title>
            <TextInput label="Exam ID" value={examId} onChange={(e) => setExamId(e.target.value)} placeholder="paste exam id" />
            <Card withBorder padding="md">
              <Title order={4} mb="sm">Check-in</Title>
              <Stack gap="sm">
                <TextInput label="Student email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@..." />
                <Button onClick={checkIn}>Check in student</Button>
              </Stack>
              {msg && <Alert color="green" mt="sm">{msg}</Alert>}
              {error && <Alert color="red" mt="sm">{error}</Alert>}
            </Card>
            <Card withBorder padding="md">
              <Title order={4} mb="sm">Live dashboard</Title>
              <Text size="sm" c="dimmed" mb="sm">Enter Exam ID above to load and watch live check-ins.</Text>
              {assignments.length === 0 && <Text size="sm" c="dimmed">No assignments loaded.</Text>}
              <Stack gap="xs">
                {assignments.map((a) => (
                  <Group key={a.id} justify="space-between">
                    <Text size="sm">{a.rosterEntry?.name} ({a.seat?.label})</Text>
                    <Text size="sm" c={a.checkedIn ? 'green' : 'red'}>{a.checkedIn ? 'Checked in' : 'Missing'}</Text>
                  </Group>
                ))}
              </Stack>
            </Card>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
