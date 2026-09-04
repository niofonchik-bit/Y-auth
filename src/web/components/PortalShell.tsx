import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LanguageOutlined from '@mui/icons-material/LanguageOutlined';
import { IconButton, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { changeLocale } from '../i18n';
import { ThemeController } from '../theme';

interface Account {
	email: string;
	displayName: string | null;
	isAdmin: boolean;
}

export default function PortalShell({ mode }: { mode: 'account' | 'admin' }) {
	const { t, i18n } = useTranslation();
	const [account, setAccount] = useState<Account>();
	const navigate = useNavigate();
	const location = useLocation();
	useEffect(() => {
		api<Account>('/api/v1/account')
			.then((value) => {
				if (mode === 'admin' && !value.isAdmin) navigate('/403', { replace: true });
				else setAccount(value);
			})
			.catch((error) => {
				if (error instanceof ApiError && error.status === 401)
					navigate(`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
			});
	}, [location.pathname, location.search, mode, navigate]);
	const links: Array<[string, string]> =
		mode === 'admin'
			? [
					['/admin', 'admin.overview'],
					['/admin/applications', 'admin.applications'],
					['/admin/users', 'admin.users'],
					['/admin/sessions', 'admin.sessions'],
					['/admin/audit', 'admin.audit'],
					['/admin/settings', 'admin.settings'],
				]
			: [
					['/account/profile', 'account.profile'],
					['/account/security', 'account.security'],
					['/account/sessions', 'account.sessions'],
					['/account/danger', 'account.danger'],
				];
	return (
		<div className="portal">
			<aside className="sidebar">
				<div className="sidebar-brand">
					<div className="brand-logo">
						<span className="brand-mark">Y</span> Y.auth
					</div>
				</div>
				<nav className="sidebar-nav" aria-label={mode === 'admin' ? t('admin.title') : t('account.title')}>
					{links.map(([to, key]) => (
						<NavLink key={to} to={to} end={to === '/admin'} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
							{t(key)}
						</NavLink>
					))}
				</nav>
				<div className="sidebar-footer">
					<Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
						<div>
							<Typography variant="body2">{account?.displayName ?? account?.email ?? t('common.loading')}</Typography>
							{import.meta.env.VITE_APP_ENVIRONMENT === 'development' && <span className="environment-badge">DEVELOPMENT</span>}
						</div>
						<div>
							<IconButton aria-label="Change language" onClick={() => changeLocale(i18n.language === 'ru' ? 'en' : 'ru')}>
								<LanguageOutlined />
							</IconButton>
							<IconButton aria-label="Toggle theme" onClick={(event) => ThemeController.toggle(event)}>
								<DarkModeOutlined />
							</IconButton>
						</div>
					</Stack>
				</div>
			</aside>
			<main className="portal-main">
				<Outlet />
			</main>
		</div>
	);
}
