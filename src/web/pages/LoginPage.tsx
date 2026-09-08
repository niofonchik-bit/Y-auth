import PasswordField from '../components/PasswordField';
import AsyncButton from '../components/AsyncButton';
import { Alert, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import Turnstile from '../components/Turnstile';

interface LoginContext {
	csrfToken: string;
	captchaRequired: boolean;
	turnstileSiteKey: string | null;
}

export default function LoginPage() {
	const { t } = useTranslation();
	const [params] = useSearchParams();
	const [context, setContext] = useState<LoginContext>();
	const [error, setError] = useState('');
	const [mfaRequired, setMfaRequired] = useState(false);
	const [loading, setLoading] = useState(false);
	const requested = params.get('returnTo') ?? '/account/profile';
	const returnTo = requested.startsWith('/admin') || requested.startsWith('/account') ? requested : '/account/profile';

	useEffect(() => {
		api<LoginContext>('/api/v1/auth/login-context')
			.then(setContext)
			.catch((cause: Error) => setError(cause.message));
	}, []);

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!context || loading) return;
		setLoading(true);
		setError('');
		const form = new FormData(event.currentTarget);
		try {
			await api('/api/v1/auth/login', {
				method: 'POST',
				body: JSON.stringify({
					email: form.get('email'),
					password: form.get('password'),
					mfaCode: form.get('mfaCode') || undefined,
					keepSignedIn: form.get('keepSignedIn') === 'on',
					captchaToken: form.get('cf-turnstile-response') || undefined,
					csrfToken: context.csrfToken,
				}),
			});
			window.location.assign(returnTo);
		} catch (cause) {
			if (cause instanceof ApiError && cause.code === 'MFA_REQUIRED') setMfaRequired(true);
			setError(cause instanceof ApiError ? t(`errors.${cause.code ?? 'default'}`) : t('errors.default'));
			setLoading(false);
		}
	}

	return (
		<Stack className="auth-form" component="form" onSubmit={submit} spacing={2.25} sx={{ maxWidth: 370, mx: 'auto' }}>
			<div>
				<Typography variant="h4" component="h1">
					{t('auth.signIn')}
				</Typography>
				<Typography color="text.secondary">{t('auth.continueTo', { client: 'Y.auth' })}</Typography>
			</div>
			{error && (
				<Alert severity="error" aria-live="polite">
					{error}
				</Alert>
			)}
			<TextField name="email" label={t('auth.email')} type="email" autoComplete="username" required autoFocus />
			<PasswordField name="password" label={t('auth.password')} autoComplete="current-password" required />
			{mfaRequired && <TextField name="mfaCode" label={t('auth.mfa')} autoComplete="one-time-code" required autoFocus />}
			<Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
				<FormControlLabel control={<Checkbox name="keepSignedIn" />} label={t('auth.keepSignedIn')} />
				<Button className="text-link" href="/forgot-password" size="small">
					{t('auth.forgot')}
				</Button>
			</Stack>
			{context?.captchaRequired && context.turnstileSiteKey && <Turnstile siteKey={context.turnstileSiteKey} />}
			<AsyncButton className="button-large" loading={loading} type="submit" variant="contained" disabled={!context || loading}>
				{t('auth.signIn')}
			</AsyncButton>
			<Button variant="outlined" href={`/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`}>
				{t('auth.google')}
			</Button>
			<Button className="text-link" component={Link} to={`/register${params.size ? `?${params}` : ''}`}>
				{t('auth.noAccount')}
			</Button>
		</Stack>
	);
}
