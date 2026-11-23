/**
 * The invite link an instructor shares (or the one made by a roster upload).
 * Shows what the invite is for; once signed in with the invited email,
 * accepting it joins the offering.
 */
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { api, errorMessage, getToken } from '../lib/api'
import { roleLabel } from '../lib/format'
import { useLoad } from '../lib/hooks'
import type { Offering, Role } from '../lib/types'
import PublicFrame from './PublicFrame'

type Invite = { email: string; role: Role; offering: Offering; accountExists: boolean }

export default function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const invite = useLoad(() => api.get<Invite>(`/invites/${token}`), [token])
  const [error, setError] = useState('')
  const signedIn = !!getToken()
  const here = `/invite/${token}`

  const accept = async () => {
    setError('')
    try {
      const res = await api.post<{ offeringId: string }>(`/invites/${token}/accept`)
      navigate(`/offerings/${res.offeringId}`)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const inv = invite.data
  return (
    <PublicFrame>
      <Stack gap="md">
        <Title order={2}>You're invited</Title>
        {invite.loading && <Loader />}
        {invite.error && <Alert color="red">This invite link is not valid. It may have been used already or replaced.</Alert>}
        {inv && (
          <Card withBorder padding="lg">
            <Stack gap="sm">
              <Text>
                Join <b>{inv.offering.course.code} — {inv.offering.course.name}</b> ({inv.offering.term}) as {inv.role === 'INSTRUCTOR' ? 'an' : 'a'} <b>{roleLabel(inv.role).toLowerCase()}</b>.
              </Text>
              <Text size="sm" c="dimmed">This invite is for {inv.email}.</Text>
              {error && <Alert color="red">{error}</Alert>}
              {signedIn ? (
                <Button onClick={accept}>Accept invite</Button>
              ) : (
                <Group grow>
                  <Button onClick={() => navigate(`/${inv.accountExists ? 'login' : 'signup'}?next=${here}&email=${encodeURIComponent(inv.email)}`)}>
                    {inv.accountExists ? 'Log in to accept' : 'Sign up to accept'}
                  </Button>
                </Group>
              )}
            </Stack>
          </Card>
        )}
      </Stack>
    </PublicFrame>
  )
}
