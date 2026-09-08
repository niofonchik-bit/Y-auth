import { Suspense } from 'react';
import { Typography } from '@mui/material';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppearanceControls from './AppearanceControls';
import { BrandSymbol } from './BrandLogo';
import LoadingPreview from './LoadingPreview';

export default function AuthExperience() {
	const { pathname } = useLocation();
	const { t } = useTranslation();
	return (
		<main className="auth-page">
			<div className="auth-controls">
				<AppearanceControls />
			</div>
			<section className={`auth-frame auth-switcher surface${pathname === '/register' ? ' is-register' : ''}`}>
				<div className="auth-panel">
					<Suspense fallback={<LoadingPreview rows={4} />}>
						<Outlet />
					</Suspense>
				</div>
				<aside className="auth-brand">
					<div className="auth-brand-content">
						<div className="identity-art" aria-hidden="true">
							<div className="identity-core">
								<BrandSymbol />
							</div>
						</div>
						<Typography variant="h3">{t('auth.brandTitle')}</Typography>
						<Typography sx={{ mt: 2 }}>{t('auth.brandSubtitle')}</Typography>
					</div>
				</aside>
			</section>
		</main>
	);
}
