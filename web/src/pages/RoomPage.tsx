/**
 * A room's seat map. Seat markings can be changed any time (click a seat).
 * The whole layout can be redrawn until students are seated in the room.
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Button, Card, Group, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import Layout from '../components/Layout'
import RoomBuilder, { gridFromRoom, gridToRows, usableCount, type Grid } from '../components/RoomBuilder'
import SeatMap from '../components/SeatMap'
import { api, errorMessage } from '../lib/api'
import { useLoad } from '../lib/hooks'
import type { Room, Seat } from '../lib/types'

type Marking = 'accessible' | 'leftHanded' | 'broken'

const MARKINGS: { value: Marking; label: string; bg: string }[] = [
  { value: 'accessible', label: 'Accessible', bg: '#d0ebff' },
  { value: 'leftHanded', label: 'Left-handed', bg: '#e5dbff' },
  { value: 'broken', label: 'Broken', bg: '#ffe3e3' },
]

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
    <Layout title={r ? `${r.name}${r.building ? ` · ${r.building}` : ''}` : 'Room'} size="xl">
      {room.error && <Alert color="red">{room.error}</Alert>}
      {r && (
        <Stack gap="md">
          <Text c="dimmed">{r.capacity} usable seats</Text>
          {error && <Alert color="red">{error}</Alert>}
          {warning && <Alert color="yellow">{warning}</Alert>}

          {draft ? (
            <Card withBorder padding="md">
              <RoomBuilder
                grid={draft}
                onChange={setDraft}
                side={<Title order={5}>Redraw the layout</Title>}
                actions={
                  <>
                    <Group gap="xs" grow>
                      <Button onClick={saveLayout}>Save layout</Button>
                      <Button variant="default" onClick={() => { setDraft(null); setError('') }}>Cancel</Button>
                    </Group>
                    <Text size="xs" c="dimmed">Not possible once students are seated in this room. Change seat markings instead.</Text>
                  </>
                }
              />
            </Card>
          ) : (
            <Card withBorder padding="md">
              {/* Controls on the left, the map on the right (stacked on phones). */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
                <Stack gap="sm" style={{ flex: '0 0 250px', minWidth: 0 }}>
                  <Title order={5}>Seat markings</Title>
                  <SegmentedControl
                    orientation="vertical" fullWidth value={marking} onChange={(v) => setMarking(v as Marking)} aria-label="Seat marking"
                    data={MARKINGS.map((m) => ({
                      value: m.value,
                      label: (
                        <Group gap={8} wrap="nowrap">
                          <span style={{ width: 16, height: 14, borderRadius: 3, background: m.bg, flexShrink: 0 }} />
                          <span>{m.label}</span>
                        </Group>
                      ),
                    }))}
                  />
                  <Text size="xs" c="dimmed">Click a seat to turn the selected marking on or off. Broken seats are never assigned.</Text>
                  <Button variant="light" onClick={() => setDraft(gridFromRoom(r))}>Edit layout</Button>
                </Stack>
                <div style={{ flex: '1 1 360px', minWidth: 0 }}>
                  <SeatMap rows={r.rows} onSeatClick={toggle} />
                </div>
              </div>
            </Card>
          )}
        </Stack>
      )}
    </Layout>
  )
}
