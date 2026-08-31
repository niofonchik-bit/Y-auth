import Delete from '@mui/icons-material/Delete';
import Logout from '@mui/icons-material/Logout';
import { Alert, Button, Chip, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, csrfToken } from '../api';
import AsyncButton from '../components/AsyncButton';

interface Account {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  createdAt: string;
}

interface Session {
  id: string;
  current: boolean;
  browser: string;
  os: string;
  lastIp: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

export default function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [csrf, setCsrf] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const [accountResult, sessionResult, token] = await Promise.all([
      api<Account>('/api/v1/account'),
      api<{ items: Session[] }>('/api/v1/account/sessions'),
      csrfToken(),
    ]);
    setAccount(accountResult);
    setSessions(sessionResult.items);
    setCsrf(token);
  }, []);

  useEffect(() => {
    load().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : 'Unable to load account'),
    );
  }, [load]);

  const run = async (operation: () => Promise<unknown>, reload = true) => {
    setLoading(true);
    setError(null);
    try {
      await operation();
      if (reload) await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  if (!account)
    return <Alert severity={error ? 'warning' : 'info'}>{error ?? 'Loading account…'}</Alert>;

  const changePassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() =>
      api('/api/v1/account/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: form.get('currentPassword'),
          newPassword: form.get('newPassword'),
          csrfToken: csrf,
        }),
      }),
    );
  };

  const changeEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() =>
      api('/api/v1/account/change-email', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: form.get('currentPassword'),
          newEmail: form.get('newEmail'),
          csrfToken: csrf,
        }),
      }),
    );
  };

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ justifyContent: 'space-between' }}
        >
          <div>
            <Typography variant="h4">{account.displayName ?? account.email}</Typography>
            <Typography color="text.secondary">{account.email}</Typography>
          </div>
          <Chip
            label={account.emailVerified ? 'Email verified' : 'Email not verified'}
            color={account.emailVerified ? 'success' : 'default'}
          />
        </Stack>
      </Paper>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Sessions
        </Typography>
        <Stack divider={<Divider flexItem />}>
          {sessions.map((session) => (
            <Stack
              key={session.id}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              sx={{ py: 2, justifyContent: 'space-between' }}
            >
              <div>
                <Typography>
                  {session.browser} · {session.os}{' '}
                  {session.current && <Chip size="small" label="Current" color="primary" />}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {session.lastIp} · Last active {new Date(session.lastSeenAt).toLocaleString()}
                </Typography>
              </div>
              {!session.revokedAt && (
                <Button
                  color="error"
                  startIcon={<Delete />}
                  disabled={loading}
                  onClick={() =>
                    run(() =>
                      api(`/api/v1/account/sessions/${session.id}`, {
                        method: 'DELETE',
                        body: JSON.stringify({ csrfToken: csrf }),
                      }),
                    )
                  }
                >
                  Revoke
                </Button>
              )}
            </Stack>
          ))}
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
          <AsyncButton
            loading={loading}
            variant="outlined"
            onClick={() =>
              run(() =>
                api('/api/v1/account/sessions/revoke-others', {
                  method: 'POST',
                  body: JSON.stringify({ csrfToken: csrf }),
                }),
              )
            }
          >
            Log out other sessions
          </AsyncButton>
          <AsyncButton
            loading={loading}
            color="error"
            startIcon={<Logout />}
            onClick={() =>
              window.confirm('Log out everywhere?') &&
              run(
                () =>
                  api('/api/v1/account/logout-everywhere', {
                    method: 'POST',
                    body: JSON.stringify({ csrfToken: csrf }),
                  }),
                false,
              ).then(() => {
                window.location.href = '/';
              })
            }
          >
            Log out everywhere
          </AsyncButton>
        </Stack>
      </Paper>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ alignItems: 'stretch' }}>
        <Paper component="form" onSubmit={changeEmail} sx={{ p: 3, flex: 1 }}>
          <Stack spacing={2}>
            <Typography variant="h6">Change email</Typography>
            <TextField name="newEmail" type="email" label="New email" required />
            <TextField name="currentPassword" type="password" label="Current password" required />
            <AsyncButton type="submit" variant="contained" loading={loading}>
              Change email
            </AsyncButton>
          </Stack>
        </Paper>
        <Paper component="form" onSubmit={changePassword} sx={{ p: 3, flex: 1 }}>
          <Stack spacing={2}>
            <Typography variant="h6">Change password</Typography>
            <TextField name="currentPassword" type="password" label="Current password" required />
            <TextField
              name="newPassword"
              type="password"
              label="New password"
              required
              slotProps={{ htmlInput: { maxLength: 256 } }}
            />
            <AsyncButton type="submit" variant="contained" loading={loading}>
              Change password
            </AsyncButton>
          </Stack>
        </Paper>
      </Stack>
      <Paper sx={{ p: 3, borderColor: 'error.main' }} variant="outlined">
        <Typography variant="h6" color="error">
          Deactivate account
        </Typography>
        <Typography color="text.secondary" sx={{ my: 1 }}>
          Your sessions and application grants will be revoked. Data is retained for later recovery
          or cleanup.
        </Typography>
        <Button
          color="error"
          disabled={loading}
          onClick={() =>
            window.confirm('Deactivate your Y.auth account?') &&
            run(
              () =>
                api('/api/v1/account', {
                  method: 'DELETE',
                  body: JSON.stringify({ csrfToken: csrf }),
                }),
              false,
            ).then(() => {
              window.location.href = '/';
            })
          }
        >
          Deactivate account
        </Button>
      </Paper>
    </Stack>
  );
}
