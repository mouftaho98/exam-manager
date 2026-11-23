/**
 * Approved instructors find or create a course (the catalog entry), then
 * open it to add an offering for a term.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Anchor, Button, Card, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import Layout from '../components/Layout'
import { ApiError, api, errorMessage } from '../lib/api'
import { useLoad } from '../lib/hooks'
import type { Course } from '../lib/types'

export default function CoursesPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const list = useLoad(() => api.get<{ courses: Course[] }>(`/courses?q=${encodeURIComponent(q)}`), [q])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<{ message: string; courseId?: string } | null>(null)

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const { course } = await api.post<{ course: Course }>('/courses', { code, name })
      navigate(`/courses/${course.id}`)
    } catch (err) {
      // The code is taken: point them at the existing course instead.
      const courseId = err instanceof ApiError && err.code === 'course_exists' ? err.details?.courseId : undefined
      setError({ message: errorMessage(err), courseId })
    }
  }

  return (
    <Layout title="Courses">
      <Stack gap="lg">
        <Card withBorder padding="md">
          <Title order={4} mb="sm">New course</Title>
          {error && (
            <Alert color="red" mb="sm">
              {error.message}{' '}
              {error.courseId && <Anchor component={Link} to={`/courses/${error.courseId}`}>Open it</Anchor>}
            </Alert>
          )}
          <form onSubmit={create}>
            <Group align="flex-end" grow>
              <TextInput label="Code" placeholder="ECE1779" value={code} onChange={(e) => setCode(e.target.value)} required />
              <TextInput label="Name" placeholder="Introduction to Cloud Computing" value={name} onChange={(e) => setName(e.target.value)} required />
              <Button type="submit" style={{ flexGrow: 0 }}>Create course</Button>
            </Group>
          </form>
        </Card>
        <Card withBorder padding="md">
          <Title order={4} mb="sm">All courses</Title>
          <TextInput placeholder="Search by code or name" value={q} onChange={(e) => setQ(e.target.value)} mb="sm" aria-label="Search courses" />
          {list.data?.courses.length === 0 && <Text size="sm" c="dimmed">No courses found.</Text>}
          <Stack gap={4}>
            {list.data?.courses.map((c) => (
              <Anchor key={c.id} component={Link} to={`/courses/${c.id}`}>{c.code} — {c.name}</Anchor>
            ))}
          </Stack>
        </Card>
      </Stack>
    </Layout>
  )
}
