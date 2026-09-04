import { Alert, Button, Divider, Stack, TextField, Typography } from '@mui/material';
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
	useEffect(() => {
		Promise.all([api<Account>('/api/v1/account'), csrfToken()]).then(([value, token]) => {
			setAccount(value);
			setCsrf(token);
		});
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
	if (!account) return <div className="skeleton" style={{ height: 180 }} />;
	return (
		<section className="page">
			<Header title="Profile" subtitle="Manage the identity shown to connected applications." />
			<Stack
				component="form"
				onSubmit={(event) => save(event as unknown as FormEvent<HTMLFormElement>)}
				className={`surface section${pending ? ' pending-edge' : ''}`}
				spacing={2}
				sx={{ maxWidth: 720 }}
			>
				<Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
					{account.avatarUrl ? (
						<img src={account.avatarUrl} alt="" width={64} height={64} style={{ borderRadius: '50%', objectFit: 'cover' }} />
					) : (
						<div className="brand-mark">{(account.displayName ?? account.email)[0]?.toUpperCase()}</div>
					)}
					<Button component="label" variant="outlined">
						Replace avatar
						<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} />
					</Button>
				</Stack>
				<TextField name="displayName" label="Display name" defaultValue={account.displayName ?? ''} />
				<TextField label="Email" value={account.email} disabled helperText={account.emailVerified ? 'Verified' : 'Verification required'} />
				<TextField name="locale" label="Locale" select defaultValue={account.locale} slotProps={{ select: { native: true } }}>
					<option value="en">English</option>
					<option value="ru">Русский</option>
				</TextField>
				<TextField label="User ID" value={account.id} disabled />
				<Typography variant="caption">Created {new Intl.DateTimeFormat(account.locale).format(new Date(account.createdAt))}</Typography>
				{message && <Alert severity="success">{message}</Alert>}
				<Button type="submit" variant="contained" disabled={pending}>
					{pending ? 'Saving…' : 'Save'}
				</Button>
			</Stack>
		</section>
	);
}

export function SecurityPage() {
	const [data, setData] = useState<{ mfa: { enabled: boolean; recoveryCodesRemaining: number }; emailVerified: boolean }>();
	const [csrf, setCsrf] = useState('');
	const [setup, setSetup] = useState<{ manualSecret: string; qrDataUrl: string }>();
	const [codes, setCodes] = useState<string[]>();
	const load = useCallback(
		() =>
			Promise.all([api<typeof data>('/api/v1/account/security'), csrfToken()]).then(([value, token]) => {
				setData(value);
				setCsrf(token);
			}),
		[],
	);
	useEffect(() => {
		load();
	}, [load]);
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
		await load();
	}
	return (
		<section className="page">
			<Header title="Security" subtitle="Verification, password and two-factor authentication." />
			<div className="grid" style={{ maxWidth: 760 }}>
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
					<h2>Two-factor authentication</h2>
					<p>{data?.mfa.enabled ? `Enabled · ${data.mfa.recoveryCodesRemaining} recovery codes remain` : 'Not enabled'}</p>
					{!data?.mfa.enabled && !setup && (
						<Stack component="form" onSubmit={begin} direction="row" spacing={1}>
							<TextField name="password" type="password" label="Current password" required />
							<Button type="submit">Set up</Button>
						</Stack>
					)}
					{setup && (
						<Stack spacing={2}>
							<img src={setup.qrDataUrl} alt="Authenticator QR code" width={220} />
							<TextField value={setup.manualSecret} label="Manual secret" slotProps={{ htmlInput: { readOnly: true } }} />
							<Stack component="form" onSubmit={enable} direction="row" spacing={1}>
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
	const load = useCallback(
		() =>
			Promise.all([api<{ items: Session[] }>('/api/v1/account/sessions'), csrfToken()]).then(([value, token]) => {
				setItems(value.items);
				setCsrf(token);
			}),
		[],
	);
	useEffect(() => {
		load();
	}, [load]);
	return (
		<section className="page">
			<Header title="Sessions" subtitle="Review and revoke signed-in devices." />
			<div className="surface">
				{items.map((item) => (
					<Stack
						key={item.id}
						direction="row"
						className="section"
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
						<Button
							color="error"
							onClick={async () => {
								await api(`/api/v1/account/sessions/${item.id}`, { method: 'DELETE', body: JSON.stringify({ csrfToken: csrf }) });
								if (item.current) location.assign('/login');
								else await load();
							}}
						>
							{item.current ? 'Sign out' : 'Revoke'}
						</Button>
					</Stack>
				))}
			</div>
			<Button
				sx={{ mt: 2 }}
				onClick={async () => {
					await api('/api/v1/account/sessions/revoke-others', { method: 'POST', body: JSON.stringify({ csrfToken: csrf }) });
					await load();
				}}
			>
				Revoke all other sessions
			</Button>
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
			<Stack className="surface section" spacing={3} sx={{ maxWidth: 760 }}>
				<Stack component="form" onSubmit={exportData} spacing={1}>
					<h2>Export account data</h2>
					<TextField name="password" type="password" label="Current password" required />
					<Button type="submit" variant="outlined">
						Export data
					</Button>
				</Stack>
				<Divider />
				<Stack component="form" onSubmit={(event) => action(event, 'deactivate')} spacing={1}>
					<h2>Deactivate account</h2>
					<TextField name="password" type="password" label="Current password" required />
					<Button type="submit" color="error">
						Deactivate
					</Button>
				</Stack>
				<Divider />
				<Stack component="form" onSubmit={(event) => action(event, 'delete')} spacing={1}>
					<h2>Delete account</h2>
					<p>Deletion is scheduled after a 30-day grace period.</p>
					<TextField name="password" type="password" label="Current password" required />
					<TextField name="confirmation" label="Type your exact email" required />
					<Button type="submit" variant="contained" color="error">
						Schedule deletion
					</Button>
				</Stack>
			</Stack>
		</section>
	);
}
