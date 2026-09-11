import { Suspense, useEffect, useRef, useState } from 'react';
import LoadingPreview from './LoadingPreview';
import BrandLogo from './BrandLogo';
import AppsOutlined from '@mui/icons-material/AppsOutlined';
import ArrowOutward from '@mui/icons-material/ArrowOutward';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import DevicesOutlined from '@mui/icons-material/DevicesOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import MenuRounded from '@mui/icons-material/MenuRounded';
import PeopleOutlined from '@mui/icons-material/PeopleOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { Button, IconButton, Typography } from '@mui/material';
import AppearanceControls from './AppearanceControls';
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
	const [sidebarOpen, setSidebarOpen] = useState(false);
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: close the sidebar whenever the route changes.
	useEffect(() => {
		setSidebarOpen(false);
	}, [location.pathname]);

	// Animate the existing DOM so navigation does not remount stateful forms.
	useEffect(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const animation = contentRef.current?.animate(
			[
				{ opacity: 0, transform: 'translateX(12px)' },
				{ opacity: 1, transform: 'translateX(0)' },
			],
			{ id: location.pathname, duration: 280, easing: 'cubic-bezier(0, 0, 0.2, 1)' },
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
	const areaTitle = t(mode === 'admin' ? 'admin.title' : 'account.title');
	const switchTarget = mode === 'admin' ? '/account/profile' : '/admin';
	const switchLabel = t(mode === 'admin' ? 'account.title' : 'admin.title');

	return (
		<div className={`portal${sidebarOpen ? ' sidebar-open' : ''}`}>
			<button type="button" className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />
			<aside className="sidebar">
				<div className="sidebar-brand">
					<BrandLogo />
					<span className={`sidebar-mode-badge${mode === 'admin' ? ' is-admin' : ''}`}>{mode === 'admin' ? 'Admin' : 'Account'}</span>
				</div>
				<nav className="sidebar-nav" aria-label={areaTitle}>
					{links.map(([to, key], index) => {
						const Icon = icons[index];
						return (
							<NavLink
								key={to}
								to={to}
								end={to === '/admin'}
								title={t(key)}
								className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
								onClick={() => setSidebarOpen(false)}
							>
								{Icon && <Icon />}
								<span>{t(key)}</span>
							</NavLink>
						);
					})}
				</nav>
				<div className="sidebar-footer">
					<div className="sidebar-account">
						<div className="account-avatar" aria-hidden="true">
							{name.slice(0, 1).toUpperCase()}
						</div>
						<div className="sidebar-account-copy">
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
					<div className="portal-topbar-left">
						<IconButton
							className="sidebar-toggle"
							aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
							aria-expanded={sidebarOpen}
							onClick={() => setSidebarOpen((value) => !value)}
						>
							{sidebarOpen ? <CloseRounded /> : <MenuRounded />}
						</IconButton>
						<div className="breadcrumbs">
							<span>{areaTitle}</span>
							<span className="breadcrumb-separator" aria-hidden="true">
								/
							</span>
							<strong>{current ? t(current[1]) : 'Y.auth'}</strong>
						</div>
					</div>
					<div className="topbar-actions">
						{import.meta.env.VITE_APP_ENVIRONMENT === 'development' && <span className="environment-badge">Development</span>}
						{(mode === 'admin' || account?.isAdmin) && (
							<Button
								className="portal-switch"
								component={NavLink}
								to={switchTarget}
								size="small"
								variant="outlined"
								startIcon={<ArrowOutward />}
							>
								{switchLabel}
							</Button>
						)}
						<AppearanceControls />
					</div>
				</header>
				<main className="portal-main">
					<div className="route-content" ref={contentRef}>
						<Suspense fallback={<LoadingPreview />}>
							<Outlet />
						</Suspense>
					</div>
				</main>
			</div>
		</div>
	);
}
