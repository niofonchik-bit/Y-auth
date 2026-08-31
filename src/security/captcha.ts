import type { AppConfig } from '../config/env.js';

export interface CaptchaProvider {
  verify(token: string, ip: string): Promise<boolean>;
}

export class TurnstileCaptchaProvider implements CaptchaProvider {
  constructor(private readonly secret: string) {}

  async verify(token: string, ip: string): Promise<boolean> {
    const body = new URLSearchParams({ secret: this.secret, response: token, remoteip: ip });
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { success?: boolean };
    return data.success === true;
  }
}

export function createCaptchaProvider(config: AppConfig): CaptchaProvider | null {
  return config.TURNSTILE_SECRET_KEY
    ? new TurnstileCaptchaProvider(config.TURNSTILE_SECRET_KEY)
    : null;
}
