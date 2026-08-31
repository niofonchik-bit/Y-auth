import { CssBaseline, createTheme, ThemeProvider } from '@mui/material';
import { Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import AccountPage from './pages/AccountPage';
import AdminPage from './pages/AdminPage';
import HomePage from './pages/HomePage';
import InteractionPage from './pages/InteractionPage';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

const theme = createTheme({
	colorSchemes: { light: true, dark: true },
	shape: { borderRadius: 12 },
	typography: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
	components: {
		MuiButton: { defaultProps: { disableElevation: true } },
		MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
	},
});

export default function App() {
	const location = useLocation();
	const interaction = location.pathname.startsWith('/interaction/');
	const routes = (
		<Routes>
			<Route path="/" element={<HomePage />} />
			<Route path="/interaction/:uid" element={<InteractionPage />} />
			<Route path="/login" element={<LoginPage />} />
			<Route path="/reset-password" element={<ResetPasswordPage />} />
			<Route path="/account" element={<AccountPage />} />
			<Route path="/admin" element={<AdminPage />} />
			<Route path="*" element={<HomePage />} />
		</Routes>
	);

	return (
		<ThemeProvider theme={theme} defaultMode="system">
			<CssBaseline />
			{interaction ? routes : <Layout>{routes}</Layout>}
		</ThemeProvider>
	);
}
