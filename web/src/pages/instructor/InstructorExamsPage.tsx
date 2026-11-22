import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Text, Title, TextInput, Card, Alert, Select, MultiSelect } from '@mantine/core'
import { clearToken, apiFetch } from '../../lib/api'

type Course = { id: string; code: string; name: string }
type Room = { id: string; name: string }
type Exam = { id: string; title: string; courseId: string; rooms?: { room: Room }[]; course?: { code: string; name: string } }

export default function InstructorExamsPage() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<Course[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [examTitle, setExamTitle] = useState('')
  const [examCourseId, setExamCourseId] = useState('')
  const [examRoomIds, setExamRoomIds] = useState<string[]>([])
  const [error, setError] = useState('')

  const logout = () => { clearToken(); navigate('/login') }

  useEffect(() => {
    apiFetch<{ courses: Course[] }>('/courses').then((r) => setCourses(r.courses)).catch(() => {})
    apiFetch<{ rooms: Room[] }>('/rooms').then((r) => setRooms(r.rooms)).catch(() => {})
    apiFetch<{ exams: Exam[] }>('/exams').then((r) => setExams(r.exams)).catch(() => {})
  }, [])

  const createExam = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await apiFetch('/exams', { method: 'POST', body: JSON.stringify({ courseId: examCourseId, roomIds: examRoomIds, title: examTitle }) })
      setExamTitle(''); setExamCourseId(''); setExamRoomIds([])
      const r = await apiFetch<{ exams: Exam[] }>('/exams'); setExams(r.exams)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create exam')
    }
  }
  const generateAssignments = async (examId: string) => {
    setError('')
    try {
      await apiFetch(`/exams/${examId}/generate`, { method: 'POST' })
      alert('Assignments generated!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate')
    }
  }

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>RollCall — Exams</Title>
          <Group>
            <Button variant="subtle" onClick={() => navigate('/instructor')}>Back</Button>
            <Button variant="subtle" onClick={logout}>Log out</Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="sm" py="xl">
          <Stack gap="lg">
            {error && <Alert color="red">{error}</Alert>}
            <Card withBorder padding="md">
              <Title order={4} mb="sm">Create exam</Title>
              <form onSubmit={createExam}>
                <Stack gap="sm">
                  <TextInput label="Exam title" placeholder="Midterm" value={examTitle} onChange={(e) => setExamTitle(e.target.value)} required />
                  <Select label="Course" placeholder="Select course" searchable data={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))} value={examCourseId || null} onChange={(v) => setExamCourseId(v || '')} required />
                  <MultiSelect label="Rooms" placeholder="Select one or more rooms" searchable data={rooms.map((r) => ({ value: r.id, label: r.name }))} value={examRoomIds} onChange={setExamRoomIds} />
                  <Button type="submit" disabled={examRoomIds.length === 0}>Create exam</Button>
                </Stack>
              </form>
            </Card>
            <Card withBorder padding="md">
              <Title order={4} mb="sm">Exams</Title>
              {exams.length === 0 && <Text c="dimmed" size="sm">No exams yet.</Text>}
              <Stack gap="xs">
                {exams.map((ex) => (
                  <div key={ex.id}>
                    <Group justify="space-between">
                      <Text size="sm">{ex.title} — {ex.course?.code || 'Course'} / {(ex.rooms || []).map((er) => er.room?.name).filter(Boolean).join(', ') || 'No rooms'}</Text>
                      <Button size="xs" onClick={() => generateAssignments(ex.id)}>Generate seats</Button>
                    </Group>
                    <Text size="xs" c="dimmed">Exam ID: {ex.id}</Text>
                  </div>
                ))}
              </Stack>
            </Card>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}