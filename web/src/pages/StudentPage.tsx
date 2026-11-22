import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Text, Title, TextInput, Card, Alert } from '@mantine/core'
import { clearToken, apiFetch } from '../lib/api'

export default function StudentPage() {
  const navigate = useNavigate()
  const [examId, setExamId] = useState('')
  const [assignment, setAssignment] = useState<any>(null)
  const [error, setError] = useState('')
  const logout = () => {
    clearToken()
    navigate('/login')
  }
  const fetchAssignment = async () => {
    setError('')
    setAssignment(null)
    try {
      const res = await apiFetch<{ assignment: any }>(`/exams/${examId}/my-assignment`)
      setAssignment(res.assignment)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not found')
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
            <Title order={2}>Student</Title>
            <Text c="dimmed">Enter your Exam ID to view your seat assignment.</Text>
            <TextInput label="Exam ID" value={examId} onChange={(e) => setExamId(e.target.value)} placeholder="paste exam id" />
            <Button onClick={fetchAssignment}>Find my seat</Button>
            {error && <Alert color="red">{error}</Alert>}
            {assignment && (
              <Card withBorder padding="md">
                <Text fw={700}>Course: {assignment.exam?.course?.name}</Text>
                <Text>Room: {assignment.exam?.room?.name}</Text>
                <Text>Seat: {assignment.seat?.label} ({assignment.seat?.seatType})</Text>
                <Text>Checked in: {assignment.checkedIn ? 'Yes' : 'No'}</Text>
              </Card>
            )}
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
