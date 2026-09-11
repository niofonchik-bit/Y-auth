import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LanguageOutlined from '@mui/icons-material/LanguageOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import { Button, IconButton, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { changeLocale } from '../i18n';
import { ThemeController } from '../theme';

export default function AppearanceControls() {
	const { i18n } = useTranslation();
	const russian = i18n.language.startsWith('ru');
	return (
		<>
			<Tooltip title={russian ? 'Switch to English' : 'Переключить на русский'}>
				<Button
					className="appearance-language"
					size="small"
					aria-label="Change language"
					startIcon={<LanguageOutlined fontSize="small" />}
					onClick={() => changeLocale(russian ? 'en' : 'ru')}
				>
					{russian ? 'RU' : 'EN'}
				</Button>
			</Tooltip>
			<Tooltip title={russian ? 'Сменить тему' : 'Toggle theme'}>
				<IconButton className="appearance-theme" size="small" aria-label="Toggle theme" onClick={(event) => ThemeController.toggle(event)}>
					<DarkModeOutlined className="theme-icon-light" fontSize="small" />
					<LightModeOutlined className="theme-icon-dark" fontSize="small" />
				</IconButton>
			</Tooltip>
		</>
	);
}
