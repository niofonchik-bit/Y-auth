import AppsOutlined from '@mui/icons-material/AppsOutlined';
import ArrowOutward from '@mui/icons-material/ArrowOutward';
import ChevronRight from '@mui/icons-material/ChevronRight';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import DevicesOutlined from '@mui/icons-material/DevicesOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import PeopleOutlined from '@mui/icons-material/PeopleOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { Typography } from '@mui/material';
import { useRef } from 'react';
import AppearanceControls from './AppearanceControls';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';

interface Account {
	email: string;
	displayName: string | null;
	isAdmin: boolean;
}

export default function PortalShell({ mode }: { mode: 'account' | 'admin' }) {
	const { t } = useTranslation();
	const contentRef = useRef<HTMLDivElement>(null);
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
	// Animate the existing DOM so navigation does not remount stateful forms.
	useEffect(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const animation = contentRef.current?.animate(
			[
				{ opacity: 0, transform: 'translateY(8px)' },
				{ opacity: 1, transform: 'translateY(0)' },
			],
			{ id: location.pathname, duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
		);
		return () => animation?.cancel();
	}, [location.pathname]);
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
	const icons =
		mode === 'admin'
			? [DashboardOutlined, AppsOutlined, PeopleOutlined, DevicesOutlined, HistoryOutlined, SettingsOutlined]
			: [PersonOutlined, ShieldOutlined, DevicesOutlined, WarningAmberOutlined];
	const current = [...links].reverse().find(([to]) => location.pathname === to || location.pathname.startsWith(`${to}/`));
	const name = account?.displayName || account?.email || t('common.loading');
	return (
		<div className="portal">
			<aside className="sidebar">
				<div className="sidebar-brand">
					<div className="brand-logo">
						<span className="brand-mark">Y</span> Y.auth
					</div>
				</div>
				<div className="sidebar-caption">{t(mode === 'admin' ? 'admin.title' : 'account.title')}</div>
				<nav className="sidebar-nav" aria-label={t(mode === 'admin' ? 'admin.title' : 'account.title')}>
					{links.map(([to, key], index) => {
						const Icon = icons[index];
						return (
							<NavLink key={to} to={to} end={to === '/admin'} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
								{Icon && <Icon />}
								<span>{t(key)}</span>
							</NavLink>
						);
					})}
				</nav>
				<div className="sidebar-footer">
					{(mode === 'admin' || account?.isAdmin) && (
						<NavLink className="sidebar-link" to={mode === 'admin' ? '/account/profile' : '/admin'}>
							<ArrowOutward />
							<span>{t(mode === 'admin' ? 'account.title' : 'admin.title')}</span>
						</NavLink>
					)}
					<div className="sidebar-account">
						<div className="account-avatar" aria-hidden="true">
							{name.slice(0, 1).toUpperCase()}
						</div>
						<div>
							<Typography variant="body2" title={name}>
								{name}
							</Typography>
							<Typography variant="caption" color="text.secondary" title={account?.email}>
								{account?.email}
							</Typography>
						</div>
					</div>
				</div>
			</aside>
			<div className="portal-workspace">
				<header className="portal-topbar">
					<div className="breadcrumbs">
						<ShieldOutlined />
						<span>{t(mode === 'admin' ? 'admin.title' : 'account.title')}</span>
						<ChevronRight />
						<strong>{current ? t(current[1]) : 'Y.auth'}</strong>
					</div>
					<div className="topbar-actions">
						{import.meta.env.VITE_APP_ENVIRONMENT === 'development' && <span className="environment-badge">DEVELOPMENT</span>}
						<AppearanceControls />
					</div>
				</header>
				<main className="portal-main">
					<div className="route-content" ref={contentRef}>
						<Outlet />
					</div>
				</main>
			</div>
		</div>
	);
}
