import { BrowserRouter, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import StudentPage from './pages/StudentPage'
import ProctorPage from './pages/ProctorPage'
import InstructorPage from './pages/InstructorPage'
import InstructorCoursesPage from './pages/instructor/InstructorCoursesPage'
import InstructorRoomsPage from './pages/instructor/InstructorRoomsPage'
import InstructorExamsPage from './pages/instructor/InstructorExamsPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route
          path="/student"
          element={
            <ProtectedRoute>
              <StudentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/proctor"
          element={
            <ProtectedRoute>
              <ProctorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor"
          element={
            <ProtectedRoute>
              <InstructorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/courses"
          element={
            <ProtectedRoute>
              <InstructorCoursesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/rooms"
          element={
            <ProtectedRoute>
              <InstructorRoomsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/exams"
          element={
            <ProtectedRoute>
              <InstructorExamsPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
