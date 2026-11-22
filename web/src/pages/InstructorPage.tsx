import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Title, Card, Text } from '@mantine/core'
import { clearToken } from '../lib/api'

export default function InstructorPage() {
  const navigate = useNavigate()
  const logout = () => { clearToken(); navigate('/login') }

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="sm" py="xs" justify="space-between" wrap="wrap" gap="xs">
          <Title order={4}>RollCall — Instructor</Title>
          <Button size="xs" variant="subtle" onClick={logout}>Log out</Button>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="sm" py="xl">
          <Stack gap="lg">
            <Title order={2}>Instructor dashboard</Title>
            <Text c="dimmed">Choose what you want to manage:</Text>
            <Card withBorder padding="lg" style={{ cursor: 'pointer' }} onClick={() => navigate('/instructor/courses')}>
              <Title order={4}>Courses & Rosters</Title>
              <Text size="sm" c="dimmed">Create courses and upload/manage student rosters.</Text>
            </Card>
            <Card withBorder padding="lg" style={{ cursor: 'pointer' }} onClick={() => navigate('/instructor/rooms')}>
              <Title order={4}>Rooms</Title>
              <Text size="sm" c="dimmed">Create and view seating map rooms.</Text>
            </Card>
            <Card withBorder padding="lg" style={{ cursor: 'pointer' }} onClick={() => navigate('/instructor/exams')}>
              <Title order={4}>Exams</Title>
              <Text size="sm" c="dimmed">Create exams and generate seating assignments.</Text>
            </Card>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}