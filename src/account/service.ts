import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuditService } from '../audit/service.js';
import { normalizeEmail } from '../auth/service.js';
import type { PolicyResolver } from '../clients/policy.js';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { passwordCredentials, users } from '../db/schema.js';
import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  validatePassword,
  verifyPassword,
} from '../security/password.js';
import type { AuthenticatedSession, SessionService } from '../sessions/service.js';
import { AppError } from '../shared/errors.js';

export class AccountService {
  constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
    private readonly policies: PolicyResolver,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  private async verifyCurrentPassword(userId: string, password: string): Promise<void> {
    const [credential] = await this.db
      .select({ passwordHash: passwordCredentials.passwordHash })
      .from(passwordCredentials)
      .where(eq(passwordCredentials.userId, userId))
      .limit(1);
    if (!credential || !(await verifyPassword(credential.passwordHash, password))) {
      throw new AppError(401, 'CURRENT_PASSWORD_INVALID', 'Current password is invalid');
    }
  }

  async updateDisplayName(userId: string, displayName: string | null): Promise<void> {
    await this.db
      .update(users)
      .set({ displayName: displayName?.trim() || null, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async changeEmail(
    auth: AuthenticatedSession,
    newEmail: string,
    currentPassword: string,
    request: FastifyRequest,
  ): Promise<void> {
    await this.verifyCurrentPassword(auth.user.id, currentPassword);
    const normalizedEmail = normalizeEmail(newEmail);
    if (!normalizedEmail.includes('@') || normalizedEmail.length > 320) {
      throw new AppError(400, 'INVALID_EMAIL', 'Email is invalid');
    }
    try {
      await this.db
        .update(users)
        .set({
          email: newEmail.trim(),
          normalizedEmail,
          emailVerifiedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, auth.user.id));
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === '23505') {
        throw new AppError(409, 'EMAIL_ALREADY_USED', 'Email is already used');
      }
      throw error;
    }
    await this.audit.write({
      type: 'email.changed',
      success: true,
      actorUserId: auth.user.id,
      targetUserId: auth.user.id,
      sessionId: auth.session.id,
      request,
    });
  }

  async changePassword(
    auth: AuthenticatedSession,
    currentPassword: string,
    newPassword: string,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    await this.verifyCurrentPassword(auth.user.id, currentPassword);
    const policy = await this.policies.resolve();
    const error = validatePassword(newPassword, {
      minLength: policy.minPasswordLength,
      maxLength: MAX_PASSWORD_LENGTH,
    });
    if (error) throw new AppError(400, 'PASSWORD_POLICY_FAILED', error);
    const passwordHash = await hashPassword(newPassword, this.config);
    await this.db.transaction(async (tx) => {
      await tx
        .update(passwordCredentials)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(passwordCredentials.userId, auth.user.id));
      await tx
        .update(users)
        .set({ sessionVersion: auth.user.sessionVersion + 1, updatedAt: new Date() })
        .where(eq(users.id, auth.user.id));
    });
    await this.sessions.revokeOthers(auth.user.id, auth.session.id);
    await this.sessions.rotate(auth.session.id, reply);
    await this.audit.write({
      type: 'password.changed',
      success: true,
      actorUserId: auth.user.id,
      targetUserId: auth.user.id,
      sessionId: auth.session.id,
      request,
    });
  }

  async deactivate(auth: AuthenticatedSession, request: FastifyRequest): Promise<void> {
    await this.db
      .update(users)
      .set({
        status: 'deactivated',
        deactivatedAt: new Date(),
        purgeAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, auth.user.id), eq(users.status, 'active')));
    await this.sessions.revokeAll(auth.user.id, 'account_deactivated');
    await this.audit.write({
      type: 'user.deactivated',
      success: true,
      actorUserId: auth.user.id,
      targetUserId: auth.user.id,
      request,
    });
  }
}
