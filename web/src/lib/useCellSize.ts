/**
 * Size seat squares so a cols x rows map fills the space it's given: wide
 * rooms get smaller seats, small rooms get bigger ones, and the map itself
 * stays about the same size. Attach `ref` to the element whose width the map
 * may use.
 */
import { useLayoutEffect, useRef, useState } from 'react'

type Options = {
  /** Largest seat width in px (small rooms don't get giant seats). */
  max?: number
  /** Smallest seat width in px; below this the map scrolls instead. */
  min?: number
  /** Seat height as a fraction of its width. */
  ratio?: number
  /** Optional: most of the window height the map may take (0–1). Off by
   *  default, so the map always uses the full width and tall rooms scroll. */
  maxHeight?: number
}

export function useCellSize(cols: number, rows: number, { max = 56, min = 12, ratio = 0.85, maxHeight }: Options = {}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  // Track the container's width (window resizes, sidebar wrapping, etc.).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const c = Math.max(cols, 1)
  const r = Math.max(rows, 1)
  const gapFor = (s: number) => Math.max(2, Math.round(s / 12))
  // Fill the width; optionally also keep the map within part of the window
  // height. The gap depends on the seat size, so estimate, then refine once.
  const fitTo = (gap: number) => {
    let s = width ? (width - (c - 1) * gap) / c : max
    if (maxHeight) s = Math.min(s, (window.innerHeight * maxHeight - (r - 1) * gap) / r / ratio)
    return Math.floor(Math.max(min, Math.min(max, s)))
  }
  let size = fitTo(2)
  size = fitTo(gapFor(size))

  return {
    ref,
    size,
    height: Math.round(size * ratio),
    gap: gapFor(size),
    fontSize: Math.max(8, Math.min(14, Math.round(size * 0.3))),
    /** Too small to fit a label like "AA12"; show it on hover instead. */
    showLabels: size >= 22,
  }
}
