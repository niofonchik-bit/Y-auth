type Theme = 'light' | 'dark';

function preferred(): Theme {
	const stored = localStorage.getItem('y-auth-theme');
	if (stored === 'light' || stored === 'dark') return stored;
	return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const ThemeController = {
	initialize() {
		document.documentElement.dataset.theme = preferred();
	},
	toggle(event?: { clientX: number; clientY: number }) {
		const root = document.documentElement;
		const next: Theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
		const update = () => {
			root.dataset.theme = next;
			localStorage.setItem('y-auth-theme', next);
		};
		const transition = document.startViewTransition;
		if (!transition || matchMedia('(prefers-reduced-motion: reduce)').matches || !event) {
			update();
			return;
		}
		const radius = Math.hypot(Math.max(event.clientX, innerWidth - event.clientX), Math.max(event.clientY, innerHeight - event.clientY));
		root.style.setProperty('--theme-x', `${event.clientX}px`);
		root.style.setProperty('--theme-y', `${event.clientY}px`);
		root.style.setProperty('--theme-radius', `${radius}px`);
		root.classList.add('theme-ripple');
		transition.call(document, update).finished.finally(() => root.classList.remove('theme-ripple'));
	},
};

addEventListener('storage', (event) => {
	if (event.key === 'y-auth-theme' && (event.newValue === 'light' || event.newValue === 'dark'))
		document.documentElement.dataset.theme = event.newValue;
});
