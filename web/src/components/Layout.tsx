/** Page frame for signed-in pages: header with navigation and log out. */
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell, Anchor, Button, Container, Group, Text, Title } from '@mantine/core'
import { clearToken } from '../lib/api'
import { useMe } from '../lib/hooks'

export default function Layout({ title, children, size = 'md' }: { title?: string; children: ReactNode; size?: string }) {
  const navigate = useNavigate()
  const { user, isStaff } = useMe()
  const logout = () => { clearToken(); navigate('/login') }

  return (
    <AppShell header={{ height: { base: 96, sm: 60 } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="wrap" gap="xs">
          <Group gap="md" wrap="wrap">
            <Anchor component={Link} to="/dashboard" underline="never"><Title order={3}>RollCall</Title></Anchor>
            <Anchor component={Link} to="/dashboard" size="sm">Dashboard</Anchor>
            {user?.instructorStatus === 'APPROVED' && <Anchor component={Link} to="/courses" size="sm">Courses</Anchor>}
            {isStaff && <Anchor component={Link} to="/rooms" size="sm">Rooms</Anchor>}
            {user?.isAdmin && <Anchor component={Link} to="/admin" size="sm">Admin</Anchor>}
          </Group>
          <Group gap="xs">
            {user && <Text size="sm" c="dimmed">{user.name}</Text>}
            <Button size="xs" variant="subtle" onClick={logout}>Log out</Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size={size} py="md">
          {title && <Title order={2} mb="md">{title}</Title>}
          {children}
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
