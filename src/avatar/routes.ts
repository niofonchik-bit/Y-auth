import type { FastifyInstance } from 'fastify';
import type { AvatarService } from './service.js';
import type { AppConfig } from '../config/env.js';
import { verifyCsrf } from '../security/csrf.js';
import type { SessionService } from '../sessions/service.js';
import { requireBrowserSession } from '../shared/auth.js';
import { AppError } from '../shared/errors.js';

export async function registerAvatarRoutes(
	app: FastifyInstance,
	dependencies: { avatars: AvatarService; sessions: SessionService; config: AppConfig },
) {
	app.put('/api/v1/account/avatar', async (request) => {
		const csrf = request.headers['x-csrf-token'];
		if (!verifyCsrf(request, csrf, dependencies.config)) throw new AppError(403, 'CSRF_INVALID', 'Security token is invalid');
		const auth = await requireBrowserSession(request, dependencies.sessions);
		const file = await request.file({ limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
		if (!file) throw new AppError(400, 'AVATAR_REQUIRED', 'Select an image');
		return dependencies.avatars.upload(auth.user.id, await file.toBuffer());
	});

	app.delete('/api/v1/account/avatar', async (request) => {
		const csrf = request.headers['x-csrf-token'];
		if (!verifyCsrf(request, csrf, dependencies.config)) throw new AppError(403, 'CSRF_INVALID', 'Security token is invalid');
		const auth = await requireBrowserSession(request, dependencies.sessions);
		await dependencies.avatars.remove(auth.user.id);
		return { removed: true };
	});

	app.get<{ Params: { userId: string } }>('/avatars/:userId', async (request, reply) => {
		return reply.header('Cache-Control', 'private, max-age=300').redirect(await dependencies.avatars.signedUrl(request.params.userId));
	});
}
