/**
 * Sizing seat squares so a room map fills the space it's given. Wide rooms
 * get narrower seats and long rooms get shorter ones, so the map itself
 * keeps the same size whatever the room.
 */
import { useCallback, useLayoutEffect, useState } from 'react'

/**
 * Live width/height/top of an element (window resizes, sidebar wrapping, …).
 * `ref` is a callback ref, so it also works for elements that only appear
 * later (e.g. after data loads).
 */
export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const [el, setEl] = useState<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0, top: 0 })
  useLayoutEffect(() => {
    if (!el) return
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight, top: el.offsetTop })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  const ref = useCallback((node: T | null) => setEl(node), [])
  return { ref, ...size }
}

type FitOptions = {
  /** Fill this height too (seats get as tall as needed). Without it, seat height follows the width. */
  height?: number
  /** Largest seat width in px. */
  max?: number
  /** Smallest seat width (and height) in px; below this the map scrolls instead. */
  min?: number
  /** Seat height as a fraction of its width, when not filling a height. */
  ratio?: number
}

/** Seat width/height and gap so `cols` x `rows` seats fill `width` (and `height`, if given). */
export function fitCells(cols: number, rows: number, width: number, { height, max = Infinity, min = 12, ratio = 0.85 }: FitOptions = {}) {
  const c = Math.max(cols, 1)
  const r = Math.max(rows, 1)
  const gapFor = (s: number) => Math.max(2, Math.min(8, Math.round(s / 12)))
  const fitWidth = (gap: number) => Math.floor(Math.max(min, Math.min(max, width ? (width - (c - 1) * gap) / c : 40)))
  // The gap depends on the seat size, so estimate, then refine once.
  const w = fitWidth(gapFor(fitWidth(2)))
  const gap = gapFor(w)
  const h = height && height > 0
    ? Math.floor(Math.max(min, (height - (r - 1) * gap) / r))
    : Math.round(w * ratio)
  const small = Math.min(w, h)
  return {
    size: w,
    height: h,
    gap,
    fontSize: Math.max(8, Math.min(16, Math.round(small * 0.3))),
    /** Too small to fit a label like "AA12"; show it on hover instead. */
    showLabels: w >= 22 && h >= 14,
  }
}

/** fitCells for the element `ref` is attached to (fills its width). */
export function useCellSize(cols: number, rows: number, options: FitOptions = {}) {
  const box = useElementSize()
  return { ref: box.ref, ...fitCells(cols, rows, box.width, options) }
}
