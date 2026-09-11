import PasswordField from '../components/PasswordField';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, csrfToken } from '../api';
import AsyncButton from '../components/AsyncButton';
export default function RegisterPage() {
	const { t } = useTranslation();
	const [params] = useSearchParams();
	const [pending, setPending] = useState(false);
	const [csrf, setCsrf] = useState('');
	const [message, setMessage] = useState('');
	useEffect(() => {
		csrfToken()
			.then(setCsrf)
			.catch((error: Error) => setMessage(error.message));
	}, []);
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (pending || !csrf) return;
		setPending(true);
		setMessage('');
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
			const requested = params.get('returnTo') ?? '/account/profile';
			window.location.assign(requested.startsWith('/account') || requested.startsWith('/admin') ? requested : '/account/profile');
		} catch (error) {
			setMessage(error instanceof Error ? error.message : t('errors.default'));
			setPending(false);
		}
	}
	return (
		<Stack className="auth-form" component="form" onSubmit={submit} spacing={2}>
			<div className="auth-heading">
				<Typography variant="h4" component="h1">
					{t('auth.createAccount')}
				</Typography>
				<Typography className="auth-form-subtitle" color="text.secondary">
					{t('auth.joinToday')}
				</Typography>
			</div>
			{message && <Alert severity="error">{message}</Alert>}
			<TextField name="displayName" autoComplete="name" autoFocus label={t('auth.displayName')} placeholder="Jane Smith" />
			<TextField name="email" type="email" autoComplete="email" label={t('auth.email')} placeholder="you@example.com" required />
			<PasswordField
				name="password"
				autoComplete="new-password"
				label={t('auth.password')}
				placeholder={t('auth.passwordHint')}
				helperText={t('auth.passwordHint')}
				slotProps={{ htmlInput: { minLength: 15, maxLength: 256 } }}
				required
			/>
			<AsyncButton type="submit" variant="contained" className="button-large" loading={pending} disabled={!csrf}>
				{t('auth.createAccount')}
			</AsyncButton>
			<Button className="text-link" component={Link} to={`/login${params.size ? `?${params}` : ''}`}>
				{t('auth.hasAccount')}
			</Button>
		</Stack>
	);
}
