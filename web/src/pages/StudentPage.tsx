import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Text, Title, Card, Alert, Select } from '@mantine/core'
import { clearToken, apiFetch } from '../lib/api'

export default function StudentPage() {
  const navigate = useNavigate()
  const [assignments, setAssignments] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const logout = () => {
    clearToken()
    navigate('/login')
  }

  useEffect(() => {
    apiFetch<{ assignments: any[] }>('/exams/my/list')
      .then((res) => setAssignments(res.assignments))
      .catch(() => setError('Could not load your exams'))
  }, [])

  const selected = assignments.find((a) => a.exam?.id === selectedId) || null

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
            <Title order={2}>Student</Title>
            <Text c="dimmed">Select an exam to view your seat assignment.</Text>
            {error && <Alert color="red">{error}</Alert>}
            <Select
              label="Your exams"
              placeholder={assignments.length ? "Select an exam" : "No exams found"}
              data={assignments.map((a: any) => ({
                value: a.exam?.id || '',
                label: `${a.exam?.title || 'Exam'} — ${a.exam?.course?.code || ''} (${(a.exam?.rooms || []).map((er: any) => er.room?.name).join(', ') || a.seat?.room?.name || ''})`,
              }))}
              value={selectedId}
              onChange={setSelectedId}
              disabled={assignments.length === 0}
            />
            {selected && (
              <Card withBorder padding="md">
                <Text fw={700}>Course: {selected.exam?.course?.name}</Text>
                <Text>Room: {selected.seat?.room?.name || (selected.exam?.rooms || []).map((er: any) => er.room?.name).join(', ')}</Text>
                <Text>Seat: {selected.seat?.label} ({selected.seat?.seatType})</Text>
                <Text>Checked in: {selected.checkedIn ? 'Yes' : 'No'}</Text>
              </Card>
            )}
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
