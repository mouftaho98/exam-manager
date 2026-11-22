import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Title, Alert, Text, Card, Select, Modal, TextInput, SegmentedControl } from '@mantine/core'
import { clearToken, apiFetch } from '../lib/api'
import { io } from 'socket.io-client'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

export default function ProctorPage() {
  const navigate = useNavigate()
  const [examId, setExamId] = useState('')
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [assignments, setAssignments] = useState<any[]>([])
  const [exams, setExams] = useState<any[]>([])
  const [scanOpen, setScanOpen] = useState(false)
  const [scanError, setScanError] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
  const scannerRef = useRef<Html5Qrcode | null>(null)

  const logout = () => {
    clearToken()
    navigate('/login')
  }

  const checkIn = async () => {
    if (!selectedEmail) { setError('Select a student'); return }
    setMsg(''); setError('')
    try {
      const res = await apiFetch<{ assignment: any }>(`/exams/${examId}/checkin`, {
        method: 'POST',
        body: JSON.stringify({ email: selectedEmail }),
      })
      setMsg(`Checked in: ${res.assignment.rosterEntry?.name} at seat ${res.assignment.seat?.label}`)
      setSelectedEmail(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed')
    }
  }

  const checkInByBarcode = async (barcode: string) => {
    setMsg(''); setError(''); setScanError('')
    try {
      const res = await apiFetch<{ assignment: any; message?: string }>(`/exams/${examId}/checkin-by-barcode`, {
        method: 'POST',
        body: JSON.stringify({ barcode }),
      })
      setMsg(res.message || `Checked in: ${res.assignment.rosterEntry?.name} at seat ${res.assignment.seat?.label}`)
      setScanOpen(false)
      setBarcodeInput('')
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Check-in failed')
      setError(err instanceof Error ? err.message : 'Check-in failed')
    }
  }

  const loadAssignments = async () => {
    if (!examId) return
    try {
      const res = await apiFetch<{ assignments: any[] }>(`/exams/${examId}/assignments`)
      setAssignments(res.assignments)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignments')
    }
  }

  useEffect(() => {
    apiFetch<{ exams: any[] }>('/exams').then((res) => setExams(res.exams)).catch(() => {})
  }, [])

  useEffect(() => {
    setSelectedEmail(null)
    setMsg('')
    setError('')
  }, [examId])

  useEffect(() => {
    if (!scanOpen) {
      if (scannerRef.current) {
        const sc = scannerRef.current
        scannerRef.current = null
        sc.stop().then(() => sc.clear()).catch(() => {})
      }
      return
    }
    setScanError('')
    const timer = setTimeout(() => {
      const scanner = new Html5Qrcode('barcode-reader', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ],
        verbose: false,
      })
      scannerRef.current = scanner
      scanner.start(
        { facingMode: 'environment' },
        { fps: 20 },
        (decodedText) => {
          scanner.stop().then(() => scanner.clear()).catch(() => {})
          scannerRef.current = null
          checkInByBarcode(decodedText)
        },
        () => {}
      ).catch((err) => {
        setScanError('Could not start camera: ' + (err?.message || String(err)))
      })
    }, 300)
    return () => {
      clearTimeout(timer)
      if (scannerRef.current) {
        const sc = scannerRef.current
        scannerRef.current = null
        sc.stop().then(() => sc.clear()).catch(() => {})
      }
    }
  }, [scanOpen])

  useEffect(() => {
    if (!examId) return
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const s = io(API_URL)
    s.emit('joinExam', examId)
    s.on('checkin', (updated: any) => {
      setAssignments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
    })
    loadAssignments()
    return () => { s.disconnect() }
  }, [examId])

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
            <Title order={2}>Proctor</Title>
            <Select
              label="Exam"
              placeholder="Select an exam"
              data={exams.map((ex: any) => ({ value: ex.id, label: `${ex.title} — ${ex.course?.code || ''} (${(ex.rooms || []).map((er: any) => er.room?.name).join(', ')})` }))}
              value={examId || null}
              onChange={(v) => setExamId(v || '')}
            />
            <Card withBorder padding="md">
              <Title order={4} mb="sm">Check-in</Title>
              <Stack gap="sm">
                <Select
                  label="Student (search by name or email)"
                  placeholder={examId ? "Type to search..." : "Select an exam first"}
                  searchable
                  nothingFoundMessage="No matching student"
                  data={assignments.map((a: any) => ({
                    value: a.rosterEntry?.email || '',
                    label: `${a.rosterEntry?.name || ''} (${a.rosterEntry?.email || ''}) — Seat ${a.seat?.label || ''}${a.checkedIn ? ' [checked in]' : ''}`,
                  }))}
                  value={selectedEmail}
                  onChange={setSelectedEmail}
                  disabled={!examId || assignments.length === 0}
                />
                <Group>
                  <Button onClick={checkIn} disabled={!examId || !selectedEmail}>Check in student</Button>
                  <Button variant="outline" onClick={() => setScanOpen(true)} disabled={!examId}>Scan student card</Button>
                </Group>
                <TextInput
                  label="Or enter barcode manually"
                  placeholder="Type/paste barcode"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  disabled={!examId}
                />
                <Button variant="light" onClick={() => barcodeInput.trim() && checkInByBarcode(barcodeInput.trim())} disabled={!examId || !barcodeInput.trim()}>
                  Check in by barcode
                </Button>
              </Stack>
              {msg && <Alert color="green" mt="sm">{msg}</Alert>}
              {error && <Alert color="red" mt="sm">{error}</Alert>}
            </Card>
            <Modal opened={scanOpen} onClose={() => setScanOpen(false)} title="Scan student card barcode" size="md">
              <Stack gap="sm">
                <Text size="sm" c="dimmed">Point the camera at the barcode on the student card.</Text>
                <div id="barcode-reader" style={{ width: '100%' }} />
                {scanError && <Alert color="red">{scanError}</Alert>}
              </Stack>
            </Modal>
            <Card withBorder padding="md">
              <Group justify="space-between" mb="sm">
                <Title order={4}>Live dashboard</Title>
                {assignments.length > 0 && <SegmentedControl size="xs" value={viewMode} onChange={(v) => setViewMode(v as 'list' | 'map')} data={[{ label: 'List', value: 'list' }, { label: 'Map', value: 'map' }]} />}
              </Group>
              {assignments.length > 0 && (
                <Text size="sm" mb="sm">
                  Checked in: {assignments.filter((a) => a.checkedIn).length} / {assignments.length} (Missing: {assignments.filter((a) => !a.checkedIn).length})
                </Text>
              )}
              {examId && assignments.length === 0 && <Text size="sm" c="dimmed">No assignments loaded (generate seats first).</Text>}
              {!examId && <Text size="sm" c="dimmed">Select an exam to load the dashboard.</Text>}
              {viewMode === 'list' && (
                <Stack gap="xs">
                  {assignments.map((a) => (
                    <Group key={a.id} justify="space-between">
                      <Text size="sm">{a.rosterEntry?.name} ({a.seat?.label})</Text>
                      <Text size="sm" c={a.checkedIn ? 'green' : 'red'}>{a.checkedIn ? 'Checked in' : 'Missing'}</Text>
                    </Group>
                  ))}
                </Stack>
              )}
              {viewMode === 'map' && assignments.length > 0 && (() => {
                const seats: any[] = assignments[0]?.seat?.room?.seats || []
                if (seats.length === 0) return <Text size="sm" c="dimmed">No seat map available.</Text>
                const bySeatId = new Map(assignments.map((a: any) => [a.seat?.id, a]))
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
                  <div style={{ marginTop: 8 }}>
                    <div style={{ overflowX: 'auto' }}>
                      {grid.map((row, ri) => (
                        <div key={ri} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                          {row.map((seat, ci) => {
                            const a = seat ? bySeatId.get(seat.id) as any : null
                            const checkedIn = a?.checkedIn
                            return (
                              <div
                                key={ci}
                                style={{
                                  width: 44, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  border: checkedIn ? '3px solid #2f9e44' : '1px solid #ccc', borderRadius: 4, fontSize: 10,
                                  backgroundColor: !seat ? '#f0f0f0' : seat.seatType === 'BROKEN' ? '#ffe3e3' : seat.seatType === 'ACCESSIBLE' ? '#e7f5ff' : seat.seatType === 'LEFT_HANDED' ? '#f3f0ff' : '#fff',
                                  color: '#000',
                                  opacity: seat ? 1 : 0.3,
                                }}
                                title={seat ? `${seat.label || `R${seat.row}C${seat.col}`} (${seat.seatType})${a ? ` - ${a.rosterEntry?.name}: ${checkedIn ? 'checked in' : 'missing'}` : ''}` : 'No seat'}
                              >
                                {seat ? (seat.label || '·') : ''}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                    <Group mt="sm" gap="xs" wrap="wrap">
                      <Text size="xs">Legend:</Text>
                      <span style={{ fontSize: 12 }}>🟩 Green border = checked in</span>
                      <span style={{ fontSize: 12 }}>⬜ Normal</span>
                      <span style={{ fontSize: 12 }}>🟦 Accessible</span>
                      <span style={{ fontSize: 12 }}>🟪 Left-handed</span>
                      <span style={{ fontSize: 12 }}>🟥 Broken</span>
                    </Group>
                  </div>
                )
              })()}
            </Card>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
