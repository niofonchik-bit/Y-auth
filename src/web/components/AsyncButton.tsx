import { Button, type ButtonProps, CircularProgress } from '@mui/material';

export default function AsyncButton({
  loading,
  children,
  disabled,
  ...props
}: ButtonProps & { loading?: boolean }) {
  return (
    <Button
      {...props}
      disabled={disabled || loading}
      startIcon={loading ? <CircularProgress size={16} /> : props.startIcon}
    >
      {children}
    </Button>
  );
}
