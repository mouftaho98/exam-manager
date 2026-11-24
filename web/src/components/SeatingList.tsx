/**
 * The seating chart as a table: one row per student with their number, room,
 * seat and check-in status. Searchable, filterable and paginated, so a
 * 150-student exam stays readable. "Move" hands a student to the map view.
 */
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Group, Pagination, Select, Table, Text, TextInput } from '@mantine/core'
import type { Seating, StudentSummary } from '../lib/types'

export type SeatingStudent = StudentSummary & {
  roomId?: string
  roomName?: string
  seatLabel?: string
  manual?: boolean
  checkedInAt?: string | null
}

const PAGE_SIZE = 25

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function SeatingList({ seating, onMove }: { seating: Seating; onMove: (student: SeatingStudent) => void }) {
  const [search, setSearch] = useState('')
  const [room, setRoom] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')
  const [page, setPage] = useState(1)

  const students = useMemo<SeatingStudent[]>(() => {
    const seated = seating.rooms.flatMap((r) =>
      r.rows.flatMap((row) =>
        row.seats.filter((s) => s.student).map((s) => ({ ...s.student!, roomId: r.id, roomName: r.name, seatLabel: s.label })),
      ),
    )
    return [...seated, ...seating.unassigned].sort((a, b) => a.name.localeCompare(b.name))
  }, [seating])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter((s) => {
      if (room === 'none' ? s.roomId : room !== 'all' && s.roomId !== room) return false
      if (status === 'in' && !s.checkedInAt) return false
      if (status === 'out' && (s.checkedInAt || !s.roomId)) return false
      if (q && !`${s.name} ${s.email} ${s.studentNumber ?? ''} ${s.seatLabel ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [students, search, room, status])

  // Back to the first page when the filters change (or the list shrinks).
  useEffect(() => { setPage(1) }, [search, room, status])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const roomOptions = [
    { value: 'all', label: 'All rooms' },
    ...seating.rooms.map((r) => ({ value: r.id, label: r.name })),
    ...(seating.unassigned.length ? [{ value: 'none', label: 'Without a seat' }] : []),
  ]

  return (
    <div>
      <Group mb="sm" wrap="wrap" align="flex-end">
        <TextInput
          label="Search" placeholder="Name, email, student number or seat" value={search}
          onChange={(e) => setSearch(e.currentTarget.value)} style={{ flexGrow: 1, minWidth: 220 }}
        />
        <Select label="Room" data={roomOptions} value={room} onChange={(v) => setRoom(v ?? 'all')} allowDeselect={false} w={190} />
        <Select
          label="Status" value={status} onChange={(v) => setStatus(v ?? 'all')} allowDeselect={false} w={160}
          data={[{ value: 'all', label: 'Everyone' }, { value: 'in', label: 'Checked in' }, { value: 'out', label: 'Not here yet' }]}
        />
      </Group>

      <Table.ScrollContainer minWidth={760}>
        <Table withTableBorder verticalSpacing="xs" style={{ whiteSpace: 'nowrap' }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Student</Table.Th>
              <Table.Th>Student #</Table.Th>
              <Table.Th>Room</Table.Th>
              <Table.Th>Seat</Table.Th>
              <Table.Th>Needs</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th w={1} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shown.map((s) => (
              <Table.Tr key={s.studentId} data-testid="seating-row" bg={s.checkedInAt ? 'var(--mantine-color-green-0)' : undefined}>
                <Table.Td>
                  <Text size="sm" fw={500}>{s.name}</Text>
                  <Text size="xs" c="dimmed">{s.email}</Text>
                </Table.Td>
                <Table.Td>{s.studentNumber ?? <Text span c="dimmed">—</Text>}</Table.Td>
                <Table.Td>{s.roomName ?? <Text span c="dimmed">—</Text>}</Table.Td>
                <Table.Td>
                  {s.seatLabel
                    ? <Text span fw={600}>{s.seatLabel}{s.manual && <Text span size="xs" c="orange"> · moved</Text>}</Text>
                    : <Badge color="red" variant="light">No seat</Badge>}
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    {s.needsAccessible && <Badge size="sm" color="blue" variant="light">Accessible</Badge>}
                    {s.leftHanded && <Badge size="sm" color="violet" variant="light">Left-handed</Badge>}
                    {!s.needsAccessible && !s.leftHanded && <Text span c="dimmed">—</Text>}
                  </Group>
                </Table.Td>
                <Table.Td>
                  {s.checkedInAt
                    ? <Badge color="green" variant="light">Checked in {time(s.checkedInAt)}</Badge>
                    : s.roomId ? <Badge color="gray" variant="light">Not here yet</Badge> : null}
                </Table.Td>
                <Table.Td>
                  <Button size="compact-xs" variant="subtle" onClick={() => onMove(s)}>Move</Button>
                </Table.Td>
              </Table.Tr>
            ))}
            {shown.length === 0 && (
              <Table.Tr><Table.Td colSpan={7}><Text ta="center" c="dimmed" py="md">No students match.</Text></Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Group justify="space-between" mt="sm">
        <Text size="sm" c="dimmed">
          {filtered.length === 0 ? '0 students' : `${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, filtered.length)} of ${filtered.length} students`}
        </Text>
        {pages > 1 && <Pagination total={pages} value={current} onChange={setPage} size="sm" />}
      </Group>
    </div>
  )
}
