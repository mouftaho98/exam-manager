import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Text, Title, TextInput, Card, Alert, Textarea } from '@mantine/core'
import { clearToken, apiFetch } from '../lib/api'

type Course = { id: string; code: string; name: string }

export default function InstructorPage() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<Course[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [csvText, setCsvText] = useState('')
  const [rosterMsg, setRosterMsg] = useState('')

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

  useEffect(() => { loadCourses() }, [])

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
                  <Button key={c.id} variant={selectedCourse === c.id ? 'filled' : 'light'} onClick={() => setSelectedCourse(c.id)}>
                    {c.code} — {c.name}
                  </Button>
                ))}
              </Stack>
            </Card>
            {selectedCourse && (
              <Card withBorder padding="md">
                <Title order={4} mb="sm">Upload roster (CSV: name,email)</Title>
                <Textarea placeholder={"John Doe,john@utoronto.ca\nJane Doe,jane@utoronto.ca"} value={csvText} onChange={(e) => setCsvText(e.target.value)} minRows={4} />
                <Button mt="sm" onClick={uploadRoster}>Upload</Button>
                {rosterMsg && <Text size="sm" mt="xs">{rosterMsg}</Text>}
              </Card>
            )}
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}