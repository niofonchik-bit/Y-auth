import { createTheme } from '@mui/material';

// Keep MUI's calculated colors (labels, disabled inputs, menus) in sync with CSS tokens.
export function createPortalTheme(mode: 'light' | 'dark') {
	const dark = mode === 'dark';
	return createTheme({
		palette: {
			mode,
			primary: { main: dark ? '#6bc6ab' : '#22785f', contrastText: dark ? '#10251e' : '#ffffff' },
			success: { main: dark ? '#6bc6ab' : '#22785f' },
			error: { main: dark ? '#f28b92' : '#bb414b' },
			warning: { main: dark ? '#e8bc73' : '#98651f' },
			info: { main: dark ? '#8fbbea' : '#396b9e' },
			background: { default: dark ? '#101214' : '#f5f6f8', paper: dark ? '#181b1e' : '#ffffff' },
			text: { primary: dark ? '#edf0f2' : '#20282f', secondary: dark ? '#a1aab2' : '#626e79' },
			divider: dark ? '#2a3035' : '#e9edf0',
		},
		shape: { borderRadius: 8 },
		typography: {
			fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
			fontSize: 13,
			h3: { fontSize: '2.5rem', fontWeight: 600, lineHeight: 1.16, letterSpacing: '-0.045em' },
			h4: { fontSize: '1.75rem', fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.035em' },
			h5: { fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.025em' },
			h6: { fontSize: '1rem', fontWeight: 600 },
			body1: { fontSize: '0.875rem', lineHeight: 1.65 },
			body2: { fontSize: '0.8125rem', lineHeight: 1.6 },
			button: { textTransform: 'none', fontWeight: 600 },
		},
		components: {
			MuiCssBaseline: { styleOverrides: { body: { background: 'var(--bg-primary)', color: 'var(--text-primary)' } } },
			MuiPaper: {
				defaultProps: { elevation: 0 },
				styleOverrides: { root: { backgroundImage: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' } },
			},
			MuiTextField: { defaultProps: { size: 'small', variant: 'outlined' } },
			MuiOutlinedInput: {
				styleOverrides: {
					root: {
						minHeight: 42,
						backgroundColor: 'var(--bg-surface)',
						transition: 'box-shadow 180ms, border-color 180ms',
						'& fieldset': { borderColor: 'var(--border-default)' },
						'&:hover fieldset': { borderColor: 'var(--text-disabled)' },
						'&.Mui-focused': { boxShadow: '0 0 0 3px var(--accent-subtle)' },
					},
				},
			},
			MuiButton: {
				defaultProps: { disableElevation: true },
				styleOverrides: {
					root: { minHeight: 38, paddingInline: 16, borderRadius: 'var(--radius-sm)' },
					outlined: { borderColor: 'var(--border-default)' },
					sizeSmall: { minHeight: 32, paddingInline: 10 },
				},
			},
			MuiIconButton: { styleOverrides: { root: { borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' } } },
			MuiTab: { styleOverrides: { root: { minHeight: 48, textTransform: 'none', fontWeight: 500 } } },
			MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: '3px 3px 0 0' } } },
			MuiDialog: { styleOverrides: { paper: { borderRadius: 16, boxShadow: 'var(--shadow-floating)' } } },
			MuiDialogTitle: { styleOverrides: { root: { padding: '24px 24px 16px', fontSize: 19, fontWeight: 600 } } },
			MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px', borderTop: '1px solid var(--border-subtle)', gap: 8 } } },
			MuiBackdrop: { styleOverrides: { root: { backgroundColor: 'var(--overlay-backdrop)', backdropFilter: 'blur(4px)' } } },
			MuiAlert: { styleOverrides: { root: { borderRadius: 10, alignItems: 'center' } } },
			MuiMenu: { styleOverrides: { paper: { marginTop: 4, boxShadow: 'var(--shadow-card)' } } },
			MuiMenuItem: { styleOverrides: { root: { margin: '2px 6px', borderRadius: 6, minHeight: 36 } } },
			MuiTooltip: { defaultProps: { arrow: true } },
		},
	});
}
