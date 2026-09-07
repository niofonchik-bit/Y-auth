import AuthCard from '../components/AuthCard';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { type FormEvent, useEffect, useState } from 'react';
import { api, csrfToken } from '../api';
import AsyncButton from '../components/AsyncButton';

export default function ResetPasswordPage() {
	const token = new URLSearchParams(window.location.search).get('token');
	const [csrf, setCsrf] = useState('');
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState<{
		type: 'success' | 'error';
		text: string;
	} | null>(null);

	useEffect(() => {
		csrfToken()
			.then(setCsrf)
			.catch(() =>
				setMessage({
					type: 'error',
					text: 'Unable to initialize secure form',
				}),
			);
	}, []);

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setLoading(true);
		setMessage(null);
		try {
			if (token) {
				await api('/api/v1/auth/password-reset/complete', {
					method: 'POST',
					body: JSON.stringify({
						token,
						password: form.get('password'),
						csrfToken: csrf,
					}),
				});
				window.history.replaceState({}, '', '/reset-password');
				setMessage({
					type: 'success',
					text: 'Password changed. Sign in again from your application.',
				});
			} else {
				const result = await api<{ message: string }>('/api/v1/auth/password-reset/request', {
					method: 'POST',
					body: JSON.stringify({
						email: form.get('email'),
						csrfToken: csrf,
					}),
				});
				setMessage({ type: 'success', text: result.message });
			}
		} catch (error) {
			setMessage({
				type: 'error',
				text: error instanceof Error ? error.message : 'Request failed',
			});
		} finally {
			setLoading(false);
		}
	};

	return (
		<AuthCard>
			<Typography variant="h4" component="h1" gutterBottom>
				{token ? 'Choose a new password' : 'Reset password'}
			</Typography>
			<Typography color="text.secondary" sx={{ mb: 3 }}>
				{token ? 'Set a new password for your account.' : 'Enter your email to receive reset instructions.'}
			</Typography>
			<Stack component="form" spacing={2.5} onSubmit={submit}>
				{token ? (
					<TextField name="password" type="password" label="New password" required slotProps={{ htmlInput: { maxLength: 256 } }} />
				) : (
					<TextField name="email" type="email" label="Email" required />
				)}
				{message && <Alert severity={message.type}>{message.text}</Alert>}
				<AsyncButton type="submit" variant="contained" loading={loading} disabled={!csrf}>
					{token ? 'Change password' : 'Send reset instructions'}
				</AsyncButton>
			</Stack>
			<Button href="/login" sx={{ mt: 2 }}>
				Back to sign in
			</Button>
		</AuthCard>
	);
}
