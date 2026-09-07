import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LanguageOutlined from '@mui/icons-material/LanguageOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import { IconButton, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { changeLocale } from '../i18n';
import { ThemeController } from '../theme';

export default function AppearanceControls() {
	const { i18n } = useTranslation();
	const russian = i18n.language.startsWith('ru');
	return (
		<>
			<Tooltip title={russian ? 'Switch to English' : 'Переключить на русский'}>
				<IconButton size="small" aria-label="Change language" onClick={() => changeLocale(russian ? 'en' : 'ru')}>
					<LanguageOutlined fontSize="small" />
				</IconButton>
			</Tooltip>
			<Tooltip title={russian ? 'Сменить тему' : 'Toggle theme'}>
				<IconButton size="small" aria-label="Toggle theme" onClick={(event) => ThemeController.toggle(event)}>
					<DarkModeOutlined className="theme-icon-light" fontSize="small" />
					<LightModeOutlined className="theme-icon-dark" fontSize="small" />
				</IconButton>
			</Tooltip>
		</>
	);
}
