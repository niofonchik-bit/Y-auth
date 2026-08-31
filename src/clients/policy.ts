import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { globalSettings, oauthClients } from '../db/schema.js';

export interface EffectivePolicy {
  registrationEnabled: boolean;
  minPasswordLength: number;
  captchaMode: 'off' | 'adaptive' | 'always_registration';
}

export function resolveEffectivePolicy(
  global: EffectivePolicy,
  overrides?: {
    registrationEnabledOverride: boolean | null;
    minPasswordLengthOverride: number | null;
  },
): EffectivePolicy {
  return {
    registrationEnabled: overrides?.registrationEnabledOverride ?? global.registrationEnabled,
    minPasswordLength: overrides?.minPasswordLengthOverride ?? global.minPasswordLength,
    captchaMode: global.captchaMode,
  };
}

export class PolicyResolver {
  constructor(private readonly db: Database) {}

  async resolve(clientId?: string): Promise<EffectivePolicy> {
    const [global] = await this.db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.id, 1))
      .limit(1);
    if (!global) throw new Error('Global settings are missing; run migrations');

    if (!clientId) {
      return resolveEffectivePolicy({
        registrationEnabled: global.registrationEnabled,
        minPasswordLength: global.minPasswordLength,
        captchaMode: global.captchaMode,
      });
    }

    const [client] = await this.db
      .select({
        registrationEnabledOverride: oauthClients.registrationEnabledOverride,
        minPasswordLengthOverride: oauthClients.minPasswordLengthOverride,
      })
      .from(oauthClients)
      .where(eq(oauthClients.clientId, clientId))
      .limit(1);

    return resolveEffectivePolicy(
      {
        registrationEnabled: global.registrationEnabled,
        minPasswordLength: global.minPasswordLength,
        captchaMode: global.captchaMode,
      },
      client,
    );
  }
}
