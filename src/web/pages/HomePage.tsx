import { Alert, Paper, Typography } from '@mui/material';

export default function HomePage() {
	return (
		<Paper sx={{ maxWidth: 720, mx: 'auto', p: 4 }}>
			<Typography variant="h3" component="h1" gutterBottom>
				Y.auth
			</Typography>
			<Typography color="text.secondary" sx={{ mb: 3 }}>
				Central identity provider for Niofon applications.
			</Typography>
			<Alert severity="info">Sign-in starts from a registered application. Use Account to manage an existing Y.auth session.</Alert>
		</Paper>
	);
}
