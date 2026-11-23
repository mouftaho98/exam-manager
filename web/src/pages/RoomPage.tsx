/**
 * A room's seat map. Seat markings can be changed any time (click a seat).
 * The whole layout can be redrawn until students are seated in the room.
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Group, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import Layout from '../components/Layout'
import RoomBuilder, { gridFromRoom, gridToRows, usableCount, type Grid } from '../components/RoomBuilder'
import SeatMap from '../components/SeatMap'
import { api, errorMessage } from '../lib/api'
import { useLoad } from '../lib/hooks'
import type { Room, Seat } from '../lib/types'

type Marking = 'accessible' | 'leftHanded' | 'broken'

export default function RoomPage() {
  const { roomId = '' } = useParams()
  const room = useLoad(() => api.get<{ room: Room }>(`/rooms/${roomId}`), [roomId])
  const [marking, setMarking] = useState<Marking>('accessible')
  const [draft, setDraft] = useState<Grid | null>(null) // set while redrawing the layout
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const r = room.data?.room

  const toggle = async (seat: Seat) => {
    setError('')
    setWarning('')
    try {
      const res = await api.patch<{ seat: Seat; warnings: string[] }>(`/rooms/${roomId}/seats/${seat.id}`, { [marking]: !seat[marking] })
      setWarning(res.warnings.join(' '))
      room.setData((d) => d && {
        room: { ...d.room, rows: d.room.rows.map((row) => ({ ...row, seats: row.seats.map((s) => (s.id === seat.id ? res.seat : s)) })) },
      })
    } catch (e) { setError(errorMessage(e)) }
  }

  const saveLayout = async () => {
    if (!r || !draft) return
    setError('')
    if (usableCount(draft) === 0) { setError('Add at least one seat'); return }
    try {
      const res = await api.put<{ room: Room }>(`/rooms/${roomId}`, { name: r.name, building: r.building ?? undefined, rows: gridToRows(draft) })
      room.setData(res)
      setDraft(null)
    } catch (e) { setError(errorMessage(e)) }
  }

  return (
    <Layout title={r ? `${r.name}${r.building ? ` · ${r.building}` : ''}` : 'Room'} size="lg">
      {room.error && <Alert color="red">{room.error}</Alert>}
      {r && (
        <Stack gap="md">
          <Text c="dimmed">{r.capacity} usable seats</Text>
          {error && <Alert color="red">{error}</Alert>}
          {warning && <Alert color="yellow">{warning}</Alert>}

          {draft ? (
            <Card withBorder padding="md">
              <Title order={5} mb="sm">Redraw the layout</Title>
              <RoomBuilder grid={draft} onChange={setDraft} />
              <Group mt="md">
                <Button onClick={saveLayout}>Save layout</Button>
                <Button variant="subtle" color="gray" onClick={() => { setDraft(null); setError('') }}>Cancel</Button>
              </Group>
              <Text size="xs" c="dimmed" mt="xs">Not possible once students are seated in this room. Change seat markings instead.</Text>
            </Card>
          ) : (
            <Card withBorder padding="md">
              <Group justify="space-between" mb="sm" wrap="wrap">
                <Title order={5}>Seat markings</Title>
                <Group gap="xs">
                  <SegmentedControl size="xs" value={marking} onChange={(v) => setMarking(v as Marking)} data={[
                    { label: 'Accessible', value: 'accessible' }, { label: 'Left-handed', value: 'leftHanded' }, { label: 'Broken', value: 'broken' },
                  ]} />
                  <Button size="xs" variant="light" onClick={() => setDraft(gridFromRoom(r))}>Edit layout</Button>
                </Group>
              </Group>
              <Text size="sm" c="dimmed" mb="sm">Click a seat to turn the selected marking on or off.</Text>
              <SeatMap rows={r.rows} onSeatClick={toggle} />
              <Group gap="xs" mt="sm">
                <Badge color="gray" variant="outline">Normal</Badge>
                <Badge color="blue" variant="light">Accessible</Badge>
                <Badge color="violet" variant="light">Left-handed</Badge>
                <Badge color="red" variant="light">Broken (never assigned)</Badge>
              </Group>
            </Card>
          )}
        </Stack>
      )}
    </Layout>
  )
}
