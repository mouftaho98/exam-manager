/** Landing page. Signed-in visitors go straight to their dashboard. */
import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Card, Stack, Text, Title } from '@mantine/core'
import { getToken } from '../lib/api'
import PublicFrame from './PublicFrame'

export default function HomePage() {
  const navigate = useNavigate()
  if (getToken()) return <Navigate to="/dashboard" replace />
  return (
    <PublicFrame>
      <Stack gap="lg">
        <div>
          <Title order={1}>Welcome to RollCall</Title>
          <Text c="dimmed" mt="xs">Exam seating and live multi-room check-in for instructors, proctors and students.</Text>
        </div>
        <Card withBorder shadow="sm" radius="md" padding="lg">
          <Stack gap="sm">
            <Button fullWidth onClick={() => navigate('/login')}>Log in</Button>
            <Button fullWidth variant="outline" onClick={() => navigate('/signup')}>Sign up</Button>
          </Stack>
        </Card>
      </Stack>
    </PublicFrame>
  )
}
