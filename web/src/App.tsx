import {
  AppShell,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from '@mantine/core'

function App() {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>RollCall</Title>
          <Text size="sm" c="dimmed">
            Exam Manager
          </Text>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="sm" py="xl">
          <Stack gap="lg">
            <div>
              <Title order={1}>Welcome to RollCall</Title>
              <Text c="dimmed" mt="xs">
                Cloud-based exam seating and live check-in for instructors, proctors, and students.
              </Text>
            </div>

            <Card withBorder shadow="sm" radius="md" padding="lg">
              <Stack gap="sm">
                <Title order={4}>Get started</Title>
                <Text size="sm" c="dimmed">
                  Choose your role to continue (UI placeholder — sign-in flows coming next).
                </Text>
                <Stack gap="sm">
                  <Button fullWidth variant="filled">
                    I&apos;m a Student
                  </Button>
                  <Button fullWidth variant="light">
                    I&apos;m a Proctor
                  </Button>
                  <Button fullWidth variant="outline">
                    I&apos;m an Instructor
                  </Button>
                </Stack>
              </Stack>
            </Card>

            <Text size="xs" c="dimmed">
              Mobile-friendly by design. API: set <code>VITE_API_URL</code> later to connect to the backend.
            </Text>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}

export default App
