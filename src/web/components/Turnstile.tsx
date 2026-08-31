import { Alert, Box } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'error-callback': () => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export default function Turnstile({ siteKey }: { siteKey: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let widgetId: string | null = null;
    const render = () => {
      if (!container.current || !window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        callback: setToken,
        'error-callback': () => setFailed(true),
      });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-y-auth-turnstile]');
    if (existing) {
      existing.addEventListener('load', render);
      render();
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.yAuthTurnstile = 'true';
      script.addEventListener('load', render);
      document.head.append(script);
    }
    return () => {
      existing?.removeEventListener('load', render);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return (
    <Box>
      <input type="hidden" name="captchaToken" value={token} />
      <div ref={container} />
      {failed && (
        <Alert severity="error" sx={{ mt: 1 }}>
          Security check failed to load.
        </Alert>
      )}
    </Box>
  );
}
