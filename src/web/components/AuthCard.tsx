import type { ReactNode } from 'react';
import AppearanceControls from './AppearanceControls';

export default function AuthCard({ children }: { children: ReactNode }) {
	return (
		<main className="auth-page">
			<div className="auth-controls">
				<AppearanceControls />
			</div>
			<section className="auth-single surface">
				<div className="brand-logo">
					<span className="brand-mark">Y</span> Y.auth
				</div>
				{children}
			</section>
		</main>
	);
}
