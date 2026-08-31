import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import Turnstile from '../components/Turnstile';

interface LoginContext {
	csrfToken: string;
	captchaRequired: boolean;
	turnstileSiteKey: string | null;
}

export default function LoginPage() {
	const [params] = useSearchParams();
	const [context, setContext] = useState<LoginContext>();
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const returnTo = params.get('returnTo') === '/admin' ? '/admin' : '/account';

	useEffect(() => {
		api<LoginContext>('/api/v1/auth/login-context')
			.then(setContext)
			.catch((cause: Error) => setError(cause.message));
	}, []);

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!context) return;
		setLoading(true);
		setError('');
		const form = new FormData(event.currentTarget);
		try {
			await api('/api/v1/auth/login', {
				method: 'POST',
				body: JSON.stringify({
					email: form.get('email'),
					password: form.get('password'),
					captchaToken: form.get('cf-turnstile-response') || undefined,
					csrfToken: context.csrfToken,
				}),
			});
			window.location.assign(returnTo);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Sign in failed');
			setLoading(false);
		}
	}

	return (
		<Box component="form" onSubmit={submit} sx={{ maxWidth: 440, mx: 'auto', mt: 8 }}>
			<Stack spacing={2.5}>
				<Typography variant="h4">Sign in to Y.auth</Typography>
				<Typography color="text.secondary">Use your central account to continue.</Typography>
				{error && <Alert severity="error">{error}</Alert>}
				<TextField name="email" label="Email" type="email" autoComplete="username" required autoFocus />
				<TextField name="password" label="Password" type="password" autoComplete="current-password" required />
				{context?.captchaRequired && context.turnstileSiteKey && <Turnstile siteKey={context.turnstileSiteKey} />}
				{context?.captchaRequired && !context.turnstileSiteKey && (
					<Alert severity="error">Security check is required but not configured.</Alert>
				)}
				<Button type="submit" variant="contained" size="large" disabled={!context || loading}>
					{loading ? <CircularProgress size={24} /> : 'Sign in'}
				</Button>
			</Stack>
		</Box>
	);
}
