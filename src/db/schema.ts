import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const userStatus = pgEnum('user_status', ['active', 'deactivated']);
export const clientType = pgEnum('client_type', ['public', 'confidential']);
export const captchaMode = pgEnum('captcha_mode', ['off', 'adaptive', 'always_registration']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    normalizedEmail: text('normalized_email').notNull(),
    displayName: text('display_name'),
    status: userStatus('status').notNull().default('active'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    purgeAfter: timestamp('purge_after', { withTimezone: true }),
    isAdmin: boolean('is_admin').notNull().default(false),
    sessionVersion: integer('session_version').notNull().default(1),
    ...timestamps,
  },
  (table) => [uniqueIndex('users_normalized_email_unique').on(table.normalizedEmail)],
);

export const passwordCredentials = pgTable('password_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oauthClients = pgTable(
  'oauth_clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: text('client_id').notNull(),
    name: text('name').notNull(),
    type: clientType('type').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    firstParty: boolean('first_party').notNull().default(true),
    allowedScopes: text('allowed_scopes').array().notNull(),
    grantTypes: text('grant_types').array().notNull(),
    responseTypes: text('response_types').array().notNull(),
    accessTokenAudience: text('access_token_audience').notNull(),
    clientSecretHash: text('client_secret_hash'),
    registrationEnabledOverride: boolean('registration_enabled_override'),
    minPasswordLengthOverride: integer('min_password_length_override'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('oauth_clients_client_id_unique').on(table.clientId)],
);

export const oauthClientRedirectUris = pgTable(
  'oauth_client_redirect_uris',
  {
    clientId: uuid('client_id')
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'cascade' }),
    uri: text('uri').notNull(),
  },
  (table) => [primaryKey({ columns: [table.clientId, table.uri] })],
);

export const oauthClientPostLogoutRedirectUris = pgTable(
  'oauth_client_post_logout_redirect_uris',
  {
    clientId: uuid('client_id')
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'cascade' }),
    uri: text('uri').notNull(),
  },
  (table) => [primaryKey({ columns: [table.clientId, table.uri] })],
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    oidcUid: text('oidc_uid'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
    createdIp: text('created_ip').notNull(),
    lastIp: text('last_ip').notNull(),
    userAgent: text('user_agent').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revocationReason: text('revocation_reason'),
  },
  (table) => [
    uniqueIndex('user_sessions_token_hash_unique').on(table.tokenHash),
    uniqueIndex('user_sessions_oidc_uid_unique').on(table.oidcUid),
    index('user_sessions_user_status_idx').on(table.userId, table.revokedAt),
    index('user_sessions_expiration_idx').on(table.expiresAt),
  ],
);

export const sessionClients = pgTable(
  'session_clients',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => userSessions.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'cascade' }),
    grantId: text('grant_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.clientId] })],
);

export const oidcRecords = pgTable(
  'oidc_records',
  {
    model: text('model').notNull(),
    id: text('id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    grantId: text('grant_id'),
    userCode: text('user_code'),
    uid: text('uid'),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.model, table.id] }),
    index('oidc_records_expires_idx').on(table.expiresAt),
    index('oidc_records_grant_idx').on(table.grantId),
    index('oidc_records_user_code_idx').on(table.userCode),
    index('oidc_records_uid_idx').on(table.uid),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('password_reset_token_hash_unique').on(table.tokenHash),
    index('password_reset_expires_idx').on(table.expiresAt),
  ],
);

export const globalSettings = pgTable('global_settings', {
  id: integer('id').primaryKey().default(1),
  registrationEnabled: boolean('registration_enabled').notNull().default(true),
  minPasswordLength: integer('min_password_length').notNull().default(6),
  captchaMode: captchaMode('captcha_mode').notNull().default('adaptive'),
  accessTokenTtlSeconds: integer('access_token_ttl_seconds').notNull().default(600),
  ssoIdleTtlSeconds: integer('sso_idle_ttl_seconds').notNull().default(604_800),
  ssoAbsoluteTtlSeconds: integer('sso_absolute_ttl_seconds').notNull().default(2_592_000),
  refreshTokenTtlSeconds: integer('refresh_token_ttl_seconds').notNull().default(7_776_000),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable(
  'audit_events',
  {
    sequence: bigint('sequence', { mode: 'number' }).generatedAlwaysAsIdentity(),
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    clientId: uuid('client_id').references(() => oauthClients.id, { onDelete: 'set null' }),
    sessionId: uuid('session_id').references(() => userSessions.id, { onDelete: 'set null' }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    success: boolean('success').notNull(),
    reasonCode: text('reason_code'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    index('audit_events_created_idx').on(table.createdAt),
    index('audit_events_type_idx').on(table.type),
    index('audit_events_actor_idx').on(table.actorUserId),
    index('audit_events_target_idx').on(table.targetUserId),
    index('audit_events_client_idx').on(table.clientId),
  ],
);

export type User = typeof users.$inferSelect;
export type OAuthClient = typeof oauthClients.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;
