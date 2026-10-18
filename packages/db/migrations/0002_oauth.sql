CREATE TABLE "identity_jwks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"alg" text,
	"crv" text
);
--> statement-breakpoint
CREATE TABLE "identity_oauth_access_token" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" uuid,
	"user_id" uuid,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"refresh_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked" timestamp with time zone,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL,
	CONSTRAINT "identity_oauth_access_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "identity_oauth_client" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"client_discovery_id" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
	"client_credentials_scopes" text[] DEFAULT '{}',
	"user_id" uuid,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"backchannel_logout_uri" text,
	"backchannel_logout_session_required" boolean,
	"token_endpoint_auth_method" text,
	"application_type" text,
	"jwks" text,
	"jwks_uri" text,
	"grant_types" text[],
	"response_types" text[],
	"require_pkce" boolean,
	"dpop_bound_access_tokens" boolean DEFAULT false,
	"reference_id" text,
	"metadata" jsonb,
	CONSTRAINT "identity_oauth_client_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "identity_oauth_client_assertion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_oauth_client_resource" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "identity_oauth_consent" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid,
	"reference_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_oauth_refresh_token" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" uuid,
	"user_id" uuid NOT NULL,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	"rotation_replay_response" text,
	"rotation_replay_expires_at" timestamp with time zone,
	"auth_time" timestamp with time zone,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL,
	CONSTRAINT "identity_oauth_refresh_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "identity_oauth_resource" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"access_token_ttl" integer,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"allowed_scopes" text[],
	"custom_claims" jsonb,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"disabled" boolean DEFAULT false,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"policy_version" integer DEFAULT 1,
	"metadata" jsonb,
	CONSTRAINT "identity_oauth_resource_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
ALTER TABLE "identity_oauth_access_token" ADD CONSTRAINT "identity_oauth_access_token_client_id_identity_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."identity_oauth_client"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_oauth_access_token" ADD CONSTRAINT "identity_oauth_access_token_session_id_identity_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."identity_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_oauth_access_token" ADD CONSTRAINT "identity_oauth_access_token_user_id_identity_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_oauth_access_token" ADD CONSTRAINT "identity_oauth_access_token_refresh_id_identity_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."identity_oauth_refresh_token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_oauth_client" ADD CONSTRAINT "identity_oauth_client_user_id_identity_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_oauth_client_resource" ADD CONSTRAINT "identity_oauth_client_resource_client_id_identity_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."identity_oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_oauth_client_resource" ADD CONSTRAINT "identity_oauth_client_resource_resource_id_identity_oauth_resource_identifier_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."identity_oauth_resource"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_oauth_consent" ADD CONSTRAINT "identity_oauth_consent_client_id_identity_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."identity_oauth_client"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_oauth_consent" ADD CONSTRAINT "identity_oauth_consent_user_id_identity_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_oauth_refresh_token" ADD CONSTRAINT "identity_oauth_refresh_token_client_id_identity_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."identity_oauth_client"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_oauth_refresh_token" ADD CONSTRAINT "identity_oauth_refresh_token_session_id_identity_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."identity_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_oauth_refresh_token" ADD CONSTRAINT "identity_oauth_refresh_token_user_id_identity_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "identity_oauth_access_token_client_id_idx" ON "identity_oauth_access_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "identity_oauth_access_token_session_id_idx" ON "identity_oauth_access_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "identity_oauth_access_token_user_id_idx" ON "identity_oauth_access_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "identity_oauth_access_token_authorization_code_id_idx" ON "identity_oauth_access_token" USING btree ("authorization_code_id");--> statement-breakpoint
CREATE INDEX "identity_oauth_access_token_refresh_id_idx" ON "identity_oauth_access_token" USING btree ("refresh_id");--> statement-breakpoint
CREATE INDEX "identity_oauth_client_user_id_idx" ON "identity_oauth_client" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "identity_oauth_client_resource_client_id_idx" ON "identity_oauth_client_resource" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "identity_oauth_client_resource_resource_id_idx" ON "identity_oauth_client_resource" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "identity_oauth_consent_client_id_idx" ON "identity_oauth_consent" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "identity_oauth_consent_user_id_idx" ON "identity_oauth_consent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "identity_oauth_refresh_token_client_id_idx" ON "identity_oauth_refresh_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "identity_oauth_refresh_token_session_id_idx" ON "identity_oauth_refresh_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "identity_oauth_refresh_token_user_id_idx" ON "identity_oauth_refresh_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "identity_oauth_refresh_token_authorization_code_id_idx" ON "identity_oauth_refresh_token" USING btree ("authorization_code_id");--> statement-breakpoint
-- L'app lit et écrit les tables OAuth et JWKS, sans droit sur leur schéma (ADR 0009 §3).
GRANT SELECT, INSERT, UPDATE, DELETE ON "identity_jwks", "identity_oauth_access_token", "identity_oauth_client", "identity_oauth_client_assertion", "identity_oauth_client_resource", "identity_oauth_consent", "identity_oauth_refresh_token", "identity_oauth_resource" TO app;
