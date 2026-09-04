import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, csrfToken } from '../api';

export function SystemPage({ code }: { code: 403 | 404 | 500 }) {
	const title = code === 403 ? 'Access denied' : code === 404 ? 'Page not found' : 'Something went wrong';
	return (
		<main className="auth-page">
			<section className="surface section" style={{ maxWidth: 520 }}>
				<Typography variant="overline">Error {code}</Typography>
				<Typography variant="h4">{title}</Typography>
				<Typography color="text.secondary" sx={{ my: 2 }}>
					The requested page cannot be displayed. No authentication data was changed.
				</Typography>
				<Button component={Link} to="/login">
					Back to sign in
				</Button>
			</section>
		</main>
	);
}

export function VerifyEmailPage() {
	const [params] = useSearchParams();
	const [state, setState] = useState<'pending' | 'success' | 'error'>('pending');
	useEffect(() => {
		const token = params.get('token');
		if (!token) {
			setState('error');
			return;
		}
		csrfToken()
			.then((csrf) => api('/api/v1/auth/email/verify', { method: 'POST', body: JSON.stringify({ token, csrfToken: csrf }) }))
			.then(() => setState('success'))
			.catch(() => setState('error'));
	}, [params]);
	return (
		<main className="auth-page">
			<section className={`surface section${state === 'pending' ? ' pending-edge' : ''}`}>
				<Typography variant="h4">
					{state === 'pending' ? 'Verifying email…' : state === 'success' ? 'Email verified' : 'Verification link is invalid or expired'}
				</Typography>
				<Button component={Link} to="/account/security" sx={{ mt: 2 }}>
					Continue
				</Button>
			</section>
		</main>
	);
}

export function RegisterPage() {
	const [csrf, setCsrf] = useState('');
	const [message, setMessage] = useState('');
	useEffect(() => {
		csrfToken().then(setCsrf);
	}, []);
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		try {
			await api('/api/v1/auth/register', {
				method: 'POST',
				body: JSON.stringify({
					displayName: form.get('displayName'),
					email: form.get('email'),
					password: form.get('password'),
					csrfToken: csrf,
				}),
			});
			window.location.assign('/account/profile');
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Registration failed');
		}
	}
	return (
		<main className="auth-page">
			<section className="auth-frame surface">
				<div className="auth-brand">
					<div className="brand-logo">
						<span className="brand-mark">Y</span> Y.AUTH
					</div>
					<Typography variant="h3">
						One identity.
						<br />
						Every application.
					</Typography>
					<Button component={Link} to="/login">
						Already have an account?
					</Button>
				</div>
				<Stack className="auth-panel" component="form" onSubmit={submit} spacing={2}>
					<Typography variant="h4">Create account</Typography>
					{message && <Alert severity="error">{message}</Alert>}
					<TextField name="displayName" label="Display name" />
					<TextField name="email" type="email" label="Email address" required />
					<TextField
						name="password"
						type="password"
						label="Password"
						helperText="At least 15 characters"
						slotProps={{ htmlInput: { minLength: 15, maxLength: 256 } }}
						required
					/>
					<Button type="submit" variant="contained" disabled={!csrf}>
						Create account
					</Button>
				</Stack>
			</section>
		</main>
	);
}
