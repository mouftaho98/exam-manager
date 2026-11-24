/**
 * Exam setup, for instructors: the exam's details, its rooms, and the seating.
 * Exam day (check-in, attendance, moving students) lives on the exam page.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Anchor, Badge, Button, Card, Group, MultiSelect, NumberInput, Stack, Text, TextInput, Title } from '@mantine/core'
import Layout from '../components/Layout'
import { api, errorMessage } from '../lib/api'
import { toLocalInput } from '../lib/format'
import { useLoad } from '../lib/hooks'
import type { Exam, Role, RoomSummary, StudentSummary } from '../lib/types'

type Detail = { exam: Exam; myRole: Role; counts?: { students: number; assigned: number; checkedIn: number } }

export default function ExamSetupPage() {
  const { examId = '' } = useParams()
  const detail = useLoad(() => api.get<Detail>(`/exams/${examId}`), [examId])
  const d = detail.data
  const isInstructor = d?.myRole === 'INSTRUCTOR'
  return (
    <Layout title={d ? `Set up: ${d.exam.title}` : 'Set up exam'} size="lg">
      {detail.error && <Alert color="red">{detail.error}</Alert>}
      {d && !isInstructor && <Alert color="gray">Only instructors can set up an exam. <Anchor component={Link} to={`/exams/${examId}`}>Back to the exam</Anchor></Alert>}
      {d && isInstructor && d.counts && (
        <Stack gap="md">
          <Anchor component={Link} to={`/exams/${examId}`}>← Back to the exam (check-in and attendance)</Anchor>
          <DetailsCard exam={d.exam} onSaved={detail.reload} />
          <SeatingSetupCard exam={d.exam} counts={d.counts} onChange={detail.reload} />
        </Stack>
      )}
    </Layout>
  )
}

/** Title, date and duration. */
function DetailsCard({ exam, onSaved }: { exam: Exam; onSaved: () => void }) {
  const [form, setForm] = useState({ title: exam.title, startsAt: toLocalInput(new Date(exam.startsAt)), durationMinutes: exam.durationMinutes })
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const changed = form.title !== exam.title || form.durationMinutes !== exam.durationMinutes || new Date(form.startsAt).toISOString() !== new Date(exam.startsAt).toISOString()

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaved(false)
    try {
      await api.patch(`/exams/${exam.id}`, { title: form.title, startsAt: new Date(form.startsAt).toISOString(), durationMinutes: form.durationMinutes })
      setSaved(true)
      onSaved()
    } catch (err) { setError(errorMessage(err)) }
  }

  return (
    <Card withBorder padding="md">
      <Title order={5} mb="sm">Details</Title>
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      <form onSubmit={save}>
        <Stack gap="sm">
          <TextInput label="Exam title" value={form.title} onChange={(e) => { setSaved(false); setForm({ ...form, title: e.target.value }) }} required />
          <Group grow align="flex-end">
            <TextInput label="Starts at" type="datetime-local" value={form.startsAt} onChange={(e) => { setSaved(false); setForm({ ...form, startsAt: e.target.value }) }} required />
            <NumberInput label="Duration (minutes)" value={form.durationMinutes} min={1} max={1440} onChange={(v) => { setSaved(false); setForm({ ...form, durationMinutes: Number(v) }) }} />
          </Group>
          <Group>
            <Button type="submit" variant="light" disabled={!changed}>Save details</Button>
            {saved && !changed && <Text size="sm" c="green">Saved</Text>}
          </Group>
        </Stack>
      </form>
    </Card>
  )
}

/** Rooms, generating seating, and clearing it to start over. */
function SeatingSetupCard({ exam, counts, onChange }: { exam: Exam; counts: { students: number; assigned: number; checkedIn: number }; onChange: () => void }) {
  const rooms = useLoad(() => api.get<{ rooms: RoomSummary[] }>('/rooms'))
  const [roomIds, setRoomIds] = useState(exam.rooms.map((r) => r.id))
  // Pick up room changes from elsewhere (e.g. after saving).
  useEffect(() => { setRoomIds(exam.rooms.map((r) => r.id)) }, [exam.rooms])
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ assigned: number; unassigned: StudentSummary[]; warnings: string[] } | null>(null)
  const [cleared, setCleared] = useState('')

  const hasCheckins = counts.checkedIn > 0
  const hasSeating = counts.assigned > 0
  const changed = roomIds.slice().sort().join() !== exam.rooms.map((r) => r.id).sort().join()

  const saveRooms = async () => {
    setError(''); setCleared('')
    try { await api.put(`/exams/${exam.id}/rooms`, { roomIds }); onChange() } catch (e) { setError(errorMessage(e)) }
  }
  const generate = async () => {
    if (exam.seatingGeneratedAt && !window.confirm('Reshuffle everyone? Students keep their check-in codes, but seats change.')) return
    setError(''); setCleared('')
    try {
      setResult(await api.post(`/exams/${exam.id}/seating/generate`))
      onChange()
    } catch (e) { setError(errorMessage(e)) }
  }
  const clear = async () => {
    const warning = hasCheckins
      ? `${counts.checkedIn} student${counts.checkedIn === 1 ? ' has' : 's have'} already checked in. Clearing the seating removes those check-ins too. Remove everyone's seat?`
      : "Remove everyone's seat? You can then change the rooms and generate seating again."
    if (!window.confirm(warning)) return
    setError(''); setResult(null)
    try {
      const res = await api.del<{ removed: number; checkInsRemoved: number }>(`/exams/${exam.id}/seating${hasCheckins ? '?discardCheckins=true' : ''}`)
      setCleared(`Cleared ${res.removed} seat${res.removed === 1 ? '' : 's'}${res.checkInsRemoved ? ` and ${res.checkInsRemoved} check-in${res.checkInsRemoved === 1 ? '' : 's'}` : ''}.`)
      onChange()
    } catch (e) { setError(errorMessage(e)) }
  }

  return (
    <Card withBorder padding="md">
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Title order={5}>Rooms and seating</Title>
        <Group gap="xs">
          <Badge color={hasSeating ? 'green' : 'gray'} variant="light">{counts.assigned} of {counts.students} students seated</Badge>
          {hasCheckins && <Badge color="blue" variant="light">{counts.checkedIn} checked in</Badge>}
        </Group>
      </Group>
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      {cleared && <Alert color="green" mb="sm">{cleared} Pick the rooms you want and generate seating again.</Alert>}
      <Stack gap="sm">
        <Group align="flex-end" wrap="wrap">
          <MultiSelect
            label="Rooms" searchable style={{ flexGrow: 1, minWidth: 240 }}
            data={(rooms.data?.rooms ?? []).map((r) => ({ value: r.id, label: `${r.name} · ${r.capacity} seats` }))}
            value={roomIds} onChange={setRoomIds}
          />
          <Button variant="light" onClick={saveRooms} disabled={!changed}>Save rooms</Button>
        </Group>
        {hasSeating && <Text size="xs" c="dimmed">A room can't be removed while students are seated in it. Clear the seating first to switch rooms.</Text>}
        <Group>
          <Button onClick={generate} disabled={exam.rooms.length === 0 || changed || hasCheckins}>
            {exam.seatingGeneratedAt ? 'Regenerate seating' : 'Generate seating'}
          </Button>
          <Button color="red" variant="outline" onClick={clear} disabled={!hasSeating && !exam.seatingGeneratedAt}>Clear all seating</Button>
        </Group>
        {hasCheckins && <Text size="xs" c="dimmed">Check-in has started, so seating can only be changed by moving students on the exam page, or by clearing it (which removes the check-ins).</Text>}
      </Stack>
      {result && (
        <Stack gap={4} mt="sm">
          <Alert color={result.unassigned.length ? 'yellow' : 'green'}>
            Seated {result.assigned} student{result.assigned === 1 ? '' : 's'}.
            {result.unassigned.length > 0 && ` ${result.unassigned.length} didn't fit: ${result.unassigned.map((s) => s.name).join(', ')}.`}
          </Alert>
          {result.warnings.map((w) => <Text key={w} size="sm" c="orange">{w}</Text>)}
        </Stack>
      )}
    </Card>
  )
}
