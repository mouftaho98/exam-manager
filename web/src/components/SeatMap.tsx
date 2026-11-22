/**
 * Draws a room's seats row by row (front of the room at the top). Rows can
 * have different lengths and gaps in `col` show as aisles.
 */
import { Group, Stack, Text, UnstyledButton } from '@mantine/core'
import type { Seat, SeatRow } from '../lib/types'

export type SeatLook = { bg: string; border?: string; text?: string; title?: string; label?: string }

/** Default colours by seat marking. */
export function markingLook(s: Seat): SeatLook {
  if (s.broken) return { bg: '#ffe3e3', title: `${s.label} (broken)` }
  if (s.accessible) return { bg: '#d0ebff', title: `${s.label} (accessible${s.leftHanded ? ', left-handed' : ''})` }
  if (s.leftHanded) return { bg: '#e5dbff', title: `${s.label} (left-handed)` }
  return { bg: '#fff', title: s.label }
}

type Props<S extends Seat> = {
  rows: SeatRow<S>[]
  look?: (seat: S) => SeatLook
  onSeatClick?: (seat: S) => void
}

export default function SeatMap<S extends Seat>({ rows, look = markingLook, onSeatClick }: Props<S>) {
  return (
    <Stack gap={4} style={{ overflowX: 'auto' }} data-testid="seat-map">
      <Text size="xs" c="dimmed" ta="center">Front of room</Text>
      {rows.map((r) => {
        const maxCol = Math.max(...r.seats.map((s) => s.col))
        const byCol = new Map(r.seats.map((s) => [s.col, s]))
        return (
          <Group key={r.row} gap={4} wrap="nowrap">
            {Array.from({ length: maxCol + 1 }, (_, col) => {
              const seat = byCol.get(col)
              if (!seat) return <div key={col} style={{ width: 44, height: 36 }} />
              const l = look(seat)
              return (
                <UnstyledButton
                  key={col}
                  title={l.title ?? seat.label}
                  aria-label={l.title ?? seat.label}
                  onClick={onSeatClick ? () => onSeatClick(seat) : undefined}
                  style={{
                    width: 44, height: 36, fontSize: 11, textAlign: 'center', lineHeight: '32px', flexShrink: 0,
                    borderRadius: 6, background: l.bg, color: l.text ?? '#222',
                    border: `2px solid ${l.border ?? '#ced4da'}`, cursor: onSeatClick ? 'pointer' : 'default',
                    overflow: 'hidden', whiteSpace: 'nowrap',
                  }}
                >
                  {l.label ?? seat.label}
                </UnstyledButton>
              )
            })}
          </Group>
        )
      })}
    </Stack>
  )
}
