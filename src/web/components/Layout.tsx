import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import { AppBar, Box, Button, Container, Stack, Toolbar, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="static"
        color="transparent"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar>
          <ShieldOutlined color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Y.auth
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button component={RouterLink} to="/account">
              Account
            </Button>
            <Button component={RouterLink} to="/admin">
              Admin
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
        {children}
      </Container>
    </Box>
  );
}
