/** One course: its offerings by term, and adding a new offering. */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, Anchor, Badge, Button, Card, Group, NumberInput, Select, Stack, Text, Title } from '@mantine/core'
import Layout from '../components/Layout'
import { ApiError, api, errorMessage } from '../lib/api'
import { roleLabel } from '../lib/format'
import { useLoad } from '../lib/hooks'
import type { Course, Offering, Role, Semester } from '../lib/types'

export default function CoursePage() {
  const { courseId = '' } = useParams()
  const navigate = useNavigate()
  const course = useLoad(() => api.get<{ course: Course; offerings: (Offering & { myRole: Role | null })[] }>(`/courses/${courseId}`), [courseId])
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [semester, setSemester] = useState<Semester>('FALL')
  const [error, setError] = useState<{ message: string; offeringId?: string } | null>(null)

  const addOffering = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const { offering } = await api.post<{ offering: Offering }>(`/courses/${courseId}/offerings`, { year, semester })
      navigate(`/offerings/${offering.id}`)
    } catch (err) {
      const offeringId = err instanceof ApiError && err.code === 'offering_exists' ? err.details?.offeringId : undefined
      setError({ message: errorMessage(err), offeringId })
    }
  }

  const c = course.data?.course
  return (
    <Layout title={c ? `${c.code} — ${c.name}` : 'Course'}>
      <Stack gap="lg">
        {course.error && <Alert color="red">{course.error}</Alert>}
        <Card withBorder padding="md">
          <Title order={4} mb="sm">Offerings</Title>
          {course.data?.offerings.length === 0 && <Text size="sm" c="dimmed">No offerings yet.</Text>}
          <Stack gap={4}>
            {course.data?.offerings.map((o) => (
              <Group key={o.id} justify="space-between">
                {o.myRole ? <Anchor component={Link} to={`/offerings/${o.id}`}>{o.term}</Anchor> : <Text>{o.term}</Text>}
                {o.myRole && <Badge variant="light">{roleLabel(o.myRole)}</Badge>}
              </Group>
            ))}
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Title order={4} mb="sm">Add an offering</Title>
          <Text size="sm" c="dimmed" mb="sm">You'll be its instructor. You can invite co-instructors after.</Text>
          {error && (
            <Alert color="red" mb="sm">
              {error.message}{' '}
              {error.offeringId && <Anchor component={Link} to={`/offerings/${error.offeringId}`}>Open it</Anchor>}
            </Alert>
          )}
          <form onSubmit={addOffering}>
            <Group align="flex-end" grow>
              <Select label="Semester" value={semester} onChange={(v) => setSemester((v as Semester) ?? 'FALL')} allowDeselect={false}
                data={[{ value: 'WINTER', label: 'Winter' }, { value: 'SUMMER', label: 'Summer' }, { value: 'FALL', label: 'Fall' }]} />
              <NumberInput label="Year" value={year} onChange={(v) => setYear(Number(v))} min={2000} max={2100} />
              <Button type="submit" style={{ flexGrow: 0 }}>Add offering</Button>
            </Group>
          </form>
        </Card>
      </Stack>
    </Layout>
  )
}
