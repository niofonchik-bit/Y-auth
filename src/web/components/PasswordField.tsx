import { IconButton, InputAdornment, TextField, type TextFieldProps } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function PasswordField({ slotProps, disabled, ...props }: TextFieldProps) {
	const [visible, setVisible] = useState(false);
	const { t } = useTranslation();
	return (
		<TextField
			{...props}
			disabled={disabled}
			type={visible ? 'text' : 'password'}
			slotProps={{
				...slotProps,
				input: (ownerState) => {
					const input = typeof slotProps?.input === 'function' ? slotProps.input(ownerState) : slotProps?.input;
					return {
						...input,
						endAdornment: (
							<>
								{input?.endAdornment}
								<InputAdornment position="end">
									<IconButton
										className="password-toggle"
										size="small"
										disabled={disabled}
										aria-label={t(visible ? 'auth.hidePassword' : 'auth.showPassword')}
										aria-pressed={visible}
										onMouseDown={(event) => event.preventDefault()}
										onClick={() => setVisible((value) => !value)}
									>
										<svg
											className={`password-eye${visible ? ' is-visible' : ''}`}
											width="22"
											height="22"
											viewBox="0 0 24 24"
											fill="none"
											aria-hidden="true"
										>
											<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
											<circle cx="12" cy="12" r="3" />
											<path className="eye-slash" d="M4 4 20 20" pathLength="1" />
										</svg>
									</IconButton>
								</InputAdornment>
							</>
						),
					};
				},
			}}
		/>
	);
}
