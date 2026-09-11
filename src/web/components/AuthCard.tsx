import type { ReactNode } from 'react';
import AppearanceControls from './AppearanceControls';

export default function AuthCard({ children }: { children: ReactNode }) {
	return (
		<main className="auth-page auth-page--single">
			<div className="auth-controls">
				<AppearanceControls />
			</div>
			<section className="auth-single surface">{children}</section>
		</main>
	);
}
