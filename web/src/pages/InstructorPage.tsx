import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Text, Title } from '@mantine/core'
import { clearToken } from '../lib/api'

export default function InstructorPage() {
  const navigate = useNavigate()
  const logout = () => {
    clearToken()
    navigate('/login')
  }
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>RollCall</Title>
          <Button variant="subtle" onClick={logout}>Log out</Button>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="sm" py="xl">
          <Stack gap="md">
            <Title order={2}>Instructor</Title>
            <Text c="dimmed">Instructor view (placeholder). Later: manage courses, rooms, rosters, seating.</Text>
            <Button onClick={() => navigate('/')}>Back to home</Button>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}