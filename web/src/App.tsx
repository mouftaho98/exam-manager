/**
 * Routes. Roles are per course offering, so there's one dashboard for
 * everyone; each page asks the API what the user can do there.
 */
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import AdminPage from './pages/AdminPage'
import CoursePage from './pages/CoursePage'
import CoursesPage from './pages/CoursesPage'
import DashboardPage from './pages/DashboardPage'
import ExamPage from './pages/ExamPage'
import ExamSetupPage from './pages/ExamSetupPage'
import HomePage from './pages/HomePage'
import InvitePage from './pages/InvitePage'
import LoginPage from './pages/LoginPage'
import OfferingPage from './pages/OfferingPage'
import RoomPage from './pages/RoomPage'
import RoomsPage from './pages/RoomsPage'
import SignupPage from './pages/SignupPage'

const auth = (page: ReactNode) => <RequireAuth>{page}</RequireAuth>

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/dashboard" element={auth(<DashboardPage />)} />
        <Route path="/admin" element={auth(<AdminPage />)} />
        <Route path="/courses" element={auth(<CoursesPage />)} />
        <Route path="/courses/:courseId" element={auth(<CoursePage />)} />
        <Route path="/offerings/:offeringId" element={auth(<OfferingPage />)} />
        <Route path="/rooms" element={auth(<RoomsPage />)} />
        <Route path="/rooms/:roomId" element={auth(<RoomPage />)} />
        <Route path="/exams/:examId" element={auth(<ExamPage />)} />
        <Route path="/exams/:examId/setup" element={auth(<ExamSetupPage />)} />
        {/* Old role pages from the first UI. */}
        <Route path="/student" element={<Navigate to="/dashboard" replace />} />
        <Route path="/proctor" element={<Navigate to="/dashboard" replace />} />
        <Route path="/instructor/*" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
