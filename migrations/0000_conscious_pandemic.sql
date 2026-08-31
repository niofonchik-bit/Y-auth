CREATE TYPE "public"."captcha_mode" AS ENUM('off', 'adaptive', 'always_registration');--> statement-breakpoint
CREATE TYPE "public"."client_type" AS ENUM('public', 'confidential');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'deactivated');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"target_user_id" uuid,
	"client_id" uuid,
	"session_id" uuid,
	"ip" text,
	"user_agent" text,
	"success" boolean NOT NULL,
	"reason_code" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"registration_enabled" boolean DEFAULT true NOT NULL,
	"min_password_length" integer DEFAULT 6 NOT NULL,
	"captcha_mode" "captcha_mode" DEFAULT 'adaptive' NOT NULL,
	"access_token_ttl_seconds" integer DEFAULT 600 NOT NULL,
	"sso_idle_ttl_seconds" integer DEFAULT 604800 NOT NULL,
	"sso_absolute_ttl_seconds" integer DEFAULT 2592000 NOT NULL,
	"refresh_token_ttl_seconds" integer DEFAULT 7776000 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_client_post_logout_redirect_uris" (
	"client_id" uuid NOT NULL,
	"uri" text NOT NULL,
	CONSTRAINT "oauth_client_post_logout_redirect_uris_client_id_uri_pk" PRIMARY KEY("client_id","uri")
);
--> statement-breakpoint
CREATE TABLE "oauth_client_redirect_uris" (
	"client_id" uuid NOT NULL,
	"uri" text NOT NULL,
	CONSTRAINT "oauth_client_redirect_uris_client_id_uri_pk" PRIMARY KEY("client_id","uri")
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "client_type" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"first_party" boolean DEFAULT true NOT NULL,
	"allowed_scopes" text[] NOT NULL,
	"grant_types" text[] NOT NULL,
	"response_types" text[] NOT NULL,
	"access_token_audience" text NOT NULL,
	"client_secret_hash" text,
	"registration_enabled_override" boolean,
	"min_password_length_override" integer,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oidc_records" (
	"model" text NOT NULL,
	"id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"grant_id" text,
	"user_code" text,
	"uid" text,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "oidc_records_model_id_pk" PRIMARY KEY("model","id")
);
--> statement-breakpoint
CREATE TABLE "password_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_clients" (
	"session_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"grant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_clients_session_id_client_id_pk" PRIMARY KEY("session_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"oidc_uid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"created_ip" text NOT NULL,
	"last_ip" text NOT NULL,
	"user_agent" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"display_name" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"is_admin" boolean DEFAULT false NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_session_id_user_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_post_logout_redirect_uris" ADD CONSTRAINT "oauth_client_post_logout_redirect_uris_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_redirect_uris" ADD CONSTRAINT "oauth_client_redirect_uris_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_credentials" ADD CONSTRAINT "password_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_clients" ADD CONSTRAINT "session_clients_session_id_user_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_clients" ADD CONSTRAINT "session_clients_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_type_idx" ON "audit_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_client_idx" ON "audit_events" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_clients_client_id_unique" ON "oauth_clients" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oidc_records_expires_idx" ON "oidc_records" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oidc_records_grant_idx" ON "oidc_records" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "oidc_records_user_code_idx" ON "oidc_records" USING btree ("user_code");--> statement-breakpoint
CREATE INDEX "oidc_records_uid_idx" ON "oidc_records" USING btree ("uid");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_token_hash_unique" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_expires_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_token_hash_unique" ON "user_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_oidc_uid_unique" ON "user_sessions" USING btree ("oidc_uid");--> statement-breakpoint
CREATE INDEX "user_sessions_user_status_idx" ON "user_sessions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "user_sessions_expiration_idx" ON "user_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_normalized_email_unique" ON "users" USING btree ("normalized_email");--> statement-breakpoint
ALTER TABLE "global_settings" ADD CONSTRAINT "global_settings_singleton" CHECK ("id" = 1);--> statement-breakpoint
ALTER TABLE "global_settings" ADD CONSTRAINT "global_settings_password_length" CHECK ("min_password_length" BETWEEN 6 AND 256);--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_password_override" CHECK ("min_password_length_override" IS NULL OR "min_password_length_override" BETWEEN 6 AND 256);--> statement-breakpoint
INSERT INTO "global_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
