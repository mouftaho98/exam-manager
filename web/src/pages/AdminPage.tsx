/** Admins approve or reject requests to become an instructor. */
import { useState } from 'react'
import { Alert, Button, Card, Group, SegmentedControl, Stack, Text } from '@mantine/core'
import Layout from '../components/Layout'
import { api, errorMessage } from '../lib/api'
import { useLoad } from '../lib/hooks'
import type { User } from '../lib/types'

export default function AdminPage() {
  const [status, setStatus] = useState('PENDING')
  const list = useLoad(() => api.get<{ users: User[] }>(`/admin/instructor-requests?status=${status}`), [status])
  const [error, setError] = useState('')

  const decide = async (u: User, decision: 'approve' | 'reject') => {
    setError('')
    try {
      await api.post(`/admin/instructor-requests/${u.id}/${decision}`)
      list.reload()
    } catch (e) { setError(errorMessage(e)) }
  }

  return (
    <Layout title="Instructor requests">
      <Stack gap="md">
        <SegmentedControl value={status} onChange={setStatus} data={[
          { label: 'Pending', value: 'PENDING' }, { label: 'Approved', value: 'APPROVED' }, { label: 'Rejected', value: 'REJECTED' },
        ]} />
        {(error || list.error) && <Alert color="red">{error || list.error}</Alert>}
        {list.data?.users.length === 0 && <Text c="dimmed">Nothing here.</Text>}
        {list.data?.users.map((u) => (
          <Card key={u.id} withBorder padding="sm" data-testid="instructor-request">
            <Group justify="space-between">
              <div>
                <Text fw={500}>{u.name}</Text>
                <Text size="sm" c="dimmed">{u.email}</Text>
              </div>
              <Group gap="xs">
                {status !== 'APPROVED' && <Button size="xs" onClick={() => decide(u, 'approve')}>Approve</Button>}
                {status !== 'REJECTED' && <Button size="xs" color="red" variant="light" onClick={() => decide(u, 'reject')}>Reject</Button>}
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>
    </Layout>
  )
}
