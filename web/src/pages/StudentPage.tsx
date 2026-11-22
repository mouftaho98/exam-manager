import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Text, Title, Card, Alert, Select, Switch } from '@mantine/core'
import { clearToken, apiFetch } from '../lib/api'

export default function StudentPage() {
  const navigate = useNavigate()
  const [assignments, setAssignments] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState<{ needsAccessible: boolean; needsLeftHanded: boolean } | null>(null)
  const logout = () => {
    clearToken()
    navigate('/login')
  }

  useEffect(() => {
    apiFetch<{ assignments: any[] }>('/exams/my/list')
      .then((res) => setAssignments(res.assignments))
      .catch(() => setError('Could not load your exams'))
    apiFetch<{ user: any }>('/auth/me')
      .then((res) => setProfile({ needsAccessible: res.user.needsAccessible, needsLeftHanded: res.user.needsLeftHanded }))
      .catch(() => {})
  }, [])

  const updateProfile = async (field: 'needsAccessible' | 'needsLeftHanded', value: boolean) => {
    if (!profile) return
    try {
      const res = await apiFetch<{ user: any }>('/auth/me', { method: 'PATCH', body: JSON.stringify({ [field]: value }) })
      setProfile({ needsAccessible: res.user.needsAccessible, needsLeftHanded: res.user.needsLeftHanded })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    }
  }

  const selected = assignments.find((a) => a.exam?.id === selectedId) || null

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>RollCall</Title>
          <Button variant="subtle" onClick={logout}>Log out</Button>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="sm" py="xl">
          <Stack gap="md">
            <Title order={2}>Student</Title>
            <Card withBorder padding="md">
              <Title order={4} mb="sm">My seating needs</Title>
              <Text size="sm" c="dimmed" mb="sm">These are used for exam seat assignment (set by you).</Text>
              {profile && (
                <Stack gap="sm">
                  <Switch label="I need accessible seating" checked={profile.needsAccessible} onChange={(e) => updateProfile('needsAccessible', e.currentTarget.checked)} />
                  <Switch label="I need left-handed seating" checked={profile.needsLeftHanded} onChange={(e) => updateProfile('needsLeftHanded', e.currentTarget.checked)} />
                </Stack>
              )}
            </Card>
            <Text c="dimmed">Select an exam to view your seat assignment.</Text>
            {error && <Alert color="red">{error}</Alert>}
            <Select
              label="Your exams"
              placeholder={assignments.length ? "Select an exam" : "No exams found"}
              data={assignments.map((a: any) => ({
                value: a.exam?.id || '',
                label: `${a.exam?.title || 'Exam'} — ${a.exam?.course?.code || ''} (${(a.exam?.rooms || []).map((er: any) => er.room?.name).join(', ') || a.seat?.room?.name || ''})`,
              }))}
              value={selectedId}
              onChange={setSelectedId}
              disabled={assignments.length === 0}
            />
            {selected && (
              <Card withBorder padding="md">
                <Text fw={700}>Course: {selected.exam?.course?.name}</Text>
                <Text>Room: {selected.seat?.room?.name || (selected.exam?.rooms || []).map((er: any) => er.room?.name).join(', ')}</Text>
                <Text>Seat: {selected.seat?.label} ({selected.seat?.seatType})</Text>
                <Text>Checked in: {selected.checkedIn ? 'Yes' : 'No'}</Text>
                {selected.seat?.room?.seats && selected.seat.room.seats.length > 0 && (() => {
                  const seats: any[] = selected.seat.room.seats
                  const maxRow = Math.max(...seats.map((s: any) => s.row))
                  const maxCol = Math.max(...seats.map((s: any) => s.col))
                  const grid: any[][] = []
                  for (let r = 0; r <= maxRow; r++) {
                    grid[r] = []
                    for (let c = 0; c <= maxCol; c++) {
                      grid[r][c] = seats.find((s: any) => s.row === r && s.col === c) || null
                    }
                  }
                  return (
                    <div style={{ marginTop: 16 }}>
                      <Text fw={600} mb="xs">Room map (your seat highlighted)</Text>
                      <div style={{ overflowX: 'auto' }}>
                        {grid.map((row, ri) => (
                          <div key={ri} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                            {row.map((seat, ci) => {
                              const isMine = seat && seat.id === selected.seat.id
                              return (
                                <div
                                  key={ci}
                                  style={{
                                    width: 44, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: isMine ? '3px solid #1971c2' : '1px solid #ccc', borderRadius: 4, fontSize: 10,
                                    backgroundColor: !seat ? '#f0f0f0' : seat.seatType === 'BROKEN' ? '#ffe3e3' : seat.seatType === 'ACCESSIBLE' ? '#e7f5ff' : seat.seatType === 'LEFT_HANDED' ? '#f3f0ff' : '#fff',
                                    color: '#000',
                                    fontWeight: isMine ? 'bold' : 'normal',
                                    opacity: seat ? 1 : 0.3,
                                  }}
                                  title={seat ? `${seat.label || `R${seat.row}C${seat.col}`} (${seat.seatType})${isMine ? ' — YOUR SEAT' : ''}` : 'No seat'}
                                >
                                  {seat ? (seat.label || '·') : ''}
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                      <Group mt="sm" gap="xs">
                        <Text size="xs">Legend: </Text>
                        <span style={{ fontSize: 12 }}>⬜ Normal</span>
                        <span style={{ fontSize: 12 }}>🟦 Accessible</span>
                        <span style={{ fontSize: 12 }}>🟪 Left-handed</span>
                        <span style={{ fontSize: 12 }}>🟥 Broken</span>
                        <span style={{ fontSize: 12, fontWeight: 'bold' }}>🔵 Your seat (thick border)</span>
                      </Group>
                    </div>
                  )
                })()}
              </Card>
            )}
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
