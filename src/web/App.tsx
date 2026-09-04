import { CssBaseline, createTheme, ThemeProvider } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';
import PortalShell from './components/PortalShell';
import { DangerPage, ProfilePage, SecurityPage, SessionsPage } from './pages/AccountV2Pages';
import { AdminDetailPage, AdminListPage, AdminOverview, AdminSettings, ApplicationForm } from './pages/AdminV2Pages';
import InteractionPage from './pages/InteractionPage';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { RegisterPage, SystemPage, VerifyEmailPage } from './pages/SystemPages';

const theme = createTheme({
	shape: { borderRadius: 4 },
	typography: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', fontSize: 13 },
	palette: { primary: { main: '#159a61' }, error: { main: '#cd2b31' }, background: { default: '#f4f7f5', paper: '#ffffff' } },
	components: {
		MuiCssBaseline: { styleOverrides: { body: { background: 'var(--bg-primary)', color: 'var(--text-primary)' } } },
		MuiPaper: {
			styleOverrides: {
				root: {
					color: 'var(--text-primary)',
					backgroundColor: 'var(--bg-surface)',
					backgroundImage: 'none',
					borderRadius: 'var(--radius-md)',
				},
			},
		},
		MuiTextField: { defaultProps: { size: 'small' } },
		MuiButton: {
			defaultProps: { disableElevation: true },
			styleOverrides: { root: { minHeight: 36, borderRadius: 'var(--radius-sm)', textTransform: 'none', fontWeight: 600 } },
		},
	},
});

export default function App() {
	return (
		<ThemeProvider theme={theme}>
			<CssBaseline />
			<Routes>
				<Route path="/" element={<Navigate to="/login" replace />} />
				<Route path="/login" element={<LoginPage />} />
				<Route path="/register" element={<RegisterPage />} />
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
		</ThemeProvider>
	);
}
