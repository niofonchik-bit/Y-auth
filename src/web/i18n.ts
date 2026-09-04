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
				createAccount: 'Create account',
				continueTo: 'to continue to {{client}}',
				email: 'Email address',
				password: 'Password',
				keepSignedIn: 'Keep me signed in',
				forgot: 'Forgot password?',
				google: 'Continue with Google',
				mfa: 'Authenticator or recovery code',
				secured: 'Secured by Y.auth',
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
				createAccount: 'Создать аккаунт',
				continueTo: 'для продолжения в {{client}}',
				email: 'Email',
				password: 'Пароль',
				keepSignedIn: 'Оставаться в системе',
				forgot: 'Забыли пароль?',
				google: 'Продолжить с Google',
				mfa: 'Код приложения или восстановления',
				secured: 'Защищено Y.auth',
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

export async function changeLocale(locale: 'en' | 'ru') {
	localStorage.setItem('y-auth-locale', locale);
	await i18n.changeLanguage(locale);
}

export default i18n;
