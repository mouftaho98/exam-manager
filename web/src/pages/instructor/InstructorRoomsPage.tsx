import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Text, Title, TextInput, Card, Alert } from '@mantine/core'
import { clearToken, apiFetch } from '../../lib/api'

type Room = { id: string; name: string; _count?: { seats: number } }

export default function InstructorRoomsPage() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomName, setRoomName] = useState('')
  const [roomRows, setRoomRows] = useState('5')
  const [roomCols, setRoomCols] = useState('6')
  const [error, setError] = useState('')

  const logout = () => { clearToken(); navigate('/login') }

  const loadRooms = async () => {
    try {
      const res = await apiFetch<{ rooms: Room[] }>('/rooms')
      setRooms(res.rooms)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rooms')
    }
  }
  useEffect(() => { loadRooms() }, [])

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await apiFetch('/rooms', { method: 'POST', body: JSON.stringify({ name: roomName, rows: parseInt(roomRows), cols: parseInt(roomCols) }) })
      setRoomName(''); setRoomRows('5'); setRoomCols('6')
      loadRooms()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room')
    }
  }

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>RollCall — Rooms</Title>
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
              <Title order={4} mb="sm">Create room</Title>
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
            </Card>
            <Card withBorder padding="md">
              <Title order={4} mb="sm">Rooms</Title>
              {rooms.length === 0 && <Text c="dimmed" size="sm">No rooms yet.</Text>}
              <Stack gap="xs">
                {rooms.map((r) => (
                  <div key={r.id}>
                    <Text size="sm">{r.name} ({r._count?.seats ?? 0} seats)</Text>
                    <Text size="xs" c="dimmed">ID: {r.id}</Text>
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
