/**
 * One exam. Students see their room and seat. Staff (instructors and
 * proctors) run exam day here: check students in with their ID card, watch
 * every room fill up live, and move students between seats. Instructors set
 * up the rooms and seating on the exam setup page (ExamSetupPage).
 */
import { useCallback, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  Alert, Anchor, Badge, Button, Card, Group, Progress, SegmentedControl, Select, Stack, Table, Tabs, Text, TextInput, Title,
} from '@mantine/core'
import CardScanner from '../components/CardScanner'
import Layout from '../components/Layout'
import SeatingList, { type SeatingStudent } from '../components/SeatingList'
import SeatMap, { markingLook, type SeatLook } from '../components/SeatMap'
import { ApiError, api, errorMessage } from '../lib/api'
import { formatWhen } from '../lib/format'
import { useLoad } from '../lib/hooks'
import { useExamEvents } from '../lib/socket'
import { useUrlState } from '../lib/useUrlState'
import type { Attendance, Exam, Role, Seat, SeatRow, Seating, SeatingSeat, StudentSummary } from '../lib/types'

type StudentView = {
  exam: Exam
  myRole: 'STUDENT'
  mySeat: { seat: Seat; room: { id: string; name: string; building: string | null; rows: SeatRow[] } } | null
  checkedInAt: string | null
}
type StaffView = { exam: Exam; myRole: Exclude<Role, 'STUDENT'>; counts: { students: number; assigned: number; checkedIn: number } }

export default function ExamPage() {
  const { examId = '' } = useParams()
  const detail = useLoad(() => api.get<StudentView | StaffView>(`/exams/${examId}`), [examId])
  const d = detail.data
  return (
    <Layout title={d?.exam.title ?? 'Exam'} size="lg">
      {detail.error && <Alert color="red">{detail.error}</Alert>}
      {d && (
        <Stack gap="md">
          <Text c="dimmed">
            {formatWhen(d.exam.startsAt)} · {d.exam.durationMinutes} min · {d.exam.rooms.map((r) => r.name).join(', ') || 'No rooms yet'}
            {' · '}<Anchor component={Link} to={`/offerings/${d.exam.offeringId}`}>Back to course</Anchor>
          </Text>
          {d.myRole === 'STUDENT' ? <StudentExam view={d as StudentView} /> : <StaffExam view={d as StaffView} />}
        </Stack>
      )}
    </Layout>
  )
}

/** A student's own seat, with the room map so they can find it. */
function StudentExam({ view }: { view: StudentView }) {
  const mine = view.mySeat
  if (!mine) return <Alert color="gray">Your seat hasn't been assigned yet. Check back closer to the exam.</Alert>
  const look = (s: Seat): SeatLook => (s.id === mine.seat.id ? { bg: '#2f9e44', text: '#fff', border: '#2b8a3e', title: `${s.label} — your seat` } : { ...markingLook(s), bg: '#f1f3f5' })
  return (
    <Stack gap="md">
      <Card withBorder padding="md">
        <Group justify="space-between" wrap="wrap">
          <div>
            <Text size="sm" c="dimmed">Your seat</Text>
            <Title order={2}>{mine.room.name} · {mine.seat.label}</Title>
            {mine.room.building && <Text size="sm">{mine.room.building}</Text>}
          </div>
          {view.checkedInAt ? <Badge color="green" size="lg">Checked in</Badge> : <Badge color="gray" size="lg">Not checked in</Badge>}
        </Group>
        <Text size="sm" mt="sm">Bring your student ID card. A proctor scans it at the door.</Text>
      </Card>
      <Card withBorder padding="md">
        <Title order={5} mb="sm">Room map</Title>
        <SeatMap rows={mine.room.rows} look={look} axes />
      </Card>
    </Stack>
  )
}

type CheckinResult =
  | { kind: 'ok'; status: 'checked_in' | 'already_checked_in'; student: StudentSummary; seat: Seat; roomId: string }
  | { kind: 'wrong_room'; message: string; roomName: string; seatLabel: string }
  | { kind: 'error'; message: string }

function StaffExam({ view }: { view: StaffView }) {
  const exam = view.exam
  const isInstructor = view.myRole === 'INSTRUCTOR'
  const seating = useLoad(() => api.get<Seating>(`/exams/${exam.id}/seating`), [exam.id])
  const attendance = useLoad(() => api.get<Attendance>(`/exams/${exam.id}/attendance`), [exam.id])

  // Any live event (from this or another proctor's device) refreshes the maps and counts.
  const onEvent = useCallback(() => { seating.reload(); attendance.reload() }, [seating.reload, attendance.reload]) // eslint-disable-line react-hooks/exhaustive-deps
  const live = useExamEvents(exam.id, onEvent)

  return (
    <Stack gap="md">
      <Group gap="xs" justify="space-between">
        <Group gap="xs">
          <Badge color={live ? 'green' : 'gray'} variant="dot">{live ? 'Live' : 'Connecting…'}</Badge>
          <Text size="sm" c="dimmed">{view.counts.students} students · {view.counts.assigned} seated</Text>
        </Group>
        {isInstructor && <Button component={Link} to={`/exams/${exam.id}/setup`} size="xs" variant="light">Exam setup</Button>}
      </Group>
      {!exam.seatingGeneratedAt && (
        <Alert color="yellow" title="Seating isn't set up yet">
          {isInstructor
            ? <>Choose the rooms and generate seating on the <Anchor component={Link} to={`/exams/${exam.id}/setup`}>exam setup page</Anchor>.</>
            : 'An instructor still needs to set up the rooms and seating.'}
        </Alert>
      )}
      {exam.rooms.length > 0 && <CheckinCard exam={exam} seating={seating.data} />}
      <AttendanceCard attendance={attendance.data} />
      {seating.data && seating.data.rooms.length > 0 && <SeatingCard exam={exam} seating={seating.data} onChange={() => { seating.reload(); attendance.reload() }} />}
    </Stack>
  )
}

/** Door check-in: scan or type the student number, or search by name. */
function CheckinCard({ exam, seating }: { exam: Exam; seating: Seating | null }) {
  // The proctor's room is kept in the URL (?checkin=<roomId>), so refreshing
  // mid-exam doesn't make them pick it again. One-room exams pick it for them.
  const roomIds = exam.rooms.map((r) => r.id)
  const [urlRoom, setRoomId] = useUrlState('checkin', exam.rooms.length === 1 ? roomIds[0] : '', roomIds)
  const roomId = urlRoom || null
  const [number, setNumber] = useState('')
  const [studentId, setStudentId] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<CheckinResult | null>(null)

  const students = useMemo(
    () => (seating?.rooms ?? []).flatMap((r) => r.rows.flatMap((row) => row.seats.filter((s) => s.student).map((s) => ({ ...s.student!, seatLabel: s.label, roomName: r.name })))),
    [seating],
  )

  const checkIn = async (body: { studentNumber?: string; studentId?: string }) => {
    if (!roomId) { setResult({ kind: 'error', message: 'Pick the room you are checking students into first.' }); return }
    try {
      const res = await api.post<{ status: 'checked_in' | 'already_checked_in'; student: StudentSummary; seat: Seat; room: { id: string } }>(
        `/exams/${exam.id}/checkins`, { roomId, ...body },
      )
      setResult({ kind: 'ok', status: res.status, student: res.student, seat: res.seat, roomId: res.room.id })
      setNumber('')
      setStudentId(null)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'wrong_room') {
        setResult({ kind: 'wrong_room', message: e.message, roomName: e.details?.room?.name, seatLabel: e.details?.seat?.label })
      } else {
        setResult({ kind: 'error', message: errorMessage(e) })
      }
    }
  }
  const onScan = useCallback((text: string) => { setScanning(false); checkIn({ studentNumber: text }) }, [roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card withBorder padding="md">
      <Title order={5} mb="sm">Check in</Title>
      <Stack gap="sm">
        <Select label="I'm checking students into" placeholder="Pick your room" value={roomId} onChange={(v) => setRoomId(v ?? '')}
          data={exam.rooms.map((r) => ({ value: r.id, label: r.name }))} allowDeselect={false} />
        <Group align="flex-end" wrap="wrap">
          <TextInput
            label="Student number" placeholder="Scan or type the number on the ID card" value={number} style={{ flexGrow: 1, minWidth: 200 }}
            onChange={(e) => setNumber(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && number.trim()) checkIn({ studentNumber: number.trim() }) }}
          />
          <Button onClick={() => checkIn({ studentNumber: number.trim() })} disabled={!number.trim()}>Check in</Button>
          <Button variant="outline" onClick={() => setScanning(true)}>Scan ID card</Button>
        </Group>
        <Group align="flex-end" wrap="wrap">
          <Select
            label="No card? Find them by name" placeholder="Type a name or email" searchable clearable style={{ flexGrow: 1, minWidth: 200 }}
            nothingFoundMessage="No seated student matches"
            data={students.map((s) => ({ value: s.studentId, label: `${s.name} (${s.email}) — ${s.roomName} ${s.seatLabel}${s.checkedInAt ? ' ✓' : ''}` }))}
            value={studentId} onChange={setStudentId}
          />
          <Button variant="light" onClick={() => studentId && checkIn({ studentId })} disabled={!studentId}>Check in by name</Button>
        </Group>

        {result?.kind === 'ok' && (
          <Alert color={result.status === 'checked_in' ? 'green' : 'blue'} title={result.status === 'checked_in' ? 'Checked in' : 'Already checked in'}>
            <Text size="lg"><b>{result.student.name}</b> → seat <b data-testid="checkin-seat">{result.seat.label}</b></Text>
          </Alert>
        )}
        {result?.kind === 'wrong_room' && (
          <Alert color="orange" title="Wrong room">
            <Text>{result.message}. Send them to <b>{result.roomName}</b>.</Text>
          </Alert>
        )}
        {result?.kind === 'error' && <Alert color="red">{result.message}</Alert>}
      </Stack>
      <CardScanner opened={scanning} onClose={() => setScanning(false)} onScan={onScan} />
    </Card>
  )
}

/** Live counts for every room, and who hasn't arrived yet. */
function AttendanceCard({ attendance }: { attendance: Attendance | null }) {
  if (!attendance) return null
  const { totals, rooms } = attendance
  return (
    <Card withBorder padding="md">
      <Group justify="space-between" mb="sm">
        <Title order={5}>Live attendance</Title>
        <Text fw={600} data-testid="attendance-totals">Checked in {totals.checkedIn} / {totals.assigned} · Missing {totals.missing}</Text>
      </Group>
      <Table withTableBorder>
        <Table.Thead>
          <Table.Tr><Table.Th>Room</Table.Th><Table.Th>Checked in</Table.Th><Table.Th>Seated</Table.Th><Table.Th>Capacity</Table.Th><Table.Th w="35%" /></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rooms.map((r) => (
            <Table.Tr key={r.id} data-testid="attendance-room">
              <Table.Td>{r.name}</Table.Td>
              <Table.Td>{r.checkedIn}</Table.Td>
              <Table.Td>{r.assigned}</Table.Td>
              <Table.Td>{r.capacity}</Table.Td>
              <Table.Td><Progress value={r.assigned ? (100 * r.checkedIn) / r.assigned : 0} /></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  )
}

/**
 * Every room's seats with who sits where. Click a student, then click another
 * seat to move them there (swapping if someone is in it).
 */
function SeatingCard({ exam, seating, onChange }: { exam: Exam; seating: Seating; onChange: () => void }) {
  const [selected, setSelected] = useState<SeatingStudent | null>(null)
  // Which room's map is open, kept in the URL (?map=<roomId>).
  const [mapRoom, setMapRoom] = useUrlState('map', seating.rooms[0].id, seating.rooms.map((r) => r.id))
  // List (a table of students) or map, kept in the URL (?view=map).
  const [view, setView] = useUrlState<'list' | 'map'>('view', 'list', ['list', 'map'])
  const [, setParams] = useSearchParams()
  const [error, setError] = useState('')

  // "Move" in the list: pick the student, then show the map to choose their new seat.
  const startMove = (s: SeatingStudent) => {
    setSelected(s)
    // One URL update for both: two separate ones would overwrite each other.
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      p.set('view', 'map')
      if (s.roomId) p.set('map', s.roomId)
      return p
    }, { replace: true })
  }

  const move = async (seat: SeatingSeat) => {
    if (!selected || seat.broken) return
    if (seat.student?.studentId === selected.studentId) { setSelected(null); return }
    if (seat.student && !window.confirm(`Swap ${selected.name} with ${seat.student.name}?`)) return
    setError('')
    try {
      await api.patch(`/exams/${exam.id}/assignments/${selected.studentId}`, { seatId: seat.id, swap: !!seat.student })
      setSelected(null)
      onChange()
    } catch (e) { setError(errorMessage(e)) }
  }
  const onSeatClick = (seat: SeatingSeat) => {
    if (selected) return move(seat)
    if (seat.student) setSelected({ ...seat.student, seatLabel: seat.label })
  }
  const undoCheckin = async () => {
    if (!selected) return
    setError('')
    try { await api.del(`/exams/${exam.id}/checkins/${selected.studentId}`); setSelected(null); onChange() } catch (e) { setError(errorMessage(e)) }
  }

  const look = (s: SeatingSeat): SeatLook => {
    const base = markingLook(s)
    // Rows and columns are labelled on the map, so empty and broken seats say what they are.
    if (s.broken) return { ...base, label: 'Broken', fontScale: 0.7, text: '#c92a2a' }
    if (!s.student) return { ...base, label: 'Empty', fontScale: 0.7, text: '#868e96', title: `${s.label} (empty)` }
    const isSelected = selected?.studentId === s.student.studentId
    const initials = s.student.name.split(' ').map((p) => p[0]).join('').slice(0, 3).toUpperCase()
    return {
      bg: s.student.checkedInAt ? '#b2f2bb' : '#fff3bf',
      border: isSelected ? '#1c7ed6' : s.student.manual ? '#f08c00' : '#ced4da',
      label: initials,
      title: `${s.label}: ${s.student.name}${s.student.checkedInAt ? ' (checked in)' : ''}`,
    }
  }

  return (
    <Card withBorder padding="md">
      <Group justify="space-between" mb="xs" wrap="wrap">
        <Title order={5}>Seating</Title>
        <SegmentedControl
          size="xs" value={view} onChange={(v) => { if (v === 'list') setSelected(null); setView(v as 'list' | 'map') }}
          data={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]}
        />
      </Group>
      {view === 'map' && (
        <Text size="sm" c="dimmed" mb="sm">Green: checked in. Yellow: not here yet. Orange border: moved by hand. Click a student, then a seat, to move them.</Text>
      )}
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      {selected && view === 'map' && (
        <Alert color="blue" mb="sm" withCloseButton onClose={() => setSelected(null)} title={`Moving ${selected.name}`}>
          <Text size="sm">Now click the seat to move them to{selected.seatLabel ? ` (currently ${selected.seatLabel})` : ''}.</Text>
          {selected.checkedInAt && <Button size="xs" variant="light" color="red" mt="xs" onClick={undoCheckin}>Undo check-in</Button>}
        </Alert>
      )}
      {view === 'list' && <SeatingList seating={seating} onMove={startMove} />}
      {view === 'map' && (
        <Tabs value={mapRoom} onChange={(v) => v && setMapRoom(v)}>
          <Tabs.List>
            {seating.rooms.map((r) => <Tabs.Tab key={r.id} value={r.id}>{r.name}</Tabs.Tab>)}
          </Tabs.List>
          {seating.rooms.map((r) => (
            <Tabs.Panel key={r.id} value={r.id} pt="sm">
              <SeatMap rows={r.rows} look={look} onSeatClick={onSeatClick} axes />
            </Tabs.Panel>
          ))}
        </Tabs>
      )}
      {view === 'map' && seating.unassigned.length > 0 && (
        <>
          <Text size="sm" fw={500} mt="sm">Without a seat</Text>
          <Group gap="xs">
            {seating.unassigned.map((s) => (
              <Button key={s.studentId} size="xs" variant={selected?.studentId === s.studentId ? 'filled' : 'light'} onClick={() => setSelected(s)}>{s.name}</Button>
            ))}
          </Group>
        </>
      )}
    </Card>
  )
}
