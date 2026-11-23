/**
 * Rooms are shared by every course, so each room is drawn once. Instructors
 * and proctors draw a new room on a grid so it looks like the real one.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Anchor, Button, Card, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import Layout from '../components/Layout'
import RoomBuilder, { gridToRows, makeGrid, usableCount, type Grid } from '../components/RoomBuilder'
import { api, errorMessage } from '../lib/api'
import { useLoad } from '../lib/hooks'
import type { Room, RoomSummary } from '../lib/types'

export default function RoomsPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const rooms = useLoad(() => api.get<{ rooms: RoomSummary[] }>(`/rooms?q=${encodeURIComponent(q)}`), [q])
  const [name, setName] = useState('')
  const [building, setBuilding] = useState('')
  const [grid, setGrid] = useState<Grid>(() => makeGrid(10, 10))
  const [error, setError] = useState('')

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (usableCount(grid) === 0) { setError('Add at least one seat'); return }
    try {
      const { room } = await api.post<{ room: Room }>('/rooms', { name, building: building || undefined, rows: gridToRows(grid) })
      navigate(`/rooms/${room.id}`)
    } catch (err) { setError(errorMessage(err)) }
  }

  return (
    <Layout title="Rooms" size="xl">
      <Stack gap="lg">
        <Card withBorder padding="md">
          <Title order={4} mb="sm">New room</Title>
          {error && <Alert color="red" mb="sm">{error}</Alert>}
          <form onSubmit={create}>
            <RoomBuilder
              grid={grid}
              onChange={setGrid}
              side={
                <>
                  <TextInput label="Room name" placeholder="BA 1130" value={name} onChange={(e) => setName(e.target.value)} required />
                  <TextInput label="Building" placeholder="Bahen Centre" value={building} onChange={(e) => setBuilding(e.target.value)} />
                </>
              }
              actions={<Button type="submit" fullWidth>Create room</Button>}
            />
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
