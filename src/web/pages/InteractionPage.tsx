import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import Turnstile from '../components/Turnstile';

interface Interaction {
	uid: string;
	prompt: 'login' | 'create' | 'consent' | string;
	client: { id: string; name: string; firstParty: boolean } | null;
	registrationEnabled: boolean;
	minPasswordLength: number;
	loginCaptchaRequired: boolean;
	registrationCaptchaRequired: boolean;
	turnstileSiteKey: string | null;
	csrfToken: string;
	requestedScopes: string[];
}

export default function InteractionPage() {
	const { uid } = useParams();
	const [interaction, setInteraction] = useState<Interaction | null>(null);
	const [registrationMode, setRegistrationMode] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!uid) return;
		const controller = new AbortController();
		api<Interaction>(`/api/v1/interactions/${encodeURIComponent(uid)}`, {
			signal: controller.signal,
		})
			.then((value) => {
				setInteraction(value);
				setRegistrationMode(value.prompt === 'create');
			})
			.catch((reason: unknown) => {
				if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load authorization request');
			});
		return () => controller.abort();
	}, [uid]);

	if (error) return <Alert severity="error">{error}</Alert>;
	if (!interaction || !uid)
		return (
			<Box sx={{ display: 'grid', placeItems: 'center', py: 12 }}>
				<div className="skeleton" style={{ width: 240, height: 4 }} />
			</Box>
		);

	const isRegistration = registrationMode;
	const interactionError = new URLSearchParams(window.location.search).get('interactionError');
	const captchaRequired = isRegistration ? interaction.registrationCaptchaRequired : interaction.loginCaptchaRequired;
	if (interaction.prompt === 'consent') {
		return (
			<Paper sx={{ maxWidth: 480, mx: 'auto', p: 4 }}>
				<Typography variant="h5" gutterBottom>
					Authorize {interaction.client?.name ?? 'application'}
				</Typography>
				<Typography color="text.secondary">This application requests access to:</Typography>
				<Stack component="ul" spacing={1} sx={{ pl: 2 }}>
					{interaction.requestedScopes.map((scope) => (
						<li key={scope}>
							<strong>{scope}</strong> —{' '}
							{scope === 'email'
								? 'View your email address'
								: scope === 'profile'
									? 'View basic profile information'
									: scope === 'y_auth.sessions'
										? 'Manage Y.auth sessions'
										: 'Confirm your identity'}
						</li>
					))}
				</Stack>
				<Box
					component="form"
					method="post"
					action={`/interaction/${encodeURIComponent(uid)}/consent`}
					sx={{ mt: 3, display: 'flex', gap: 1.5, justifyContent: 'flex-end' }}
				>
					<input type="hidden" name="csrfToken" value={interaction.csrfToken} />
					<Button name="decision" value="deny" type="submit">
						Deny
					</Button>
					<Button name="decision" value="allow" type="submit" variant="contained">
						Allow
					</Button>
				</Box>
			</Paper>
		);
	}

	return (
		<Paper component="main" sx={{ maxWidth: 440, mx: 'auto', p: { xs: 3, sm: 4 } }}>
			<Stack spacing={3}>
				<Box>
					<Typography variant="h4" component="h1">
						{isRegistration ? 'Create account' : 'Sign in'}
					</Typography>
					<Typography color="text.secondary" sx={{ mt: 1 }}>
						Continue to {interaction.client?.name ?? 'the requesting application'}
					</Typography>
				</Box>
				{isRegistration && !interaction.registrationEnabled ? (
					<Alert severity="warning">Registration is disabled for this application.</Alert>
				) : (
					<Box component="form" method="post" action={`/interaction/${encodeURIComponent(uid)}/${isRegistration ? 'register' : 'login'}`}>
						<input type="hidden" name="csrfToken" value={interaction.csrfToken} />
						<Stack spacing={2.5}>
							{interactionError && (
								<Alert severity="error">
									{interactionError === 'INVALID_CREDENTIALS'
										? 'Invalid email or password'
										: interactionError === 'MFA_REQUIRED'
											? 'Enter your authenticator or recovery code'
											: interactionError === 'CAPTCHA_REQUIRED'
												? 'Complete the security check'
												: interactionError === 'CAPTCHA_FAILED'
													? 'Security check failed'
													: interactionError === 'RATE_LIMITED'
														? 'Too many attempts. Try again later.'
														: interactionError === 'REGISTRATION_FAILED'
															? 'Unable to create account'
															: 'The request could not be completed'}
								</Alert>
							)}
							{isRegistration && <TextField name="displayName" label="Display name (optional)" autoComplete="name" />}
							<TextField name="email" label="Email" type="email" required autoComplete="email" autoFocus />
							<TextField
								name="password"
								label="Password"
								type="password"
								required
								slotProps={{
									htmlInput: {
										maxLength: 256,
										...(isRegistration
											? {
													minLength: interaction.minPasswordLength,
												}
											: {}),
									},
								}}
								autoComplete={isRegistration ? 'new-password' : 'current-password'}
								helperText={isRegistration ? `Minimum ${interaction.minPasswordLength} characters` : undefined}
							/>
							{!isRegistration && (
								<TextField name="mfaCode" label="Authenticator or recovery code (when enabled)" autoComplete="one-time-code" />
							)}
							{!isRegistration && (
								<FormControlLabel control={<Checkbox name="keepSignedIn" value="true" />} label="Keep me signed in" />
							)}
							{captchaRequired && interaction.turnstileSiteKey && <Turnstile siteKey={interaction.turnstileSiteKey} />}
							{captchaRequired && !interaction.turnstileSiteKey && (
								<Alert severity="error">Security check is required but not configured.</Alert>
							)}
							<Button type="submit" variant="contained" size="large" disabled={isRegistration && !interaction.registrationEnabled}>
								{isRegistration ? 'Create account' : 'Sign in'}
							</Button>
							{!isRegistration && (
								<Button href={`/auth/google/start?interactionUid=${encodeURIComponent(uid)}`}>Continue with Google</Button>
							)}
							{!isRegistration && <Button href="/forgot-password">Forgot password</Button>}
							{interaction.prompt === 'login' && (
								<Button type="button" onClick={() => setRegistrationMode((value) => !value)}>
									{isRegistration ? 'Back to sign in' : 'Create account'}
								</Button>
							)}
						</Stack>
					</Box>
				)}
			</Stack>
		</Paper>
	);
}
