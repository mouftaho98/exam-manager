/**
 * One offering (a course in a term). Everyone sees its exams. Staff see who's
 * in it; instructors also invite people, upload the roster and create exams.
 */
import { memo, useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ActionIcon, Alert, Anchor, Badge, Button, Card, Center, Checkbox, Code, Group, MultiSelect, NumberInput, Select, Stack, Table, Tabs, Text, TextInput, Textarea, Title, Tooltip,
} from '@mantine/core'
import { CheckIcon, LinkIcon, TrashIcon } from '../components/icons'
import Layout from '../components/Layout'
import { api, errorMessage } from '../lib/api'
import { formatWhen, roleLabel, toLocalInput } from '../lib/format'
import { useLoad } from '../lib/hooks'
import { useUrlState } from '../lib/useUrlState'
import type { Exam, Member, Offering, Role, RoomSummary } from '../lib/types'

const ROLE_OPTIONS = [
  { value: 'STUDENT', label: 'Student' },
  { value: 'PROCTOR', label: 'Proctor' },
  { value: 'INSTRUCTOR', label: 'Instructor' },
]

type OfferingTab = 'exams' | 'people' | 'roster'

export default function OfferingPage() {
  const { offeringId = '' } = useParams()
  const info = useLoad(() => api.get<{ offering: Offering; myRole: Role }>(`/offerings/${offeringId}`), [offeringId])
  const role = info.data?.myRole
  const o = info.data?.offering
  // The open tab lives in the URL (?tab=people), so a refresh stays on it.
  // Tabs someone can't see (e.g. People for a student) fall back to Exams.
  const tabs: OfferingTab[] = role === 'INSTRUCTOR' ? ['exams', 'people', 'roster'] : role === 'PROCTOR' ? ['exams', 'people'] : ['exams']
  const [tab, setTab] = useUrlState<OfferingTab>('tab', 'exams', tabs)

  return (
    <Layout title={o ? `${o.course.code} — ${o.term}` : 'Course'} size="xl">
      {info.error && <Alert color="red">{info.error}</Alert>}
      {o && role && (
        <Stack gap="md">
          <Group gap="xs">
            <Text c="dimmed">{o.course.name}</Text>
            <Badge variant="light">You're {role === 'INSTRUCTOR' ? 'an instructor' : `a ${roleLabel(role).toLowerCase()}`}</Badge>
          </Group>
          <Tabs value={tab} onChange={(v) => v && setTab(v as OfferingTab)} keepMounted={false}>
            <Tabs.List>
              <Tabs.Tab value="exams">Exams</Tabs.Tab>
              {role !== 'STUDENT' && <Tabs.Tab value="people">People</Tabs.Tab>}
              {role === 'INSTRUCTOR' && <Tabs.Tab value="roster">Roster upload</Tabs.Tab>}
            </Tabs.List>
            <Tabs.Panel value="exams" pt="md"><ExamsTab offeringId={offeringId} canCreate={role === 'INSTRUCTOR'} /></Tabs.Panel>
            <Tabs.Panel value="people" pt="md"><PeopleTab offeringId={offeringId} canManage={role === 'INSTRUCTOR'} /></Tabs.Panel>
            <Tabs.Panel value="roster" pt="md"><RosterTab offeringId={offeringId} /></Tabs.Panel>
          </Tabs>
        </Stack>
      )}
    </Layout>
  )
}

function ExamsTab({ offeringId, canCreate }: { offeringId: string; canCreate: boolean }) {
  const exams = useLoad(() => api.get<{ exams: Exam[] }>(`/offerings/${offeringId}/exams`), [offeringId])
  const rooms = useLoad(() => (canCreate ? api.get<{ rooms: RoomSummary[] }>('/rooms') : Promise.resolve({ rooms: [] })), [canCreate])
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000)
  tomorrow.setHours(9, 0, 0, 0)
  const [form, setForm] = useState({ title: '', startsAt: toLocalInput(tomorrow), durationMinutes: 120, roomIds: [] as string[] })
  const [error, setError] = useState('')

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await api.post(`/offerings/${offeringId}/exams`, { ...form, startsAt: new Date(form.startsAt).toISOString() })
      setForm((f) => ({ ...f, title: '', roomIds: [] }))
      exams.reload()
    } catch (err) { setError(errorMessage(err)) }
  }

  return (
    <Stack gap="md">
      {exams.data?.exams.length === 0 && <Text c="dimmed" size="sm">No exams yet.</Text>}
      {exams.data?.exams.map((ex) => (
        <Card key={ex.id} withBorder padding="sm" data-testid="exam-row">
          <Group justify="space-between" wrap="wrap">
            <div>
              <Anchor component={Link} to={`/exams/${ex.id}`} fw={600}>{ex.title}</Anchor>
              <Text size="sm" c="dimmed">{formatWhen(ex.startsAt)} · {ex.durationMinutes} min · {ex.rooms.map((r) => r.name).join(', ') || 'No rooms yet'}</Text>
            </div>
            <Badge color={ex.seatingGeneratedAt ? 'green' : 'gray'} variant="light">{ex.seatingGeneratedAt ? 'Seats assigned' : 'No seating yet'}</Badge>
          </Group>
        </Card>
      ))}
      {canCreate && (
        <Card withBorder padding="md">
          <Title order={5} mb="sm">New exam</Title>
          {error && <Alert color="red" mb="sm">{error}</Alert>}
          <form onSubmit={create}>
            <Stack gap="sm">
              <TextInput label="Exam title" placeholder="Midterm" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              <Group grow>
                <TextInput label="Starts at" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required />
                <NumberInput label="Duration (minutes)" value={form.durationMinutes} min={1} max={1440} onChange={(v) => setForm({ ...form, durationMinutes: Number(v) })} />
              </Group>
              <MultiSelect
                label="Rooms" placeholder="Pick one or more rooms" searchable
                data={(rooms.data?.rooms ?? []).map((r) => ({ value: r.id, label: `${r.name}${r.building ? ` (${r.building})` : ''} · ${r.capacity} seats` }))}
                value={form.roomIds} onChange={(roomIds) => setForm({ ...form, roomIds })}
              />
              <Text size="xs" c="dimmed">No room yet? <Anchor component={Link} to="/rooms" size="xs">Draw one</Anchor>. You can also add rooms later.</Text>
              <Button type="submit">Create exam</Button>
            </Stack>
          </form>
        </Card>
      )}
    </Stack>
  )
}

type RowActions = {
  setRole: (m: Member, role: Role) => void
  setNeed: (m: Member, field: 'needsAccessible' | 'leftHanded', value: boolean) => void
  newLink: (m: Member) => void
  remove: (m: Member) => void
}

function PeopleTab({ offeringId, canManage }: { offeringId: string; canManage: boolean }) {
  const members = useLoad(() => api.get<{ members: Member[] }>(`/offerings/${offeringId}/members`), [offeringId])
  const { reload, setData } = members
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('PROCTOR')
  const [error, setError] = useState('')
  const [lastInvite, setLastInvite] = useState<Member | null>(null)

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setError('')
    try { await fn(); await reload() } catch (e) { setError(errorMessage(e)) }
  }, [reload])

  // Stable across renders, so each row (memoised below) only re-renders when
  // its own member changes. With 150+ students, re-rendering every row on
  // each click made the checkboxes feel slow.
  const actions = useMemo<RowActions>(() => ({
    setRole: (m, role) => run(() => api.patch(`/offerings/${offeringId}/members/${m.id}`, { role })),
    // Tick the box straight away and save in the background (no reload of the
    // whole list); if saving fails, put it back and show the error.
    setNeed: async (m, field, value) => {
      const apply = (v: boolean) => setData((d) => d && { members: d.members.map((x) => (x.id === m.id ? { ...x, [field]: v } : x)) })
      setError('')
      apply(value)
      try {
        await api.patch(`/offerings/${offeringId}/members/${m.id}`, { [field]: value })
      } catch (e) {
        apply(!value)
        setError(errorMessage(e))
      }
    },
    newLink: (m) => run(async () => {
      const { member } = await api.post<{ member: Member }>(`/offerings/${offeringId}/members/${m.id}/invite`)
      setLastInvite(member)
    }),
    remove: (m) => { if (window.confirm(`Remove ${m.email}?`)) run(() => api.del(`/offerings/${offeringId}/members/${m.id}`)) },
  }), [offeringId, run, setData])

  const invite = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => {
      const { member } = await api.post<{ member: Member }>(`/offerings/${offeringId}/members`, { email, role })
      setLastInvite(member)
      setEmail('')
    })
  }

  return (
    <Stack gap="md">
      {error && <Alert color="red">{error}</Alert>}
      {canManage && (
        <Card withBorder padding="md">
          <Title order={5} mb="sm">Invite someone</Title>
          <form onSubmit={invite}>
            <Group align="flex-end" grow>
              <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Select label="As" value={role} onChange={(v) => setRole((v as Role) ?? 'PROCTOR')} data={ROLE_OPTIONS} allowDeselect={false} />
              <Button type="submit" style={{ flexGrow: 0 }}>Invite</Button>
            </Group>
          </form>
          {lastInvite?.inviteUrl && (
            <Alert color="green" mt="sm" title={`Invited ${lastInvite.email}`}>
              Send them this link: <Code data-testid="invite-link">{lastInvite.inviteUrl}</Code>
            </Alert>
          )}
        </Card>
      )}
      {/* Rows stay one line tall; on narrow screens the table scrolls sideways. */}
      <Table.ScrollContainer minWidth={1150}>
      <Table striped withTableBorder style={{ whiteSpace: 'nowrap' }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th><Table.Th>Email</Table.Th><Table.Th>Student #</Table.Th><Table.Th>Role</Table.Th>
            <Table.Th ta="center">Accessible</Table.Th><Table.Th ta="center">Left-handed</Table.Th>
            {/* Icon-only action columns: one for invite links, one for removing. */}
            {canManage && <><Table.Th w={56} /><Table.Th w={56} /></>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {members.data?.members.map((m) => <MemberRow key={m.id} m={m} canManage={canManage} actions={actions} />)}
        </Table.Tbody>
      </Table>
      </Table.ScrollContainer>
    </Stack>
  )
}

/** One person in the People table. Memoised: re-renders only when `m` changes. */
const MemberRow = memo(function MemberRow({ m, canManage, actions }: { m: Member; canManage: boolean; actions: RowActions }) {
  // Instructors tick needs here (students normally set them themselves, but
  // can ask an instructor to). Everyone else sees a check mark.
  const need = (field: 'needsAccessible' | 'leftHanded', label: string) =>
    <Center>
      {canManage ? (
        <Checkbox size="sm" aria-label={`${label} for ${m.email}`} checked={m[field]}
          onChange={(e) => actions.setNeed(m, field, e.currentTarget.checked)} />
      ) : m[field] ? (
        <Center role="img" aria-label={`${label} for ${m.email}`} c="blue.6"><CheckIcon /></Center>
      ) : null}
    </Center>

  return (
    <Table.Tr data-testid="member-row">
      <Table.Td>{m.name}{m.status === 'INVITED' && <Badge ml="xs" size="xs" color="yellow">Invited</Badge>}</Table.Td>
      <Table.Td>{m.email}</Table.Td>
      <Table.Td>{m.studentNumber ?? ''}</Table.Td>
      <Table.Td>
        {canManage ? (
          <Select size="xs" w={130} aria-label={`Role for ${m.email}`} value={m.role} data={ROLE_OPTIONS} allowDeselect={false}
            onChange={(v) => v && v !== m.role && actions.setRole(m, v as Role)} />
        ) : roleLabel(m.role)}
      </Table.Td>
      <Table.Td>{need('needsAccessible', 'Accessible seat')}</Table.Td>
      <Table.Td>{need('leftHanded', 'Left-handed desk')}</Table.Td>
      {canManage && (
        <>
          <Table.Td ta="center">
            {/* Only people who haven't joined yet have an invite link to replace. */}
            {m.status === 'INVITED' && (
              <Tooltip label="Make a new invite link (the old one stops working)" withArrow>
                <ActionIcon variant="subtle" aria-label={`New invite link for ${m.email}`} onClick={() => actions.newLink(m)}>
                  <LinkIcon />
                </ActionIcon>
              </Tooltip>
            )}
          </Table.Td>
          <Table.Td ta="center">
            <Tooltip label="Remove from this course" withArrow>
              <ActionIcon variant="subtle" color="red" aria-label={`Remove ${m.email}`} onClick={() => actions.remove(m)}>
                <TrashIcon />
              </ActionIcon>
            </Tooltip>
          </Table.Td>
        </>
      )}
    </Table.Tr>
  )
})

type RosterResult = { created: number; updated: number; errors: { line: number; message: string }[]; invites: { email: string; inviteUrl: string }[] }

function RosterTab({ offeringId }: { offeringId: string }) {
  const [csv, setCsv] = useState('')
  const [result, setResult] = useState<RosterResult | null>(null)
  const [error, setError] = useState('')

  const readFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) file.text().then(setCsv)
  }
  const upload = async () => {
    setError('')
    setResult(null)
    try {
      setResult(await api.csv<RosterResult>(`/offerings/${offeringId}/roster`, csv))
      setCsv('')
    } catch (e) { setError(errorMessage(e)) }
  }

  return (
    <Card withBorder padding="md">
      <Title order={5} mb="xs">Upload the class list</Title>
      <Text size="sm" c="dimmed" mb="sm">
        CSV with an <Code>email</Code> column, and optionally <Code>student_number</Code>, <Code>first_name</Code>, <Code>last_name</Code>.
        Everyone on it is added as a student and gets an invite link. Students set their own seating needs.
      </Text>
      <input type="file" accept=".csv,text/csv" onChange={readFile} aria-label="Roster CSV file" style={{ marginBottom: 8 }} />
      <Textarea aria-label="Roster CSV" placeholder={'email,student_number,first_name,last_name\nana@mail.com,1001,Ana,Lee'} value={csv} onChange={(e) => setCsv(e.target.value)} minRows={5} autosize />
      <Button mt="sm" onClick={upload} disabled={!csv.trim()}>Upload roster</Button>
      {error && <Alert color="red" mt="sm">{error}</Alert>}
      {result && (
        <Stack gap="xs" mt="sm">
          <Alert color={result.errors.length ? 'yellow' : 'green'}>
            Added {result.created} new student{result.created === 1 ? '' : 's'}, {result.updated} already on the roster.
            {result.errors.length > 0 && ` ${result.errors.length} row${result.errors.length === 1 ? '' : 's'} skipped.`}
          </Alert>
          {result.errors.map((e) => <Text key={e.line} size="sm" c="red">Line {e.line}: {e.message}</Text>)}
          {result.invites.length > 0 && (
            <>
              <Text size="sm" fw={500}>Invite links</Text>
              {result.invites.map((i) => <Text key={i.email} size="xs">{i.email}: <Code>{i.inviteUrl}</Code></Text>)}
            </>
          )}
        </Stack>
      )}
    </Card>
  )
}
