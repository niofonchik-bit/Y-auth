import Add from '@mui/icons-material/Add';
import Block from '@mui/icons-material/Block';
import Key from '@mui/icons-material/Key';
import Refresh from '@mui/icons-material/Refresh';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, csrfToken } from '../api';
import AsyncButton from '../components/AsyncButton';

interface Dashboard {
  version: string;
  status: string;
  postgres: string;
  redis: string;
  users: number;
  activeSessions: number;
  clients: number;
  mailConfigured: boolean;
}

interface ClientRow {
  clientId: string;
  name: string;
  type: 'public' | 'confidential';
  enabled: boolean;
  firstParty: boolean;
  allowedScopes: string[];
  accessTokenAudience: string;
}

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  status: 'active' | 'deactivated';
  isAdmin: boolean;
  createdAt: string;
}

interface SessionRow {
  id: string;
  userId: string;
  email: string;
  lastSeenAt: string;
  lastIp: string;
  userAgent: string;
  revokedAt: string | null;
}

interface AuditRow {
  id: string;
  type: string;
  success: boolean;
  createdAt: string;
  actorUserId: string | null;
  targetUserId: string | null;
  reasonCode: string | null;
}

interface Settings {
  registrationEnabled: boolean;
  minPasswordLength: number;
  captchaMode: 'off' | 'adaptive' | 'always_registration';
  accessTokenTtlSeconds: number;
  ssoIdleTtlSeconds: number;
  ssoAbsoluteTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}

const tabNames = ['Dashboard', 'Clients', 'Users', 'Sessions', 'Audit', 'Settings'];

export default function AdminPage() {
  const [tab, setTab] = useState(0);
  const [csrf, setCsrf] = useState('');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [
      dashboardResult,
      clientResult,
      userResult,
      sessionResult,
      auditResult,
      settingsResult,
      token,
    ] = await Promise.all([
      api<Dashboard>('/api/v1/admin/dashboard'),
      api<{ items: ClientRow[] }>('/api/v1/admin/clients'),
      api<{ items: UserRow[] }>('/api/v1/admin/users'),
      api<{ items: SessionRow[] }>('/api/v1/admin/sessions'),
      api<{ items: AuditRow[] }>('/api/v1/admin/audit'),
      api<Settings>('/api/v1/admin/settings'),
      csrfToken(),
    ]);
    setDashboard(dashboardResult);
    setClients(clientResult.items);
    setUsers(userResult.items);
    setSessions(sessionResult.items);
    setEvents(auditResult.items);
    setSettings(settingsResult);
    setCsrf(token);
  }, []);

  useEffect(() => {
    load().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : 'Unable to load admin data'),
    );
  }, [load]);

  const run = async (operation: () => Promise<unknown>) => {
    setLoading(true);
    setError(null);
    try {
      await operation();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const createClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = form.get('type') === 'confidential' ? 'confidential' : 'public';
    const split = (value: FormDataEntryValue | null) =>
      String(value ?? '')
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
    setLoading(true);
    try {
      const created = await api<{ clientId: string; clientSecret: string | null }>(
        '/api/v1/admin/clients',
        {
          method: 'POST',
          body: JSON.stringify({
            csrfToken: csrf,
            name: form.get('name'),
            type,
            firstParty: form.get('firstParty') === 'on',
            redirectUris: split(form.get('redirectUris')),
            postLogoutRedirectUris: split(form.get('postLogoutRedirectUris')),
            allowedScopes: ['openid', 'profile', 'email', 'offline_access', 'y_auth.sessions'],
          }),
        },
      );
      setCreateOpen(false);
      setSecret(
        created.clientSecret ? `${created.clientId}\n${created.clientSecret}` : created.clientId,
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create client');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() =>
      api('/api/v1/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          csrfToken: csrf,
          registrationEnabled: form.get('registrationEnabled') === 'on',
          minPasswordLength: Number(form.get('minPasswordLength')),
          captchaMode: form.get('captchaMode'),
          accessTokenTtlSeconds: Number(form.get('accessTokenTtlSeconds')),
          ssoIdleTtlSeconds: Number(form.get('ssoIdleTtlSeconds')),
          ssoAbsoluteTtlSeconds: Number(form.get('ssoAbsoluteTtlSeconds')),
          refreshTokenTtlSeconds: Number(form.get('refreshTokenTtlSeconds')),
        }),
      }),
    );
  };

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Typography variant="h4">Administration</Typography>
        <Button startIcon={<Refresh />} disabled={loading} onClick={() => run(async () => {})}>
          Refresh
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper sx={{ overflowX: 'auto' }}>
        <Tabs value={tab} onChange={(_event, value: number) => setTab(value)} variant="scrollable">
          {tabNames.map((name) => (
            <Tab key={name} label={name} />
          ))}
        </Tabs>
      </Paper>

      {tab === 0 && dashboard && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 2,
          }}
        >
          {[
            ['Status', dashboard.status],
            ['Version', dashboard.version],
            ['PostgreSQL', dashboard.postgres],
            ['Redis', dashboard.redis],
            ['Users', dashboard.users],
            ['Active sessions', dashboard.activeSessions],
            ['Clients', dashboard.clients],
            ['Mail configured', dashboard.mailConfigured ? 'yes' : 'no'],
          ].map(([label, value]) => (
            <Paper key={label} sx={{ p: 3 }}>
              <Typography color="text.secondary">{label}</Typography>
              <Typography variant="h5">{value}</Typography>
            </Paper>
          ))}
        </Box>
      )}

      {tab === 1 && (
        <Stack spacing={2}>
          <Button
            variant="contained"
            startIcon={<Add />}
            sx={{ alignSelf: 'flex-start' }}
            onClick={() => setCreateOpen(true)}
          >
            Create client
          </Button>
          {clients.map((client) => (
            <Paper key={client.clientId} sx={{ p: 3 }}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                sx={{ justifyContent: 'space-between' }}
              >
                <div>
                  <Typography variant="h6">{client.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {client.clientId} · {client.type} · {client.accessTokenAudience}
                  </Typography>
                </div>
                <Stack direction="row" spacing={1}>
                  {client.type === 'confidential' && (
                    <Button
                      startIcon={<Key />}
                      disabled={loading}
                      onClick={() =>
                        window.confirm(
                          'Regenerate this secret? The previous value will stop working immediately.',
                        ) &&
                        run(async () => {
                          const result = await api<{ clientSecret: string }>(
                            `/api/v1/admin/clients/${client.clientId}/regenerate-secret`,
                            { method: 'POST', body: JSON.stringify({ csrfToken: csrf }) },
                          );
                          setSecret(result.clientSecret);
                        })
                      }
                    >
                      Regenerate secret
                    </Button>
                  )}
                  <Button
                    color={client.enabled ? 'error' : 'success'}
                    startIcon={<Block />}
                    disabled={loading}
                    onClick={() =>
                      run(() =>
                        api(`/api/v1/admin/clients/${client.clientId}/enabled`, {
                          method: 'POST',
                          body: JSON.stringify({ csrfToken: csrf, enabled: !client.enabled }),
                        }),
                      )
                    }
                  >
                    {client.enabled ? 'Disable' : 'Enable'}
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {tab === 2 && (
        <Stack spacing={2}>
          {users.map((user) => (
            <Paper key={user.id} sx={{ p: 3 }}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                sx={{ justifyContent: 'space-between' }}
              >
                <div>
                  <Typography variant="h6">{user.displayName ?? user.email}</Typography>
                  <Typography color="text.secondary">
                    {user.email} · {user.status}
                    {user.isAdmin ? ' · admin' : ''}
                  </Typography>
                </div>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  <Button
                    disabled={loading}
                    onClick={() =>
                      run(() =>
                        api(`/api/v1/admin/users/${user.id}/logout-everywhere`, {
                          method: 'POST',
                          body: JSON.stringify({ csrfToken: csrf }),
                        }),
                      )
                    }
                  >
                    Log out everywhere
                  </Button>
                  <Button
                    color={user.status === 'active' ? 'error' : 'success'}
                    disabled={loading}
                    onClick={() =>
                      run(() =>
                        api(`/api/v1/admin/users/${user.id}/status`, {
                          method: 'POST',
                          body: JSON.stringify({
                            csrfToken: csrf,
                            active: user.status !== 'active',
                          }),
                        }),
                      )
                    }
                  >
                    {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
                  </Button>
                  {user.status === 'deactivated' && (
                    <Button
                      color="error"
                      disabled={loading}
                      onClick={() => {
                        const confirmation = window.prompt(
                          `Enter ${user.email} to permanently delete this user.`,
                        );
                        if (confirmation === user.email)
                          run(() =>
                            api(`/api/v1/admin/users/${user.id}`, {
                              method: 'DELETE',
                              body: JSON.stringify({ csrfToken: csrf, confirmEmail: confirmation }),
                            }),
                          );
                      }}
                    >
                      Permanent delete
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {tab === 3 && (
        <Stack spacing={2}>
          {sessions.map((session) => (
            <Paper key={session.id} sx={{ p: 3 }}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                sx={{ justifyContent: 'space-between' }}
              >
                <div>
                  <Typography>{session.email}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {session.lastIp} · {new Date(session.lastSeenAt).toLocaleString()} ·{' '}
                    {session.userAgent}
                  </Typography>
                </div>
                {!session.revokedAt && (
                  <Button
                    color="error"
                    disabled={loading}
                    onClick={() =>
                      run(() =>
                        api(`/api/v1/admin/sessions/${session.id}`, {
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
            </Paper>
          ))}
        </Stack>
      )}

      {tab === 4 && (
        <Stack spacing={1}>
          {events.map((event) => (
            <Paper key={event.id} sx={{ p: 2 }}>
              <Typography>
                {event.type} · {event.success ? 'success' : 'failed'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {new Date(event.createdAt).toLocaleString()}{' '}
                {event.reasonCode ? `· ${event.reasonCode}` : ''}
              </Typography>
            </Paper>
          ))}
        </Stack>
      )}

      {tab === 5 && settings && (
        <Paper component="form" onSubmit={saveSettings} sx={{ p: 3 }}>
          <Stack spacing={2} sx={{ maxWidth: 560 }}>
            <FormControlLabel
              control={
                <Checkbox
                  name="registrationEnabled"
                  defaultChecked={settings.registrationEnabled}
                />
              }
              label="Registration enabled"
            />
            <TextField
              name="minPasswordLength"
              label="Minimum password length"
              type="number"
              defaultValue={settings.minPasswordLength}
              slotProps={{ htmlInput: { min: 6, max: 256 } }}
            />
            <TextField
              name="captchaMode"
              label="CAPTCHA mode"
              select
              defaultValue={settings.captchaMode}
            >
              <MenuItem value="off">Off</MenuItem>
              <MenuItem value="adaptive">Adaptive</MenuItem>
              <MenuItem value="always_registration">Always for registration</MenuItem>
            </TextField>
            <TextField
              name="accessTokenTtlSeconds"
              label="Access token TTL (seconds)"
              type="number"
              defaultValue={settings.accessTokenTtlSeconds}
            />
            <TextField
              name="ssoIdleTtlSeconds"
              label="SSO idle TTL (seconds)"
              type="number"
              defaultValue={settings.ssoIdleTtlSeconds}
            />
            <TextField
              name="ssoAbsoluteTtlSeconds"
              label="SSO absolute TTL (seconds)"
              type="number"
              defaultValue={settings.ssoAbsoluteTtlSeconds}
            />
            <TextField
              name="refreshTokenTtlSeconds"
              label="Refresh token TTL (seconds)"
              type="number"
              defaultValue={settings.refreshTokenTtlSeconds}
            />
            <AsyncButton type="submit" variant="contained" loading={loading}>
              Save settings
            </AsyncButton>
          </Stack>
        </Paper>
      )}

      <Dialog
        open={createOpen}
        onClose={() => !loading && setCreateOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={createClient}>
          <DialogTitle>Create OAuth client</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField name="name" label="Name" required />
              <TextField name="type" label="Type" select defaultValue="public">
                <MenuItem value="public">Public</MenuItem>
                <MenuItem value="confidential">Confidential</MenuItem>
              </TextField>
              <FormControlLabel
                control={<Checkbox name="firstParty" defaultChecked />}
                label="First-party client"
              />
              <TextField
                name="redirectUris"
                label="Redirect URIs, one per line"
                multiline
                minRows={3}
                required
              />
              <TextField
                name="postLogoutRedirectUris"
                label="Post-logout URIs, one per line"
                multiline
                minRows={2}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <AsyncButton type="submit" variant="contained" loading={loading}>
              Create
            </AsyncButton>
          </DialogActions>
        </Box>
      </Dialog>
      <Dialog open={secret !== null} onClose={() => setSecret(null)} fullWidth maxWidth="sm">
        <DialogTitle>Save this value now</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            The client secret is shown only once.
          </Alert>
          <TextField
            fullWidth
            multiline
            value={secret ?? ''}
            slotProps={{ htmlInput: { readOnly: true } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSecret(null)}>I saved it</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
