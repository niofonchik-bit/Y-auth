import type { FastifyReply, FastifyRequest } from 'fastify';

export class AppError extends Error {
	constructor(
		public readonly statusCode: number,
		public readonly code: string,
		message: string,
	) {
		super(message);
	}
}

export function sendError(reply: FastifyReply, request: FastifyRequest, error: AppError) {
	return reply.status(error.statusCode).send({
		error: {
			code: error.code,
			message: error.message,
			requestId: request.id,
		},
	});
}
