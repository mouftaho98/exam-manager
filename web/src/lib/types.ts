/** Shapes the API returns (see api/src/serializers.ts and the routes). */
export type Role = 'INSTRUCTOR' | 'PROCTOR' | 'STUDENT'
export type Semester = 'WINTER' | 'SUMMER' | 'FALL'
export type InstructorStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'

export type User = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  name: string
  studentNumber: string | null
  needsAccessible: boolean
  leftHanded: boolean
  instructorStatus: InstructorStatus
  isAdmin: boolean
}

export type Course = { id: string; code: string; name: string }
export type Offering = { id: string; year: number; semester: Semester; term: string; course: Course }
export type MyOffering = Offering & { role: Role }

export type Member = {
  id: string
  userId: string
  email: string
  role: Role
  status: 'INVITED' | 'ACTIVE'
  name: string
  studentNumber: string | null
  needsAccessible: boolean
  leftHanded: boolean
  inviteUrl?: string
}

export type Seat = { id: string; row: number; col: number; label: string; accessible: boolean; leftHanded: boolean; broken: boolean }
export type SeatRow<S = Seat> = { row: number; seats: S[] }
export type RoomSummary = { id: string; name: string; building: string | null; capacity: number }
export type Room = RoomSummary & { createdById: string | null; rows: SeatRow[] }

export type Exam = {
  id: string
  offeringId: string
  title: string
  startsAt: string
  durationMinutes: number
  seatingGeneratedAt: string | null
  rooms: { id: string; name: string; building: string | null }[]
}

export type StudentSummary = {
  studentId: string
  name: string
  email: string
  studentNumber: string | null
  needsAccessible: boolean
  leftHanded: boolean
}
export type SeatingSeat = Seat & { student: (StudentSummary & { manual: boolean; checkedInAt: string | null }) | null }
export type Seating = {
  examId: string
  rooms: { id: string; name: string; building: string | null; rows: SeatRow<SeatingSeat>[] }[]
  unassigned: StudentSummary[]
}
export type Attendance = {
  totals: { assigned: number; checkedIn: number; missing: number }
  rooms: { id: string; name: string; capacity: number; assigned: number; checkedIn: number }[]
  missing: (StudentSummary & { roomId: string; seatLabel: string })[]
}

export type MyExam = {
  id: string
  title: string
  startsAt: string
  durationMinutes: number
  offering: Offering
  seat: Seat | null
  room: { id: string; name: string; building: string | null } | null
  checkedInAt: string | null
}
