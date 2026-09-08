import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
	en: {
		translation: {
			common: {
				save: 'Save',
				discard: 'Discard',
				cancel: 'Cancel',
				loading: 'Loading…',
				status: 'Status',
				search: 'Search',
				previous: 'Previous',
				next: 'Next',
			},
			auth: {
				signIn: 'Sign in',
				noAccount: 'New here? Create an account',
				hasAccount: 'Already have an account? Sign in',
				displayName: 'Display name',
				passwordHint: 'At least 15 characters',
				showPassword: 'Show password',
				hidePassword: 'Hide password',
				brandTitle: 'One identity. Every application.',
				brandSubtitle: 'Your applications, connected through one account.',
				createAccount: 'Create account',
				continueTo: 'to continue to {{client}}',
				email: 'Email address',
				password: 'Password',
				keepSignedIn: 'Keep me signed in',
				forgot: 'Forgot password?',
				google: 'Continue with Google',
				mfa: 'Authenticator or recovery code',
			},
			account: { title: 'Account', profile: 'Profile', security: 'Security', sessions: 'Sessions', danger: 'Danger zone' },
			admin: {
				title: 'Administration',
				overview: 'Overview',
				applications: 'Applications',
				users: 'Users',
				sessions: 'Sessions',
				audit: 'Audit',
				settings: 'Settings',
			},
			errors: {
				INVALID_CREDENTIALS: 'Email or password is incorrect.',
				MFA_REQUIRED: 'Enter your two-factor authentication code.',
				default: 'The request could not be completed.',
			},
		},
	},
	ru: {
		translation: {
			common: {
				save: 'Сохранить',
				discard: 'Отменить изменения',
				cancel: 'Отмена',
				loading: 'Загрузка…',
				status: 'Статус',
				search: 'Поиск',
				previous: 'Назад',
				next: 'Далее',
			},
			auth: {
				signIn: 'Войти',
				noAccount: 'Нет аккаунта? Зарегистрироваться',
				hasAccount: 'Уже есть аккаунт? Войти',
				displayName: 'Имя',
				passwordHint: 'Не менее 15 символов',
				showPassword: 'Показать пароль',
				hidePassword: 'Скрыть пароль',
				brandTitle: 'Один аккаунт. Все приложения.',
				brandSubtitle: 'Ваши приложения, объединённые одним аккаунтом.',
				createAccount: 'Создать аккаунт',
				continueTo: 'для продолжения в {{client}}',
				email: 'Email',
				password: 'Пароль',
				keepSignedIn: 'Оставаться в системе',
				forgot: 'Забыли пароль?',
				google: 'Продолжить с Google',
				mfa: 'Код приложения или восстановления',
			},
			account: { title: 'Аккаунт', profile: 'Профиль', security: 'Безопасность', sessions: 'Сессии', danger: 'Опасная зона' },
			admin: {
				title: 'Администрирование',
				overview: 'Обзор',
				applications: 'Приложения',
				users: 'Пользователи',
				sessions: 'Сессии',
				audit: 'Аудит',
				settings: 'Настройки',
			},
			errors: {
				INVALID_CREDENTIALS: 'Неверный email или пароль.',
				MFA_REQUIRED: 'Введите код двухфакторной аутентификации.',
				default: 'Не удалось выполнить запрос.',
			},
		},
	},
} as const;

const saved = localStorage.getItem('y-auth-locale');
const language = saved === 'ru' || saved === 'en' ? saved : navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
await i18n.use(initReactI18next).init({ resources, lng: language, fallbackLng: 'en', interpolation: { escapeValue: false } });

document.documentElement.lang = language;

export async function changeLocale(locale: 'en' | 'ru') {
	localStorage.setItem('y-auth-locale', locale);
	await i18n.changeLanguage(locale);
	document.documentElement.lang = locale;
	if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
		// Animate existing nodes; keep form state and input focus intact.
		for (const element of document.querySelectorAll<HTMLElement>('.auth-form, .auth-brand-content, .sidebar-nav, .breadcrumbs')) {
			element
				.getAnimations()
				.filter((animation) => animation.id === 'locale-change')
				.forEach((animation) => {
					animation.cancel();
				});
			element.animate(
				[
					{ opacity: 0.4, transform: 'translateY(3px)' },
					{ opacity: 1, transform: 'translateY(0)' },
				],
				{ id: 'locale-change', duration: 240, easing: 'ease-out' },
			);
		}
	}
}

export default i18n;
