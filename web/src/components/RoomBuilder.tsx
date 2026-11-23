/**
 * Draw a room the way it looks. The room is a grid: click or drag across
 * squares to place seats; empty squares are aisles and an empty row is a
 * walkway. Other tools mark seats accessible, left-handed or broken.
 *
 * Seats are labelled as you draw: rows with seats get letters from the front
 * (A, B, C…) and seats are numbered left to right, skipping aisles, so the
 * labels match what students see on their seat.
 */
import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Group, NumberInput, SegmentedControl, Stack, Text } from '@mantine/core'
import type { Room } from '../lib/types'

export type Cell = { accessible: boolean; leftHanded: boolean; broken: boolean } | null
export type Grid = Cell[][]
type Tool = 'seat' | 'accessible' | 'leftHanded' | 'broken'

const MAX_ROWS = 40
const MAX_COLS = 60
const plainSeat = () => ({ accessible: false, leftHanded: false, broken: false })

/** A rows x cols grid, filled with plain seats or empty. */
export function makeGrid(rows: number, cols: number, filled = true): Grid {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (filled ? plainSeat() : null)))
}

/** The grid for an existing room (empty rows and aisles come back as gaps). */
export function gridFromRoom(room: Pick<Room, 'rows'>): Grid {
  const seats = room.rows.flatMap((r) => r.seats.map((s) => ({ ...s, row: r.row })))
  const rows = Math.max(...seats.map((s) => s.row)) + 1
  const cols = Math.max(...seats.map((s) => s.col)) + 1
  const grid = makeGrid(rows, cols, false)
  for (const s of seats) grid[s.row][s.col] = { accessible: s.accessible, leftHanded: s.leftHanded, broken: s.broken }
  return grid
}

/** Row letters: A..Z, then AA, AB… */
function rowLetter(i: number) {
  let label = ''
  let n = i
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

/** Label for every seat square, e.g. "C4" (empty squares get null). */
export function seatLabels(grid: Grid): (string | null)[][] {
  let letter = 0
  return grid.map((row) => {
    if (!row.some(Boolean)) return row.map(() => null)
    const prefix = rowLetter(letter++)
    let n = 0
    return row.map((cell) => (cell ? `${prefix}${++n}` : null))
  })
}

/**
 * The `rows` body the API expects. Leading/trailing empty rows and columns
 * are trimmed; empty rows in between are kept as walkways.
 */
export function gridToRows(grid: Grid) {
  const used = grid.map((row) => row.some(Boolean))
  const first = used.indexOf(true)
  const last = used.lastIndexOf(true)
  if (first < 0) return []
  const firstCol = Math.min(...grid.map((row) => row.findIndex(Boolean)).filter((i) => i >= 0))
  const labels = seatLabels(grid)
  return grid.slice(first, last + 1).map((row, i) => ({
    seats: row.flatMap((cell, col) =>
      cell ? [{ col: col - firstCol, label: labels[first + i][col]!, accessible: cell.accessible, leftHanded: cell.leftHanded, broken: cell.broken }] : [],
    ),
  }))
}

export const seatCount = (grid: Grid) => grid.flat().filter(Boolean).length
export const usableCount = (grid: Grid) => grid.flat().filter((c) => c && !c.broken).length

function cellStyle(cell: Cell): React.CSSProperties {
  if (!cell) return { background: 'transparent', border: '1px dashed #dee2e6', color: '#adb5bd' }
  if (cell.broken) return { background: '#ffe3e3', border: '2px solid #fa5252', color: '#c92a2a', textDecoration: 'line-through' }
  if (cell.accessible) return { background: '#d0ebff', border: `2px solid ${cell.leftHanded ? '#7950f2' : '#228be6'}`, color: '#1864ab' }
  if (cell.leftHanded) return { background: '#e5dbff', border: '2px solid #7950f2', color: '#5f3dc4' }
  return { background: '#fff', border: '2px solid #868e96', color: '#212529' }
}

function describe(cell: Cell, label: string | null, r: number, c: number) {
  if (!cell) return `Empty, row ${r + 1} column ${c + 1}`
  const marks = [cell.accessible && 'accessible', cell.leftHanded && 'left-handed', cell.broken && 'broken'].filter(Boolean)
  return marks.length ? `${label} (${marks.join(', ')})` : `${label}`
}

export default function RoomBuilder({ grid, onChange }: { grid: Grid; onChange: (g: Grid) => void }) {
  const [tool, setTool] = useState<Tool>('seat')
  // While the pointer is down, every square it passes gets the same change
  // (add or remove), decided by the first square, like a paint brush.
  const stroke = useRef<{ add: boolean; touched: Set<string>; last: readonly [number, number] } | null>(null)
  const latest = useRef(grid)
  latest.current = grid

  useEffect(() => {
    const end = () => { stroke.current = null }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => { window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end) }
  }, [])

  const has = (cell: Cell) => (tool === 'seat' ? !!cell : !!cell?.[tool])
  const apply = (r: number, c: number) => {
    const s = stroke.current
    if (!s || s.touched.has(`${r},${c}`)) return
    s.touched.add(`${r},${c}`)
    const next = latest.current.map((row) => row.slice())
    const cell = next[r][c]
    if (tool === 'seat') next[r][c] = s.add ? cell ?? plainSeat() : null
    else if (s.add) next[r][c] = { ...(cell ?? plainSeat()), [tool]: true }
    else if (cell) next[r][c] = { ...cell, [tool]: false }
    latest.current = next
    onChange(next)
  }
  const cellAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const r = el?.dataset.r
    const c = el?.dataset.c
    return r !== undefined && c !== undefined ? [Number(r), Number(c)] as const : null
  }

  const resize = (rows: number, cols: number) => {
    rows = Math.min(MAX_ROWS, Math.max(1, rows || 1))
    cols = Math.min(MAX_COLS, Math.max(1, cols || 1))
    onChange(Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => grid[r]?.[c] ?? null)))
  }

  const labels = seatLabels(grid)
  const rows = grid.length
  const cols = grid[0]?.length ?? 0

  return (
    <Stack gap="sm">
      <Group gap="sm" align="flex-end" wrap="wrap">
        <NumberInput label="Rows" value={rows} min={1} max={MAX_ROWS} w={90} onChange={(v) => resize(Number(v), cols)} />
        <NumberInput label="Columns" value={cols} min={1} max={MAX_COLS} w={100} onChange={(v) => resize(rows, Number(v))} />
        <Button variant="light" size="sm" onClick={() => onChange(makeGrid(rows, cols, true))}>Fill with seats</Button>
        <Button variant="subtle" size="sm" color="gray" onClick={() => onChange(makeGrid(rows, cols, false))}>Clear</Button>
      </Group>

      <Group justify="space-between" wrap="wrap" gap="xs">
        <SegmentedControl
          size="xs" value={tool} onChange={(v) => setTool(v as Tool)} aria-label="Drawing tool"
          data={[
            { label: 'Seats', value: 'seat' },
            { label: 'Accessible', value: 'accessible' },
            { label: 'Left-handed', value: 'leftHanded' },
            { label: 'Broken', value: 'broken' },
          ]}
        />
        <Text size="sm" data-testid="builder-count"><b>{usableCount(grid)}</b> usable seats{seatCount(grid) !== usableCount(grid) ? ` (${seatCount(grid) - usableCount(grid)} broken)` : ''}</Text>
      </Group>
      <Text size="xs" c="dimmed">
        {tool === 'seat'
          ? 'Click or drag to add seats. Click or drag over seats to remove them and leave an aisle. An empty row becomes a walkway.'
          : 'Click or drag over seats to turn this marking on; do it again to turn it off.'}
      </Text>

      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div
          style={{ display: 'inline-block', touchAction: 'none', userSelect: 'none' }}
          onPointerDown={(e) => {
            const hit = cellAt(e.clientX, e.clientY)
            if (!hit) return
            e.preventDefault()
            stroke.current = { add: !has(grid[hit[0]][hit[1]]), touched: new Set(), last: hit }
            apply(hit[0], hit[1])
          }}
          onPointerMove={(e) => {
            const s = stroke.current
            if (!s) return
            const hit = cellAt(e.clientX, e.clientY)
            if (!hit) return
            // Fill every square between the last one and this one, so a fast
            // drag (few move events) doesn't skip squares.
            const [r0, c0] = s.last
            const steps = Math.max(Math.abs(hit[0] - r0), Math.abs(hit[1] - c0))
            for (let i = 1; i <= steps; i++) {
              apply(Math.round(r0 + ((hit[0] - r0) * i) / steps), Math.round(c0 + ((hit[1] - c0) * i) / steps))
            }
            s.last = hit
          }}
        >
          <div style={{ textAlign: 'center', fontSize: 11, color: '#495057', background: '#f1f3f5', borderRadius: 4, padding: '2px 0', marginBottom: 6 }}>
            Front of room
          </div>
          {grid.map((row, r) => (
            <div key={r} style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
              {row.map((cell, c) => (
                <div
                  key={c}
                  role="button"
                  data-r={r}
                  data-c={c}
                  data-testid={`cell-${r}-${c}`}
                  aria-label={describe(cell, labels[r][c], r, c)}
                  title={describe(cell, labels[r][c], r, c)}
                  style={{
                    width: 34, height: 30, borderRadius: 5, fontSize: 10, lineHeight: '26px', textAlign: 'center',
                    cursor: 'pointer', flexShrink: 0, boxSizing: 'border-box', ...cellStyle(cell),
                  }}
                >
                  {cell ? labels[r][c] : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <Group gap="xs">
        <Badge variant="outline" color="gray">Seat</Badge>
        <Badge variant="light" color="blue">Accessible</Badge>
        <Badge variant="light" color="violet">Left-handed</Badge>
        <Badge variant="light" color="red">Broken (never assigned)</Badge>
        <Badge variant="transparent" color="gray">Dashed = aisle / empty</Badge>
      </Group>
    </Stack>
  )
}
