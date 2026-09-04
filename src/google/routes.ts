import type { FastifyInstance } from 'fastify';
import type Provider from 'oidc-provider';
import type { AppConfig } from '../config/env.js';
import type { SessionService } from '../sessions/service.js';
import type { GoogleIdentityService } from './service.js';

export async function registerGoogleRoutes(
	app: FastifyInstance,
	dependencies: { google: GoogleIdentityService; sessions: SessionService; provider: Provider; config: AppConfig },
) {
	app.get<{ Querystring: { returnTo?: string; interactionUid?: string } }>('/auth/google/start', async (request, reply) => {
		const url = await dependencies.google.start({
			purpose: 'login',
			returnTo: request.query.returnTo ?? '/account/profile',
			...(request.query.interactionUid ? { interactionUid: request.query.interactionUid } : {}),
		});
		return reply.redirect(url.href);
	});

	app.get('/auth/google/callback', async (request, reply) => {
		const result = await dependencies.google.callback(new URL(request.url, dependencies.config.issuer));
		await dependencies.sessions.create(result.user.id, request, reply, true);
		if (result.correlation.interactionUid) {
			reply.hijack();
			await dependencies.provider.interactionFinished(
				request.raw,
				reply.raw,
				{ login: { accountId: result.user.id, remember: true, amr: ['federated', 'google'] } },
				{ mergeWithLastSubmission: false },
			);
			return;
		}
		return reply.redirect(result.correlation.returnTo);
	});
}
