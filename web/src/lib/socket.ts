/**
 * Live exam-day updates over Socket.IO. Staff join an exam's channel and get
 * an event whenever someone checks in, a seat moves or seating is regenerated.
 */
import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { API_URL, getToken } from './api'

const EVENTS = ['checkin:created', 'checkin:removed', 'seat:moved', 'seating:generated', 'seating:cleared'] as const

/** Calls `onEvent` for every live event on `examId`. Returns whether we're connected. */
export function useExamEvents(examId: string | undefined, onEvent: (event: string, payload: any) => void) {
  const [live, setLive] = useState(false)
  useEffect(() => {
    if (!examId) return
    // websocket only, so no sticky sessions are needed behind the load balancer.
    const socket = io(API_URL, { auth: { token: getToken() }, transports: ['websocket'] })
    const join = () => socket.emit('exam:join', { examId }, (res: { ok: boolean }) => setLive(res?.ok === true))
    socket.on('connect', join)
    socket.on('disconnect', () => setLive(false))
    for (const e of EVENTS) socket.on(e, (payload) => onEvent(e, payload))
    return () => { socket.disconnect() }
  }, [examId, onEvent])
  return live
}
