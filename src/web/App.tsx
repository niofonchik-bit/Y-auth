import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createPortalTheme } from './muiTheme';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';
import AuthExperience from './components/AuthExperience';
import LoadingPreview from './components/LoadingPreview';
const PortalShell = lazy(() => import('./components/PortalShell'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const InteractionPage = lazy(() => import('./pages/InteractionPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const ProfilePage = lazy(() => import('./pages/AccountV2Pages').then((m) => ({ default: m.ProfilePage })));
const SecurityPage = lazy(() => import('./pages/AccountV2Pages').then((m) => ({ default: m.SecurityPage })));
const SessionsPage = lazy(() => import('./pages/AccountV2Pages').then((m) => ({ default: m.SessionsPage })));
const DangerPage = lazy(() => import('./pages/AccountV2Pages').then((m) => ({ default: m.DangerPage })));
const AdminOverview = lazy(() => import('./pages/AdminV2Pages').then((m) => ({ default: m.AdminOverview })));
const AdminListPage = lazy(() => import('./pages/AdminV2Pages').then((m) => ({ default: m.AdminListPage })));
const AdminDetailPage = lazy(() => import('./pages/AdminV2Pages').then((m) => ({ default: m.AdminDetailPage })));
const AdminSettings = lazy(() => import('./pages/AdminV2Pages').then((m) => ({ default: m.AdminSettings })));
const ApplicationForm = lazy(() => import('./pages/AdminV2Pages').then((m) => ({ default: m.ApplicationForm })));
const SystemPage = lazy(() => import('./pages/SystemPages').then((m) => ({ default: m.SystemPage })));
const VerifyEmailPage = lazy(() => import('./pages/SystemPages').then((m) => ({ default: m.VerifyEmailPage })));

export default function App() {
	const [mode, setMode] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
	useEffect(() => {
		const observer = new MutationObserver(() => setMode(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		return () => observer.disconnect();
	}, []);
	const theme = useMemo(() => createPortalTheme(mode), [mode]);
	return (
		<ThemeProvider theme={theme}>
			<CssBaseline />
			<Suspense
				fallback={
					<div className="route-loading">
						<LoadingPreview />
					</div>
				}
			>
				<Routes>
					<Route path="/" element={<Navigate to="/login" replace />} />
					<Route element={<AuthExperience />}>
						<Route path="/login" element={<LoginPage />} />
						<Route path="/register" element={<RegisterPage />} />
					</Route>
					<Route path="/forgot-password" element={<ResetPasswordPage />} />
					<Route path="/reset-password" element={<ResetPasswordPage />} />
					<Route path="/verify-email" element={<VerifyEmailPage />} />
					<Route path="/interaction/:uid" element={<InteractionPage />} />
					<Route path="/account" element={<PortalShell mode="account" />}>
						<Route index element={<Navigate to="profile" replace />} />
						<Route path="profile" element={<ProfilePage />} />
						<Route path="security" element={<SecurityPage />} />
						<Route path="sessions" element={<SessionsPage />} />
						<Route path="danger" element={<DangerPage />} />
					</Route>
					<Route path="/admin" element={<PortalShell mode="admin" />}>
						<Route index element={<AdminOverview />} />
						<Route path="applications" element={<AdminListPage kind="applications" />} />
						<Route path="applications/new" element={<ApplicationForm />} />
						<Route path="applications/:clientId" element={<AdminDetailPage kind="applications" />} />
						<Route path="users" element={<AdminListPage kind="users" />} />
						<Route path="users/:userId" element={<AdminDetailPage kind="users" />} />
						<Route path="sessions" element={<AdminListPage kind="sessions" />} />
						<Route path="sessions/:sessionId" element={<AdminDetailPage kind="sessions" />} />
						<Route path="audit" element={<AdminListPage kind="audit" />} />
						<Route path="audit/:eventId" element={<AdminDetailPage kind="audit" />} />
						<Route path="settings" element={<AdminSettings />} />
					</Route>
					<Route path="/403" element={<SystemPage code={403} />} />
					<Route path="/error" element={<SystemPage code={500} />} />
					<Route path="*" element={<SystemPage code={404} />} />
				</Routes>
			</Suspense>
		</ThemeProvider>
	);
}
