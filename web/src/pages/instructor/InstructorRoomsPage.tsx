import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Text, Title, TextInput, Card, Alert, Badge } from '@mantine/core'
import { clearToken, apiFetch } from '../../lib/api'

type Room = { id: string; name: string; _count?: { seats: number } }
type Seat = { id: string; row: number; col: number; label: string | null; seatType: string }

const SEAT_CYCLE = ['NORMAL', 'ACCESSIBLE', 'LEFT_HANDED', 'BROKEN'] as const

export default function InstructorRoomsPage() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomName, setRoomName] = useState('')
  const [roomRows, setRoomRows] = useState('5')
  const [roomCols, setRoomCols] = useState('6')
  const [error, setError] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<{ id: string; name: string; seats: Seat[] } | null>(null)

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

  const loadRoomSeats = async (roomId: string) => {
    try {
      const res = await apiFetch<{ room: { id: string; name: string; seats: Seat[] } }>(`/rooms/${roomId}`)
      setSelectedRoom({ id: res.room.id, name: res.room.name, seats: res.room.seats })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load room details')
    }
  }

  const cycleSeatType = async (seat: Seat) => {
    if (!selectedRoom) return
    const idx = SEAT_CYCLE.indexOf(seat.seatType as any)
    const next = SEAT_CYCLE[(idx + 1) % SEAT_CYCLE.length]
    try {
      await apiFetch(`/rooms/${selectedRoom.id}/seats/${seat.id}`, { method: 'PATCH', body: JSON.stringify({ seatType: next }) })
      setSelectedRoom({ ...selectedRoom, seats: selectedRoom.seats.map((s) => s.id === seat.id ? { ...s, seatType: next } : s) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update seat')
    }
  }

  const seatColor = (t: string) => t === 'ACCESSIBLE' ? 'blue' : t === 'LEFT_HANDED' ? 'violet' : t === 'BROKEN' ? 'red' : 'gray'

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
                  <Group key={r.id} justify="space-between">
                    <div>
                      <Text size="sm">{r.name} ({r._count?.seats ?? 0} seats)</Text>
                      <Text size="xs" c="dimmed">ID: {r.id}</Text>
                    </div>
                    <Button size="xs" variant="light" onClick={() => loadRoomSeats(r.id)}>View/Edit seats</Button>
                  </Group>
                ))}
              </Stack>
            </Card>
            {selectedRoom && (
              <Card withBorder padding="md">
                <Group justify="space-between" mb="sm">
                  <Title order={4}>Seats: {selectedRoom.name}</Title>
                  <Button size="xs" variant="subtle" onClick={() => setSelectedRoom(null)}>Close</Button>
                </Group>
                <Text size="sm" c="dimmed" mb="sm">Click a seat to cycle: NORMAL → ACCESSIBLE → LEFT_HANDED → BROKEN → NORMAL</Text>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 8 }}>
                  {selectedRoom.seats.map((s) => (
                    <Button key={s.id} size="xs" color={seatColor(s.seatType)} variant={s.seatType === 'NORMAL' ? 'outline' : 'filled'} onClick={() => cycleSeatType(s)} title={`${s.label || ''} (${s.seatType})`}>
                      {s.label || `${s.row},${s.col}`}
                    </Button>
                  ))}
                </div>
                <Group mt="sm" gap="xs">
                  <Badge color="gray">NORMAL</Badge>
                  <Badge color="blue">ACCESSIBLE</Badge>
                  <Badge color="violet">LEFT_HANDED</Badge>
                  <Badge color="red">BROKEN</Badge>
                </Group>
              </Card>
            )}
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
