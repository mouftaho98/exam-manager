import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Text, Title, TextInput, Card, Alert, Textarea, Select } from '@mantine/core'
import { clearToken, apiFetch } from '../lib/api'

type Course = { id: string; code: string; name: string }
type Room = { id: string; name: string; _count?: { seats: number } }
type Exam = { id: string; title: string; courseId: string; roomId: string; course?: { code: string; name: string }; room?: { name: string } }

export default function InstructorPage() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<Course[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [csvText, setCsvText] = useState('')
  const [rosterMsg, setRosterMsg] = useState('')
  const [roster, setRoster] = useState<any[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomName, setRoomName] = useState('')
  const [roomRows, setRoomRows] = useState('5')
  const [roomCols, setRoomCols] = useState('6')
  const [exams, setExams] = useState<Exam[]>([])
  const [examTitle, setExamTitle] = useState('')
  const [examCourseId, setExamCourseId] = useState('')
  const [examRoomId, setExamRoomId] = useState('')

  const logout = () => {
    clearToken()
    navigate('/login')
  }

  const loadCourses = async () => {
    try {
      const res = await apiFetch<{ courses: Course[] }>('/courses')
      setCourses(res.courses)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load courses')
    }
  }
  const loadRooms = async () => {
    try {
      const res = await apiFetch<{ rooms: Room[] }>('/rooms')
      setRooms(res.rooms)
    } catch (err) {
      // ignore
    }
  }
  const loadExams = async () => {
    try {
      const res = await apiFetch<{ exams: Exam[] }>('/exams')
      setExams(res.exams)
    } catch (err) {
      // ignore
    }
  }
  const loadRoster = async (courseId: string) => {
    try {
      const res = await apiFetch<{ roster: any[] }>(`/courses/${courseId}/roster`)
      setRoster(res.roster)
    } catch (err) {
      setRoster([])
    }
  }

  useEffect(() => { loadCourses(); loadRooms(); loadExams() }, [])
  useEffect(() => {
    if (selectedCourse) loadRoster(selectedCourse)
    else setRoster([])
  }, [selectedCourse])

  const createCourse = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await apiFetch('/courses', { method: 'POST', body: JSON.stringify({ code, name }) })
      setCode(''); setName('')
      loadCourses()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create course')
    }
  }
  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await apiFetch('/rooms', {
        method: 'POST',
        body: JSON.stringify({ name: roomName, rows: parseInt(roomRows), cols: parseInt(roomCols) }),
      })
      setRoomName(''); setRoomRows('5'); setRoomCols('6')
      loadRooms()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room')
    }
  }
  const createExam = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await apiFetch('/exams', {
        method: 'POST',
        body: JSON.stringify({ courseId: examCourseId, roomId: examRoomId, title: examTitle }),
      })
      setExamTitle(''); setExamCourseId(''); setExamRoomId('')
      loadExams()
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

  const uploadRoster = async () => {
    if (!selectedCourse) return
    setRosterMsg('')
    try {
      const res = await apiFetch<{ added: number; total: number }>(`/courses/${selectedCourse}/roster`, {
        method: 'POST',
        body: csvText,
        headers: { 'Content-Type': 'text/csv' },
      })
      setRosterMsg(`Added ${res.added} of ${res.total} entries.`)
      setCsvText('')
      loadRoster(selectedCourse)
    } catch (err) {
      setRosterMsg(err instanceof Error ? err.message : 'Upload failed')
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
          <Stack gap="lg">
            <Title order={2}>Instructor</Title>
            {error && <Alert color="red">{error}</Alert>}
            <Card withBorder padding="md">
              <Title order={4} mb="sm">Create course</Title>
              <form onSubmit={createCourse}>
                <Stack gap="sm">
                  <TextInput label="Code" placeholder="e.g. ECE1779" value={code} onChange={(e) => setCode(e.target.value)} required />
                  <TextInput label="Name" placeholder="Course name" value={name} onChange={(e) => setName(e.target.value)} required />
                  <Button type="submit">Create</Button>
                </Stack>
              </form>
            </Card>
            <Card withBorder padding="md">
              <Title order={4} mb="sm">Your courses</Title>
              {courses.length === 0 && <Text c="dimmed" size="sm">No courses yet.</Text>}
              <Stack gap="xs">
                {courses.map((c) => (
                  <div key={c.id}>
                    <Button variant={selectedCourse === c.id ? 'filled' : 'light'} onClick={() => setSelectedCourse(c.id)} fullWidth>
                      {c.code} — {c.name}
                    </Button>
                    <Text size="xs" c="dimmed" mt={2}>ID: {c.id}</Text>
                  </div>
                ))}
              </Stack>
            </Card>
            <Card withBorder padding="md">
              <Title order={4} mb="sm">Rooms (seating maps)</Title>
              <form onSubmit={createRoom}>
                <Stack gap="sm">
                  <TextInput label="Room name" placeholder="e.g. EX100" value={roomName} onChange={(e) => setRoomName(e.target.value)} required />
                  <Group grow>
                    <TextInput label="Rows" type="number" value={roomRows} onChange={(e) => setRoomRows(e.target.value)} required />
                    <TextInput label="Cols" type="number" value={roomCols} onChange={(e) => setRoomCols(e.target.value)} required />
                  </Group>
                  <Button type="submit">Create room</Button>
                </Stack>
              </form>
              {rooms.length > 0 && (
                <Stack gap="xs" mt="md">
                  {rooms.map((r) => (
                    <div key={r.id}>
                      <Text size="sm">{r.name} ({r._count?.seats ?? 0} seats)</Text>
                      <Text size="xs" c="dimmed">ID: {r.id}</Text>
                    </div>
                  ))}
                </Stack>
              )}
            </Card>
            {selectedCourse && (
              <Card withBorder padding="md">
                <Title order={4} mb="sm">Upload roster (CSV: name,email)</Title>
                <Textarea placeholder={"John Doe,john@utoronto.ca\nJane Doe,jane@utoronto.ca"} value={csvText} onChange={(e) => setCsvText(e.target.value)} minRows={4} />
                <Button mt="sm" onClick={uploadRoster}>Upload</Button>
                {rosterMsg && <Text size="sm" mt="xs">{rosterMsg}</Text>}
                {roster.length > 0 && (
                  <>
                    <Title order={5} mt="md" mb="xs">Roster ({roster.length})</Title>
                    <Stack gap={4}>
                      {roster.map((r: any) => (
                        <Text key={r.id} size="sm">{r.name} — {r.email}{r.needsAccessible ? ' [Accessible]' : ''}{r.needsLeftHanded ? ' [Left-handed]' : ''}</Text>
                      ))}
                    </Stack>
                  </>
                )}
              </Card>
            )}
            <Card withBorder padding="md">
              <Title order={4} mb="sm">Exams</Title>
              <form onSubmit={createExam}>
                <Stack gap="sm">
                  <TextInput label="Exam title" placeholder="Midterm" value={examTitle} onChange={(e) => setExamTitle(e.target.value)} required />
                  <Select
                    label="Course"
                    placeholder="Select course"
                    data={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
                    value={examCourseId || null}
                    onChange={(v) => setExamCourseId(v || '')}
                    required
                  />
                  <Select
                    label="Room"
                    placeholder="Select room"
                    data={rooms.map((r) => ({ value: r.id, label: r.name }))}
                    value={examRoomId || null}
                    onChange={(v) => setExamRoomId(v || '')}
                    required
                  />
                  <Button type="submit">Create exam</Button>
                </Stack>
              </form>
              {exams.length > 0 && (
                <Stack gap="xs" mt="md">
                  {exams.map((ex) => (
                    <div key={ex.id}>
                      <Group justify="space-between">
                        <Text size="sm">{ex.title} — {ex.course?.code || 'Course'} / {ex.room?.name || 'Room'}</Text>
                        <Button size="xs" onClick={() => generateAssignments(ex.id)}>Generate seats</Button>
                      </Group>
                      <Text size="xs" c="dimmed">Exam ID: {ex.id}</Text>
                    </div>
                  ))}
                </Stack>
              )}
            </Card>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}