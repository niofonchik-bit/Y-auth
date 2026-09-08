import { createElement } from 'react';
import AnimatedCheck from './components/AnimatedCheck';
import { createTheme } from '@mui/material';

// Keep MUI's calculated colors (labels, disabled inputs, menus) in sync with CSS tokens.
export function createPortalTheme(mode: 'light' | 'dark') {
	const dark = mode === 'dark';
	return createTheme({
		palette: {
			mode,
			primary: { main: dark ? '#6bc6ab' : '#22785f', contrastText: dark ? '#10251e' : '#ffffff' },
			success: { main: dark ? '#6bc6ab' : '#22785f' },
			error: { main: dark ? '#ff453a' : '#c62828', light: '#ff6259', dark: '#b91c1c', contrastText: '#ffffff' },
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
			MuiCheckbox: {
				defaultProps: {
					icon: createElement(AnimatedCheck),
					checkedIcon: createElement(AnimatedCheck, { checked: true }),
					indeterminateIcon: createElement(AnimatedCheck, { indeterminate: true }),
				},
			},
			// Use layout gaps so field margins cannot collapse the space between controls.
			MuiStack: { defaultProps: { useFlexGap: true } },
			MuiTextField: { defaultProps: { size: 'small', variant: 'outlined' } },
			// The label and the input share one height token, including the larger auth fields.
			MuiInputLabel: {
				styleOverrides: {
					root: {
						'&.MuiInputLabel-outlined': {
							fontSize: 14,
							lineHeight: '20px',
							transform: 'translate(14px, calc((var(--field-height, 44px) - 20px) / 2)) scale(1)',
							'&.MuiInputLabel-shrink': { transform: 'translate(14px, -9px) scale(0.75)' },
						},
					},
				},
			},
			MuiOutlinedInput: {
				styleOverrides: {
					root: {
						minHeight: 'var(--field-height, 44px)',
						fontSize: 14,
						backgroundColor: 'var(--bg-surface)',
						'--field-autofill': 'color-mix(in srgb, var(--accent-primary) 8%, var(--bg-surface))',
						'&:has(input:-webkit-autofill)': { backgroundColor: 'var(--field-autofill)', transition: 'none' },
						'&:has(input:autofill)': { backgroundColor: 'var(--field-autofill)', transition: 'none' },
						transition: 'background-color 220ms',
						outline: 'none',
						'& fieldset': { borderColor: 'var(--border-default)', transition: 'border-color 240ms, box-shadow 240ms' },
						'&:hover:not(.Mui-disabled) fieldset': { borderColor: 'var(--accent-primary)' },
						'&.Mui-focused': { boxShadow: 'none' },
						'&.Mui-error fieldset': { borderColor: 'var(--status-error)' },
						'&.MuiInputBase-multiline': { padding: '12px 14px' },
					},
					input: {
						height: '20px',
						lineHeight: '20px',
						padding: 'calc((var(--field-height, 44px) - 20px) / 2) 14px',
						'&:-webkit-autofill': {
							WebkitBoxShadow: '0 0 0 1000px var(--field-autofill) inset',
							WebkitTextFillColor: 'var(--text-primary)',
							caretColor: 'var(--text-primary)',
							borderRadius: 'inherit',
						},
						'&:autofill': {
							boxShadow: '0 0 0 1000px var(--field-autofill) inset',
							caretColor: 'var(--text-primary)',
						},
						'&.MuiInputBase-inputMultiline': { height: 'auto', padding: 0 },
					},
				},
			},
			MuiButton: {
				defaultProps: { disableElevation: true, disableRipple: true },
				styleOverrides: {
					root: {
						minHeight: 38,
						paddingInline: 16,
						borderRadius: 'var(--radius-sm)',
						position: 'relative',
						overflow: 'hidden',
						'&.Mui-focusVisible': { outline: '2px solid currentColor', outlineOffset: 3 },
						// White text needs a deeper red fill than error text on a dark surface.
						'&.MuiButton-contained.MuiButton-colorError': {
							'--variant-containedBg': '#c62828',
							'@media (hover: hover)': { '&:hover': { '--variant-containedBg': '#a91f1f' } },
						},
					},
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
			MuiAlert: {
				styleOverrides: {
					root: ({ ownerState }) => ({
						borderRadius: 10,
						alignItems: 'center',
						...(ownerState.severity === 'error' && ownerState.variant !== 'filled'
							? {
									color: 'var(--status-error)',
									backgroundColor: 'var(--error-subtle)',
									border: '1px solid var(--error-border)',
									'& .MuiAlert-icon': { color: 'inherit' },
								}
							: {}),
					}),
				},
			},
			MuiSelect: {
				styleOverrides: {
					icon: { transition: 'transform 280ms var(--ease-standard), color 280ms', color: 'var(--text-secondary)' },
					select: { '&:focus': { backgroundColor: 'transparent' } },
				},
			},
			MuiMenu: {
				defaultProps: {
					transitionDuration: { enter: 240, exit: 180 },
					slotProps: { transition: { easing: { enter: 'cubic-bezier(0.2, 0.8, 0.2, 1)', exit: 'ease-in-out' } } },
				},
				styleOverrides: {
					paper: {
						marginTop: 6,
						padding: 4,
						borderRadius: 12,
						backgroundColor: 'var(--bg-surface)',
						border: '1px solid var(--border-default)',
						boxShadow: '0 8px 28px rgb(0 0 0 / 14%)',
						maxHeight: 'min(360px, calc(100dvh - 48px))',
						overscrollBehavior: 'contain',
					},
					list: { padding: 0 },
				},
			},
			MuiMenuItem: {
				defaultProps: { disableRipple: true },
				styleOverrides: {
					root: {
						margin: '2px 0',
						padding: '9px 12px',
						borderRadius: 7,
						minHeight: 38,
						fontSize: 14,
						whiteSpace: 'normal',
						overflowWrap: 'anywhere',
						transition: 'background-color 240ms var(--ease-standard), color 240ms, box-shadow 240ms',
						'&:hover': { backgroundColor: 'var(--bg-surface-hover)' },
						'&.Mui-selected': {
							backgroundColor: 'var(--accent-subtle)',
							color: 'var(--accent-primary)',
							boxShadow: 'inset 2px 0 0 var(--accent-primary)',
						},
						'&.Mui-selected:hover, &.Mui-focusVisible': {
							backgroundColor: 'var(--accent-subtle)',
							boxShadow: 'inset 0 0 0 1px var(--accent-border)',
						},
						'&.Mui-selected.Mui-focusVisible': { boxShadow: 'inset 2px 0 0 var(--accent-primary), inset 0 0 0 1px var(--accent-border)' },
					},
				},
			},
			MuiTooltip: { defaultProps: { arrow: true } },
		},
	});
}
