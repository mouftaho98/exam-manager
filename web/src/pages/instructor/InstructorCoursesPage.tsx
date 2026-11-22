import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Text, Title, TextInput, Card, Alert, Textarea } from '@mantine/core'
import { clearToken, apiFetch } from '../../lib/api'

type Course = { id: string; code: string; name: string }

export default function InstructorCoursesPage() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<Course[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [csvText, setCsvText] = useState('')
  const [rosterMsg, setRosterMsg] = useState('')
  const [roster, setRoster] = useState<any[]>([])

  const logout = () => { clearToken(); navigate('/login') }

  const loadCourses = async () => {
    try {
      const res = await apiFetch<{ courses: Course[] }>('/courses')
      setCourses(res.courses)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load courses')
    }
  }
  const loadRoster = async (courseId: string) => {
    try {
      const res = await apiFetch<{ roster: any[] }>(`/courses/${courseId}/roster`)
      setRoster(res.roster)
    } catch { setRoster([]) }
  }
  useEffect(() => { loadCourses() }, [])
  useEffect(() => { if (selectedCourse) loadRoster(selectedCourse); else setRoster([]) }, [selectedCourse])

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
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCsvText(String(reader.result || ''))
      setRosterMsg('')
    }
    reader.onerror = () => setRosterMsg('Failed to read file')
    reader.readAsText(file)
  }

  const uploadRoster = async () => {
    if (!selectedCourse) return
    if (!csvText.trim()) { setRosterMsg('Choose a CSV file or paste CSV text first.'); return }
    setRosterMsg('')
    try {
      const res = await apiFetch<{ added: number; total: number }>(`/courses/${selectedCourse}/roster`, {
        method: 'POST', body: csvText, headers: { 'Content-Type': 'text/csv' },
      })
      setRosterMsg(`Added ${res.added} of ${res.total} entries.`)
      setCsvText('')
      loadRoster(selectedCourse)
    } catch (err) {
      setRosterMsg(err instanceof Error ? err.message : 'Upload failed')
    }
  }
  const updateRosterEntry = async (entryId: string, field: 'needsAccessible' | 'needsLeftHanded' | 'name' | 'email', value: boolean | string) => {
    if (!selectedCourse) return
    try {
      await apiFetch(`/courses/${selectedCourse}/roster/${entryId}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) })
      loadRoster(selectedCourse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    }
  }
  const deleteRosterEntry = async (entryId: string) => {
    if (!selectedCourse) return
    try {
      await apiFetch(`/courses/${selectedCourse}/roster/${entryId}`, { method: 'DELETE' })
      loadRoster(selectedCourse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>RollCall — Courses</Title>
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
            {selectedCourse && (
              <Card withBorder padding="md">
                <Title order={4} mb="sm">Upload roster (CSV)</Title>
                <Text size="sm" c="dimmed" mb="xs">Choose a CSV file from your computer, or paste below.</Text>
                <input type="file" accept=".csv,text/csv" onChange={handleFileChange} style={{ marginBottom: 8 }} />
                <Textarea placeholder={"name,email,needsAccessible,needsLeftHanded\nJohn Doe,john@utoronto.ca,false,false"} value={csvText} onChange={(e) => setCsvText(e.target.value)} minRows={4} />
                <Button mt="sm" onClick={uploadRoster} disabled={!csvText.trim()}>Upload</Button>
                {rosterMsg && <Text size="sm" mt="xs">{rosterMsg}</Text>}
                {roster.length > 0 && (
                  <>
                    <Title order={5} mt="md" mb="xs">Roster ({roster.length})</Title>
                    <Stack gap={4}>
                      {roster.map((r: any) => (
                        <div key={r.id}>
                          <Text size="sm">{r.name} — {r.email}</Text>
                          <Group gap="xs">
                            <Button size="xs" variant={r.needsAccessible ? 'filled' : 'light'} onClick={() => updateRosterEntry(r.id, 'needsAccessible', !r.needsAccessible)}>Accessible</Button>
                            <Button size="xs" variant={r.needsLeftHanded ? 'filled' : 'light'} onClick={() => updateRosterEntry(r.id, 'needsLeftHanded', !r.needsLeftHanded)}>Left-handed</Button>
                            <Button size="xs" variant="light" onClick={() => { const v = window.prompt('Name', r.name); if (v && v !== r.name) updateRosterEntry(r.id, 'name', v); }}>Edit name</Button>
                            <Button size="xs" variant="light" onClick={() => { const v = window.prompt('Email', r.email); if (v && v !== r.email) updateRosterEntry(r.id, 'email', v); }}>Edit email</Button>
                            <Button size="xs" color="red" variant="light" onClick={() => { if (window.confirm('Delete this entry?')) deleteRosterEntry(r.id); }}>Delete</Button>
                          </Group>
                        </div>
                      ))}
                    </Stack>
                  </>
                )}
              </Card>
            )}
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
