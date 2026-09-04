import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './i18n';
import './styles/tokens.css';
import './styles/base.css';
import './styles/motion.css';
import { ThemeController } from './theme';

ThemeController.initialize();

const root = document.getElementById('root');
if (!root) throw new Error('Root element is missing');

createRoot(root).render(
	<StrictMode>
		<BrowserRouter>
			<App />
		</BrowserRouter>
	</StrictMode>,
);
