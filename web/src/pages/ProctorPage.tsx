import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Text, Title } from '@mantine/core'
import { clearToken } from '../lib/api'

export default function ProctorPage() {
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
            <Title order={2}>Proctor</Title>
            <Text c="dimmed">Proctor view (placeholder). Later: scan/check-in students, live room status.</Text>
            <Button onClick={() => navigate('/')}>Back to home</Button>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
