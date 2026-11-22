/** Frame for signed-out pages (home, login, sign-up, invites). */
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell, Button, Container, Group, Title } from '@mantine/core'

export default function PublicFrame({ children }: { children: ReactNode }) {
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
        <Container size="xs" py="xl">{children}</Container>
      </AppShell.Main>
    </AppShell>
  )
}
