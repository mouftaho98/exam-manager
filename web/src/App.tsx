import { BrowserRouter, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import StudentPage from './pages/StudentPage'
import ProctorPage from './pages/ProctorPage'
import InstructorPage from './pages/InstructorPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/student" element={<StudentPage />} />
        <Route path="/proctor" element={<ProctorPage />} />
        <Route path="/instructor" element={<InstructorPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
