import type { FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { auditEvents } from '../db/schema.js';

export interface AuditInput {
  type: string;
  success: boolean;
  actorUserId?: string | null;
  targetUserId?: string | null;
  clientId?: string | null;
  sessionId?: string | null;
  reasonCode?: string | null;
  metadata?: Record<string, unknown>;
  request?: FastifyRequest;
}

export class AuditService {
  constructor(private readonly db: Database) {}

  async write(input: AuditInput): Promise<void> {
    await this.db.insert(auditEvents).values({
      type: input.type,
      success: input.success,
      actorUserId: input.actorUserId ?? null,
      targetUserId: input.targetUserId ?? null,
      clientId: input.clientId ?? null,
      sessionId: input.sessionId ?? null,
      ip: input.request?.ip ?? null,
      userAgent: input.request?.headers['user-agent'] ?? null,
      reasonCode: input.reasonCode ?? null,
      metadata: input.metadata ?? {},
    });
  }
}
