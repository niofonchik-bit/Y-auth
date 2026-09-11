import AsyncButton from '../components/AsyncButton';
import LoadingPreview from '../components/LoadingPreview';
import PasswordField from '../components/PasswordField';
import { Alert, MenuItem, Button, Divider, Stack, TextField, Typography } from '@mui/material';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, csrfToken } from '../api';

interface Account {
	id: string;
	email: string;
	displayName: string | null;
	locale: 'en' | 'ru';
	emailVerified: boolean;
	avatarUrl: string | null;
	createdAt: string;
}
interface Session {
	id: string;
	browser: string;
	os: string;
	lastIp: string;
	lastSeenAt: string;
	expiresAt: string;
	current: boolean;
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
	return (
		<header className="page-header">
			<div>
				<h1 className="page-title">{title}</h1>
				<p className="page-subtitle">{subtitle}</p>
			</div>
		</header>
	);
}

export function ProfilePage() {
	const [account, setAccount] = useState<Account>();
	const [csrf, setCsrf] = useState('');
	const [message, setMessage] = useState('');
	const [pending, setPending] = useState(false);
	const [loadError, setLoadError] = useState('');
	useEffect(() => {
		Promise.all([api<Account>('/api/v1/account'), csrfToken()])
			.then(([value, token]) => {
				setAccount(value);
				setCsrf(token);
			})
			.catch((error: Error) => setLoadError(error.message));
	}, []);
	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!account) return;
		setPending(true);
		const form = new FormData(event.currentTarget);
		try {
			await api('/api/v1/account', {
				method: 'PATCH',
				body: JSON.stringify({ displayName: form.get('displayName'), locale: form.get('locale'), csrfToken: csrf }),
			});
			setMessage('Profile saved.');
		} finally {
			setPending(false);
		}
	}
	async function upload(event: FormEvent<HTMLInputElement>) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;
		const body = new FormData();
		body.append('file', file);
		const response = await fetch('/api/v1/account/avatar', {
			method: 'PUT',
			body,
			headers: { 'x-csrf-token': csrf },
			credentials: 'same-origin',
		});
		if (!response.ok) throw new Error('Avatar upload failed');
		const result = (await response.json()) as { url: string };
		setAccount((value) => (value ? { ...value, avatarUrl: result.url } : value));
	}
	if (!account) return loadError ? <Alert severity="error">{loadError}</Alert> : <LoadingPreview />;
	return (
		<section className="page">
			<Header title="Profile" subtitle="Manage the identity shown to connected applications." />
			<Stack
				component="form"
				onSubmit={(event) => save(event as unknown as FormEvent<HTMLFormElement>)}
				className="surface profile-card"
				spacing={0}
				sx={{ maxWidth: 640 }}
			>
				<div className="profile-card-avatar-row">
					{account.avatarUrl ? (
						<img src={account.avatarUrl} alt="" width={64} height={64} style={{ borderRadius: '50%', objectFit: 'cover' }} />
					) : (
						<div className="profile-avatar">{(account.displayName ?? account.email)[0]?.toUpperCase()}</div>
					)}
					<div className="profile-card-avatar-copy">
						<strong>{account.displayName || account.email}</strong>
						<Button component="label" variant="outlined" size="small">
							Replace avatar
							<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} />
						</Button>
					</div>
				</div>
				<Stack className="profile-card-fields" spacing={2}>
					<TextField name="displayName" label="Display name" defaultValue={account.displayName ?? ''} />
					<TextField
						label="Email"
						value={account.email}
						slotProps={{ input: { readOnly: true } }}
						helperText={account.emailVerified ? 'Verified' : 'Verification required'}
					/>
					<TextField name="locale" label="Locale" select defaultValue={account.locale}>
						<MenuItem value="en">English</MenuItem>
						<MenuItem value="ru">Русский</MenuItem>
					</TextField>
					<TextField label="User ID" value={account.id} slotProps={{ input: { readOnly: true } }} />
					<Divider />
					{message && <Alert severity="success">{message}</Alert>}
					<div className="profile-card-footer">
						<Typography variant="caption">Created {new Intl.DateTimeFormat(account.locale).format(new Date(account.createdAt))}</Typography>
						<AsyncButton type="submit" variant="contained" loading={pending}>
							Save changes
						</AsyncButton>
					</div>
				</Stack>
			</Stack>
		</section>
	);
}

export function SecurityPage() {
	const [data, setData] = useState<{ mfa: { enabled: boolean; recoveryCodesRemaining: number }; emailVerified: boolean }>();
	const [csrf, setCsrf] = useState('');
	const [loadError, setLoadError] = useState('');
	const [setup, setSetup] = useState<{ manualSecret: string; qrDataUrl: string }>();
	const [codes, setCodes] = useState<string[]>();
	const [passwordMessage, setPasswordMessage] = useState<{ severity: 'success' | 'error'; text: string }>();
	const [passwordPending, setPasswordPending] = useState(false);
	const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmation: '' });

	const load = useCallback(
		() =>
			Promise.all([api<typeof data>('/api/v1/account/security'), csrfToken()])
				.then(([value, token]) => {
					setData(value);
					setCsrf(token);
				})
				.catch((error: Error) => setLoadError(error.message)),
		[],
	);

	useEffect(() => {
		load();
	}, [load]);

	async function changePassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (passwordPending || !csrf) return;
		const form = new FormData(event.currentTarget);
		const currentPassword = String(form.get('currentPassword') ?? '');
		const newPassword = String(form.get('newPassword') ?? '');
		const confirmation = String(form.get('confirmation') ?? '');

		if (newPassword !== confirmation) {
			setPasswordMessage({ severity: 'error', text: 'New passwords do not match.' });
			return;
		}

		setPasswordPending(true);
		setPasswordMessage(undefined);

		try {
			await api<{ changed: boolean }>('/api/v1/account/change-password', {
				method: 'POST',
				body: JSON.stringify({
					currentPassword,
					newPassword,
					csrfToken: csrf,
				}),
			});

			// A native form reset does not notify MUI that uncontrolled inputs are empty.
			setPasswords({ currentPassword: '', newPassword: '', confirmation: '' });
			setPasswordMessage({ severity: 'success', text: 'Password changed.' });
		} catch (error) {
			setPasswordMessage({
				severity: 'error',
				text: error instanceof Error ? error.message : 'Unable to change password.',
			});
		} finally {
			setPasswordPending(false);
		}
	}

	async function begin(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setSetup(
			await api('/api/v1/account/mfa/setup', {
				method: 'POST',
				body: JSON.stringify({ currentPassword: form.get('password'), csrfToken: csrf }),
			}),
		);
	}

	async function enable(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const result = await api<{ recoveryCodes: string[] }>('/api/v1/account/mfa/enable', {
			method: 'POST',
			body: JSON.stringify({ code: form.get('code'), csrfToken: csrf }),
		});
		setCodes(result.recoveryCodes);
		setSetup(undefined);
		await load();
	}
	if (!data) return loadError ? <Alert severity="error">{loadError}</Alert> : <LoadingPreview />;
	return (
		<section className="page">
			<Header title="Security" subtitle="Verification, password and two-factor authentication." />
			<div className="grid" style={{ maxWidth: 640 }}>
				<div className="surface section">
					<h2>Email verification</h2>
					<p>{data?.emailVerified ? 'Your email is verified.' : 'Verify your email to protect recovery.'}</p>
					{!data?.emailVerified && (
						<Button onClick={() => api('/api/v1/auth/email/resend', { method: 'POST', body: JSON.stringify({ csrfToken: csrf }) })}>
							Resend verification
						</Button>
					)}
				</div>

				<div className="surface section">
					<h2>Change password</h2>
					<p>Changing your password signs out your other sessions.</p>

					<Stack component="form" onSubmit={changePassword} spacing={2}>
						<PasswordField
							name="currentPassword"
							value={passwords.currentPassword}
							onChange={(event) => setPasswords((value) => ({ ...value, currentPassword: event.target.value }))}
							disabled={passwordPending}
							label="Current password"
							autoComplete="current-password"
							required
						/>

						<PasswordField
							name="newPassword"
							value={passwords.newPassword}
							onChange={(event) => setPasswords((value) => ({ ...value, newPassword: event.target.value }))}
							disabled={passwordPending}
							label="New password"
							autoComplete="new-password"
							required
						/>

						<PasswordField
							name="confirmation"
							value={passwords.confirmation}
							onChange={(event) => setPasswords((value) => ({ ...value, confirmation: event.target.value }))}
							disabled={passwordPending}
							label="Confirm new password"
							autoComplete="new-password"
							required
						/>

						{passwordMessage && <Alert severity={passwordMessage.severity}>{passwordMessage.text}</Alert>}

						<AsyncButton type="submit" variant="contained" loading={passwordPending} disabled={!csrf}>
							Change password
						</AsyncButton>
					</Stack>
				</div>

				<div className="surface section">
					<h2>Two-factor authentication</h2>
					<p>{data?.mfa.enabled ? `Enabled · ${data.mfa.recoveryCodesRemaining} recovery codes remain` : 'Not enabled'}</p>
					{!data?.mfa.enabled && !setup && (
						<Stack component="form" onSubmit={begin} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
							<PasswordField name="password" label="Current password" required />
							<Button type="submit">Set up</Button>
						</Stack>
					)}
					{setup && (
						<Stack spacing={2}>
							<img src={setup.qrDataUrl} alt="Authenticator QR code" width={220} />
							<TextField value={setup.manualSecret} label="Manual secret" slotProps={{ htmlInput: { readOnly: true } }} />
							<Stack component="form" onSubmit={enable} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
								<TextField name="code" label="6-digit code" required />
								<Button type="submit" variant="contained">
									Enable
								</Button>
							</Stack>
						</Stack>
					)}
					{codes && (
						<Alert severity="warning">
							<strong>Save these one-time recovery codes now:</strong>
							<pre>{codes.join('\n')}</pre>
						</Alert>
					)}
				</div>
			</div>
		</section>
	);
}

export function SessionsPage() {
	const [items, setItems] = useState<Session[]>([]);
	const [csrf, setCsrf] = useState('');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [pendingId, setPendingId] = useState<string>();
	const load = useCallback(
		() =>
			Promise.all([api<{ items: Session[] }>('/api/v1/account/sessions'), csrfToken()])
				.then(([value, token]) => {
					setError('');
					setItems(value.items);
					setCsrf(token);
					setLoading(false);
				})
				.catch((cause: Error) => {
					setError(cause.message);
					setLoading(false);
				}),
		[],
	);
	useEffect(() => {
		load();
	}, [load]);
	return (
		<section className="page account-sessions-page">
			<Header title="Sessions" subtitle="Review and revoke signed-in devices." />
			{error && <Alert severity="error">{error}</Alert>}
			<section className="surface sessions-scroll" aria-label="Sessions" aria-busy={loading}>
				{loading && <LoadingPreview />}
				{!loading && !error && items.length === 0 && <div className="empty-state">No sessions.</div>}
				{items.map((item, index) => (
					<Stack
						key={item.id}
						direction="row"
						className="section session-row list-row-enter"
						style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
						sx={{ justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)' }}
					>
						<div>
							<Typography sx={{ fontWeight: 600 }}>
								{item.browser} · {item.os}
								{item.current ? ' · Current' : ''}
							</Typography>
							<Typography variant="body2" color="text.secondary">
								{item.lastIp} · Last active {new Date(item.lastSeenAt).toLocaleString()}
							</Typography>
						</div>
						<AsyncButton
							color="error"
							loading={pendingId === item.id}
							disabled={!!pendingId || !csrf}
							onClick={async () => {
								if (pendingId) return;
								setPendingId(item.id);
								try {
									await api(`/api/v1/account/sessions/${item.id}`, { method: 'DELETE', body: JSON.stringify({ csrfToken: csrf }) });
									if (item.current) location.assign('/login');
									else await load();
								} catch (error) {
									setError(error instanceof Error ? error.message : 'Unable to revoke session.');
								} finally {
									setPendingId(undefined);
								}
							}}
						>
							{item.current ? 'Sign out' : 'Revoke'}
						</AsyncButton>
					</Stack>
				))}
			</section>
			<AsyncButton
				className="session-actions"
				loading={pendingId === 'others'}
				disabled={!!pendingId || !csrf}
				sx={{ mt: 2 }}
				onClick={async () => {
					if (pendingId) return;
					setPendingId('others');
					try {
						await api('/api/v1/account/sessions/revoke-others', { method: 'POST', body: JSON.stringify({ csrfToken: csrf }) });
						await load();
					} catch (error) {
						setError(error instanceof Error ? error.message : 'Unable to revoke sessions.');
					} finally {
						setPendingId(undefined);
					}
				}}
			>
				Revoke all other sessions
			</AsyncButton>
		</section>
	);
}

export function DangerPage() {
	const [csrf, setCsrf] = useState('');
	useEffect(() => {
		csrfToken().then(setCsrf);
	}, []);
	async function exportData(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const response = await fetch('/api/v1/account/export', {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ currentPassword: form.get('password'), csrfToken: csrf }),
		});
		if (!response.ok) throw new Error('Export failed');
		const url = URL.createObjectURL(await response.blob());
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'y-auth-account.json';
		anchor.click();
		URL.revokeObjectURL(url);
	}
	async function action(event: FormEvent<HTMLFormElement>, kind: 'deactivate' | 'delete') {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		await api(kind === 'deactivate' ? '/api/v1/account/deactivate' : '/api/v1/account/delete-request', {
			method: 'POST',
			body: JSON.stringify({ currentPassword: form.get('password'), confirmation: form.get('confirmation'), csrfToken: csrf }),
		});
		location.assign('/login');
	}
	return (
		<section className="page">
			<Header title="Danger zone" subtitle="Export, deactivate or schedule deletion of your account." />
			<div className="danger-grid">
				<Stack component="form" onSubmit={exportData} className="surface section danger-card" spacing={2}>
					<h2>Export account data</h2>
					<p>Download a JSON archive with the account data available for export.</p>
					<PasswordField name="password" label="Current password" required />
					<Button type="submit" variant="outlined">
						Export data
					</Button>
				</Stack>
				<Stack component="form" onSubmit={(event) => action(event, 'deactivate')} className="surface section danger-card" spacing={2}>
					<h2>Deactivate account</h2>
					<p>Temporarily disable the account. Signing in again reactivates it.</p>
					<PasswordField name="password" label="Current password" required />
					<Button type="submit" color="error">
						Deactivate
					</Button>
				</Stack>
				<Stack component="form" onSubmit={(event) => action(event, 'delete')} className="surface section danger-card danger-card--critical" spacing={2}>
					<h2>Delete account</h2>
					<p>Deletion is scheduled after a 30-day grace period.</p>
					<PasswordField name="password" label="Current password" required />
					<TextField name="confirmation" label="Type your exact email" required />
					<Button type="submit" variant="contained" color="error">
						Schedule deletion
					</Button>
				</Stack>
			</div>
		</section>
	);
}
