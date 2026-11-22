import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Stack, Text, Title } from '@mantine/core'

export default function StudentPage() {
  const navigate = useNavigate()
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>RollCall</Title>
          <Button variant="subtle" onClick={() => navigate('/')}>Home</Button>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="sm" py="xl">
          <Stack gap="md">
            <Title order={2}>Student</Title>
            <Text c="dimmed">Student view (placeholder). Later: check-in / view assigned seat.</Text>
            <Button onClick={() => navigate('/')}>Back to home</Button>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
