/**
 * Draws a room's seats row by row (front of the room at the top). Rows can
 * have different lengths and gaps in `col` show as aisles. With `axes`, row
 * letters run down the left and seat numbers across the top, so a label like
 * "D8" can be found by eye.
 */
import { Group, Stack, Text, UnstyledButton } from '@mantine/core'
import type { Seat, SeatRow } from '../lib/types'
import { fitCells, useElementSize } from '../lib/useCellSize'

/** Height taken by the "Front of room" bar above the seats. */
const HEADER_HEIGHT = 34
/** Width of the row-letter column, and height of the seat-number row, with `axes`. */
const AXIS_WIDTH = 28
const AXIS_HEIGHT = 20

export type SeatLook = { bg: string; border?: string; text?: string; title?: string; label?: string; fontScale?: number }

/** Default colours by seat marking. */
export function markingLook(s: Seat): SeatLook {
  if (s.broken) return { bg: '#ffe3e3', title: `${s.label} (broken)` }
  if (s.accessible) return { bg: '#d0ebff', title: `${s.label} (accessible${s.leftHanded ? ', left-handed' : ''})` }
  if (s.leftHanded) return { bg: '#e5dbff', title: `${s.label} (left-handed)` }
  return { bg: '#fff', title: s.label }
}

type Props<S extends Seat> = {
  rows: SeatRow<S>[]
  /** Fill this height as well as the width (e.g. to match a sidebar next to the map). */
  fillHeight?: number
  /** Row letters down the left and seat numbers across the top, and slightly smaller seats. */
  axes?: boolean
  look?: (seat: S) => SeatLook
  onSeatClick?: (seat: S) => void
}

export default function SeatMap<S extends Seat>({ rows, look = markingLook, onSeatClick, fillHeight, axes }: Props<S>) {
  // Size seats to fill the available width (including walkway rows), so
  // every room's map takes about the same space whatever its size.
  const cols = Math.max(1, ...rows.flatMap((r) => r.seats.map((s) => s.col + 1)))
  const rowSpan = rows.length ? rows[rows.length - 1].row - rows[0].row + 1 : 1
  const box = useElementSize()
  const gutter = axes ? AXIS_WIDTH : 0
  const fit = fitCells(cols, rowSpan, Math.max(0, box.width - gutter), fillHeight ? { height: fillHeight - HEADER_HEIGHT } : { max: axes ? 56 : 90 })
  // Seat numbers by column and letters by row, read off the seat labels (aisles are skipped in labels).
  const colLabels = Array.from({ length: cols }, (_, c) => {
    for (const r of rows) { const seat = r.seats.find((x) => x.col === c); if (seat) return seat.label.replace(/^[A-Za-z]+/, '') }
    return ''
  })

  return (
    <div ref={box.ref} style={{ overflowX: 'auto' }}>
    {/* inline-flex so "Front of room" is centred over the seats, not the page */}
    <Stack gap={fit.gap} style={{ display: 'inline-flex' }} data-testid="seat-map">
      <Text size="xs" c="dimmed" ta="center" bg="gray.1" mb={8} style={{ borderRadius: 4, height: HEADER_HEIGHT - 8 - fit.gap, lineHeight: `${HEADER_HEIGHT - 8 - fit.gap}px` }}>Front of room</Text>
      {axes && (
        <Group gap={fit.gap} wrap="nowrap" style={{ height: AXIS_HEIGHT }}>
          <div style={{ width: gutter, flexShrink: 0 }} />
          {colLabels.map((label, c) => (
            <Text key={c} size="xs" c="dimmed" ta="center" fw={600} style={{ width: fit.size, flexShrink: 0 }}>{label}</Text>
          ))}
        </Group>
      )}
      {rows.map((r, i) => {
        // A gap in row numbers is a walkway; leave the space for it.
        const missing = i > 0 ? r.row - rows[i - 1].row - 1 : 0
        const walkway = missing > 0 ? missing * (fit.height + fit.gap) : 0
        const maxCol = Math.max(...r.seats.map((s) => s.col))
        const byCol = new Map(r.seats.map((s) => [s.col, s]))
        return (
          <Group key={r.row} gap={fit.gap} wrap="nowrap" mt={walkway}>
            {axes && <Text size="xs" c="dimmed" fw={600} ta="center" style={{ width: gutter, flexShrink: 0 }}>{r.seats[0]?.label.replace(/\d+$/, '')}</Text>}
            {Array.from({ length: maxCol + 1 }, (_, col) => {
              const seat = byCol.get(col)
              if (!seat) return <div key={col} style={{ width: fit.size, height: fit.height, flexShrink: 0 }} />
              const l = look(seat)
              return (
                <UnstyledButton
                  key={col}
                  title={l.title ?? seat.label}
                  aria-label={l.title ?? seat.label}
                  onClick={onSeatClick ? () => onSeatClick(seat) : undefined}
                  style={{
                    width: fit.size, height: fit.height, fontSize: Math.round(fit.fontSize * (l.fontScale ?? 1)), flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: Math.max(3, fit.size / 7), background: l.bg, color: l.text ?? '#222',
                    border: `2px solid ${l.border ?? '#ced4da'}`, cursor: onSeatClick ? 'pointer' : 'default',
                    overflow: 'hidden', whiteSpace: 'nowrap', boxSizing: 'border-box',
                  }}
                >
                  {fit.showLabels ? l.label ?? seat.label : ''}
                </UnstyledButton>
              )
            })}
          </Group>
        )
      })}
    </Stack>
    </div>
  )
}
