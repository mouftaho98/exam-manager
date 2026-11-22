/**
 * A room's seat map. Pick a marking, then click seats to turn it on or off.
 * The layout itself can be changed until students are seated in the room.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Group, SegmentedControl, Stack, Text, TextInput, Title } from '@mantine/core'
import Layout from '../components/Layout'
import SeatMap from '../components/SeatMap'
import { api, errorMessage } from '../lib/api'
import { useLoad } from '../lib/hooks'
import type { Room, Seat } from '../lib/types'
import { parseRowCounts } from './RoomsPage'

type Marking = 'accessible' | 'leftHanded' | 'broken'

export default function RoomPage() {
  const { roomId = '' } = useParams()
  const room = useLoad(() => api.get<{ room: Room }>(`/rooms/${roomId}`), [roomId])
  const [marking, setMarking] = useState<Marking>('accessible')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [rowsText, setRowsText] = useState('')
  const r = room.data?.room

  useEffect(() => {
    if (r) setRowsText(r.rows.map((row) => row.seats.length).join(', '))
  }, [r?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setError('')
    const counts = parseRowCounts(rowsText)
    if (!r || !counts) { setError('Seats per row should be numbers separated by commas'); return }
    try {
      const res = await api.put<{ room: Room }>(`/rooms/${roomId}`, { name: r.name, building: r.building ?? undefined, rows: counts.map((seats) => ({ seats })) })
      room.setData(res)
    } catch (e) { setError(errorMessage(e)) }
  }

  return (
    <Layout title={r ? `${r.name}${r.building ? ` · ${r.building}` : ''}` : 'Room'}>
      {room.error && <Alert color="red">{room.error}</Alert>}
      {r && (
        <Stack gap="md">
          <Text c="dimmed">{r.capacity} usable seats</Text>
          {error && <Alert color="red">{error}</Alert>}
          {warning && <Alert color="yellow">{warning}</Alert>}
          <Card withBorder padding="md">
            <Group justify="space-between" mb="sm" wrap="wrap">
              <Title order={5}>Seat markings</Title>
              <SegmentedControl size="xs" value={marking} onChange={(v) => setMarking(v as Marking)} data={[
                { label: 'Accessible', value: 'accessible' }, { label: 'Left-handed', value: 'leftHanded' }, { label: 'Broken', value: 'broken' },
              ]} />
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
          <Card withBorder padding="md">
            <Title order={5} mb="sm">Layout</Title>
            <Group align="flex-end">
              <TextInput label="Seats per row" value={rowsText} onChange={(e) => setRowsText(e.target.value)} style={{ flexGrow: 1 }} />
              <Button variant="light" onClick={saveLayout}>Save layout</Button>
            </Group>
            <Text size="xs" c="dimmed" mt="xs">Saving a new layout clears seat markings. It's blocked once students are seated here.</Text>
          </Card>
        </Stack>
      )}
    </Layout>
  )
}
