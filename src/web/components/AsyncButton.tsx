import { Button, type ButtonProps } from '@mui/material';

export default function AsyncButton({ loading, children, disabled, ...props }: ButtonProps & { loading?: boolean }) {
	return (
		<Button
			{...props}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			className={`${props.className ?? ''}${loading ? ' is-loading' : ''}`}
		>
			<span className="async-button-label">{children}</span>
			{loading && (
				<span className="loading-dots" aria-hidden="true">
					<i />
					<i />
					<i />
				</span>
			)}
		</Button>
	);
}
