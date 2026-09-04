import { describe, expect, it } from 'vitest';
import { resolveEffectivePolicy } from '../../src/clients/policy.js';

describe('client policy inheritance', () => {
	const global = {
		registrationEnabled: true,
		minPasswordLength: 6,
		captchaMode: 'adaptive' as const,
	};

	it('inherits nullable values', () => {
		expect(
			resolveEffectivePolicy(global, {
				registrationEnabledOverride: null,
				minPasswordLengthOverride: null,
			}),
		).toEqual(global);
	});

	it('applies explicit client overrides', () => {
		expect(
			resolveEffectivePolicy(global, {
				registrationEnabledOverride: false,
				minPasswordLengthOverride: 12,
			}),
		).toEqual({
			registrationEnabled: false,
			minPasswordLength: 12,
			captchaMode: 'adaptive',
		});
	});

	it('does not allow a client override to weaken the global password minimum', () => {
		expect(
			resolveEffectivePolicy({ ...global, minPasswordLength: 15 }, { registrationEnabledOverride: null, minPasswordLengthOverride: 8 }),
		).toMatchObject({ minPasswordLength: 15 });
	});
});
