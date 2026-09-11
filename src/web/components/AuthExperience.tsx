import { Suspense } from 'react';
import { Typography } from '@mui/material';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppearanceControls from './AppearanceControls';
import { BrandSymbol } from './BrandLogo';
import LoadingPreview from './LoadingPreview';

function BrandFeature({ children }: { children: string }) {
	return (
		<li>
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
				<path d="M2.5 7l3 3L11.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
			<span>{children}</span>
		</li>
	);
}

export default function AuthExperience() {
	const { pathname } = useLocation();
	const { t } = useTranslation();
	return (
		<main className="auth-page auth-page--split">
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
					<div className="auth-brand-grid" aria-hidden="true" />
					<div className="auth-brand-watermark" aria-hidden="true">
						<BrandSymbol />
					</div>
					<div className="auth-brand-content">
						<div className="auth-brand-kicker">Y.auth</div>
						<Typography component="h2" className="auth-brand-title">
							{t('auth.brandTitle')}
						</Typography>
						<Typography component="p" className="auth-brand-subtitle">
							{t('auth.brandSubtitle')}
						</Typography>
						<ul className="auth-brand-features">
							<BrandFeature>{t('auth.brandFeatureSso')}</BrandFeature>
							<BrandFeature>{t('auth.brandFeatureMfa')}</BrandFeature>
							<BrandFeature>{t('auth.brandFeatureAudit')}</BrandFeature>
						</ul>
					</div>
				</aside>
			</section>
		</main>
	);
}
