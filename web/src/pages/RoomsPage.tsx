/**
 * Rooms are shared by every course, so each room is drawn once. Instructors
 * and proctors can add one; rows can have different numbers of seats.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Anchor, Button, Card, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import Layout from '../components/Layout'
import { api, errorMessage } from '../lib/api'
import { useLoad } from '../lib/hooks'
import type { Room, RoomSummary } from '../lib/types'

/** "8, 8, 10" -> three rows with 8, 8 and 10 seats. */
export function parseRowCounts(text: string): number[] | null {
  const counts = text.split(/[,\s]+/).filter(Boolean).map(Number)
  return counts.length > 0 && counts.every((n) => Number.isInteger(n) && n >= 1 && n <= 500) ? counts : null
}

export default function RoomsPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const rooms = useLoad(() => api.get<{ rooms: RoomSummary[] }>(`/rooms?q=${encodeURIComponent(q)}`), [q])
  const [form, setForm] = useState({ name: '', building: '', rows: '6, 6, 6, 6' })
  const [error, setError] = useState('')

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const counts = parseRowCounts(form.rows)
    if (!counts) { setError('Seats per row should be numbers separated by commas, e.g. 8, 8, 10'); return }
    try {
      const { room } = await api.post<{ room: Room }>('/rooms', {
        name: form.name, building: form.building || undefined, rows: counts.map((seats) => ({ seats })),
      })
      navigate(`/rooms/${room.id}`)
    } catch (err) { setError(errorMessage(err)) }
  }

  return (
    <Layout title="Rooms">
      <Stack gap="lg">
        <Card withBorder padding="md">
          <Title order={4} mb="sm">New room</Title>
          {error && <Alert color="red" mb="sm">{error}</Alert>}
          <form onSubmit={create}>
            <Stack gap="sm">
              <Group grow>
                <TextInput label="Room name" placeholder="BA 1130" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                <TextInput label="Building" placeholder="Bahen Centre" value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} />
              </Group>
              <TextInput
                label="Seats per row" description="Front row first, separated by commas. Rows can be different lengths."
                value={form.rows} onChange={(e) => setForm({ ...form, rows: e.target.value })} required
              />
              <Button type="submit">Create room</Button>
            </Stack>
          </form>
        </Card>
        <Card withBorder padding="md">
          <Title order={4} mb="sm">All rooms</Title>
          <TextInput placeholder="Search by room or building" aria-label="Search rooms" value={q} onChange={(e) => setQ(e.target.value)} mb="sm" />
          {rooms.error && <Alert color="red">{rooms.error}</Alert>}
          {rooms.data?.rooms.length === 0 && <Text size="sm" c="dimmed">No rooms yet.</Text>}
          <Stack gap={4}>
            {rooms.data?.rooms.map((r) => (
              <Group key={r.id} justify="space-between">
                <Anchor component={Link} to={`/rooms/${r.id}`}>{r.name}{r.building ? ` (${r.building})` : ''}</Anchor>
                <Text size="sm" c="dimmed">{r.capacity} seats</Text>
              </Group>
            ))}
          </Stack>
        </Card>
      </Stack>
    </Layout>
  )
}
