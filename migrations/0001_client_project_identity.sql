ALTER TABLE "oauth_clients" ADD COLUMN "project_key" text;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "allow_loopback_redirects" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "oauth_clients"
SET "project_key" = 'legacy-' || substr(md5("client_id"), 1, 12)
WHERE "project_key" IS NULL;--> statement-breakpoint
ALTER TABLE "oauth_clients" ALTER COLUMN "project_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_clients_project_key_unique" ON "oauth_clients" USING btree ("project_key");
