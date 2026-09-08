import AppearanceControls from '../components/AppearanceControls';
import { Button, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, csrfToken } from '../api';

export function SystemPage({ code }: { code: 403 | 404 | 500 }) {
	const title = code === 403 ? 'Access denied' : code === 404 ? 'Page not found' : 'Something went wrong';
	return (
		<main className="auth-page">
			<div className="auth-controls">
				<AppearanceControls />
			</div>
			<section className="surface section" style={{ maxWidth: 520 }}>
				<Typography variant="overline">Error {code}</Typography>
				<Typography variant="h4">{title}</Typography>
				<Typography color="text.secondary" sx={{ my: 2 }}>
					The requested page cannot be displayed. No authentication data was changed.
				</Typography>
				<Button className="text-link" component={Link} to="/login">
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
			<div className="auth-controls">
				<AppearanceControls />
			</div>
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
