/**
 * Home for signed-in users: upcoming exams (as a student), the offerings
 * they're in with their role, instructor access, and their seating needs.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Anchor, Badge, Button, Card, Group, Stack, Switch, Text, Title } from '@mantine/core'
import Layout from '../components/Layout'
import { api, errorMessage } from '../lib/api'
import { formatWhen, roleLabel } from '../lib/format'
import { useLoad, useMe } from '../lib/hooks'
import type { MyExam, User } from '../lib/types'

export default function DashboardPage() {
  const me = useMe()
  const exams = useLoad(() => api.get<{ exams: MyExam[] }>('/me/exams'))
  const [error, setError] = useState('')
  const user = me.user

  const updateMe = async (patch: Partial<User>) => {
    setError('')
    try {
      const res = await api.patch<{ user: User }>('/me', patch)
      me.setData((d) => (d ? { ...d, user: res.user } : d))
    } catch (e) { setError(errorMessage(e)) }
  }
  const requestInstructor = async () => {
    setError('')
    try {
      await api.post('/me/instructor-request')
      me.reload()
    } catch (e) { setError(errorMessage(e)) }
  }

  return (
    <Layout title={user ? `Hi, ${user.firstName ?? user.name}` : 'Dashboard'}>
      <Stack gap="lg">
        {(error || me.error) && <Alert color="red">{error || me.error}</Alert>}

        <Card withBorder padding="md">
          <Title order={4} mb="sm">My exams</Title>
          {exams.data?.exams.length === 0 && <Text c="dimmed" size="sm">No exams yet. They'll show up here once you're on a course roster.</Text>}
          <Stack gap="xs">
            {exams.data?.exams.map((ex) => (
              <Card key={ex.id} withBorder padding="sm" data-testid="my-exam">
                <Group justify="space-between" wrap="wrap">
                  <div>
                    <Anchor component={Link} to={`/exams/${ex.id}`} fw={600}>{ex.title}</Anchor>
                    <Text size="sm" c="dimmed">{ex.offering.course.code} · {ex.offering.term} · {formatWhen(ex.startsAt)} · {ex.durationMinutes} min</Text>
                  </div>
                  <Stack gap={2} align="flex-end">
                    {ex.seat && ex.room
                      ? <Text size="sm">{ex.room.name}, seat <b>{ex.seat.label}</b></Text>
                      : <Text size="sm" c="dimmed">Seat not assigned yet</Text>}
                    {ex.checkedInAt && <Badge color="green">Checked in</Badge>}
                  </Stack>
                </Group>
              </Card>
            ))}
          </Stack>
        </Card>

        <Card withBorder padding="md">
          <Title order={4} mb="sm">My courses</Title>
          {me.offerings.length === 0 && <Text c="dimmed" size="sm">You haven't joined any courses yet. Use the invite link from your instructor.</Text>}
          <Stack gap="xs">
            {me.offerings.map((o) => (
              <Group key={o.id} justify="space-between">
                <Anchor component={Link} to={`/offerings/${o.id}`}>{o.course.code} — {o.course.name} ({o.term})</Anchor>
                <Badge variant="light">{roleLabel(o.role)}</Badge>
              </Group>
            ))}
          </Stack>
        </Card>

        {user && (
          <Card withBorder padding="md">
            <Title order={4} mb="sm">Teaching</Title>
            {user.instructorStatus === 'APPROVED' && (
              <Group justify="space-between">
                <Text size="sm">You're an approved instructor.</Text>
                <Button component={Link} to="/courses" size="xs">Manage courses</Button>
              </Group>
            )}
            {user.instructorStatus === 'PENDING' && <Text size="sm">Your instructor request is waiting for an admin to approve it.</Text>}
            {(user.instructorStatus === 'NONE' || user.instructorStatus === 'REJECTED') && (
              <Group justify="space-between">
                <Text size="sm">{user.instructorStatus === 'REJECTED' ? 'Your last instructor request was turned down.' : 'Teaching a course?'}</Text>
                <Button size="xs" variant="light" onClick={requestInstructor}>Request instructor access</Button>
              </Group>
            )}
          </Card>
        )}

        {user && (
          <Card withBorder padding="md">
            <Title order={4} mb="xs">My seating needs</Title>
            <Text size="sm" c="dimmed" mb="sm">Used when seats are assigned for your exams. Only you can change these.</Text>
            <Stack gap="xs">
              <Switch label="I need an accessible seat" checked={user.needsAccessible} onChange={(e) => updateMe({ needsAccessible: e.currentTarget.checked })} />
              <Switch label="I'm left-handed" checked={user.leftHanded} onChange={(e) => updateMe({ leftHanded: e.currentTarget.checked })} />
            </Stack>
          </Card>
        )}
      </Stack>
    </Layout>
  )
}
