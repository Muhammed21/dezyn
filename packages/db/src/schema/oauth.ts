import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { identitySession, identityUser } from "./identity.ts";

const at = (name: string) => timestamp(name, { withTimezone: true });

export const identityJwks = pgTable("identity_jwks", {
  id: uuid("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: at("created_at").notNull(),
  expiresAt: at("expires_at"),
  alg: text("alg"),
  crv: text("crv"),
});

export const identityOAuthClient = pgTable(
  "identity_oauth_client",
  {
    id: uuid("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    clientCredentialsScopes: text("client_credentials_scopes").array().default([]),
    userId: uuid("user_id").references(() => identityUser.id),
    createdAt: at("created_at"),
    updatedAt: at("updated_at"),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    requirePKCE: boolean("require_pkce"),
    dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata"),
  },
  (table) => [index("identity_oauth_client_user_id_idx").on(table.userId)],
);

export const identityOAuthResource = pgTable("identity_oauth_resource", {
  id: uuid("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes").array(),
  customClaims: jsonb("custom_claims"),
  dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
  disabled: boolean("disabled").default(false),
  createdAt: at("created_at"),
  updatedAt: at("updated_at"),
  policyVersion: integer("policy_version").default(1),
  metadata: jsonb("metadata"),
});

export const identityOAuthClientResource = pgTable(
  "identity_oauth_client_resource",
  {
    id: uuid("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => identityOAuthClient.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => identityOAuthResource.identifier, { onDelete: "cascade" }),
    metadata: jsonb("metadata"),
    createdAt: at("created_at"),
  },
  (table) => [
    index("identity_oauth_client_resource_client_id_idx").on(table.clientId),
    index("identity_oauth_client_resource_resource_id_idx").on(table.resourceId),
  ],
);

export const identityOAuthRefreshToken = pgTable(
  "identity_oauth_refresh_token",
  {
    id: uuid("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => identityOAuthClient.clientId),
    sessionId: uuid("session_id").references(() => identitySession.id, { onDelete: "set null" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => identityUser.id),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    expiresAt: at("expires_at").notNull(),
    createdAt: at("created_at").notNull(),
    revoked: at("revoked"),
    rotatedAt: at("rotated_at"),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: at("rotation_replay_expires_at"),
    authTime: at("auth_time"),
    confirmation: jsonb("confirmation"),
    scopes: text("scopes").array().notNull(),
  },
  (table) => [
    index("identity_oauth_refresh_token_client_id_idx").on(table.clientId),
    index("identity_oauth_refresh_token_session_id_idx").on(table.sessionId),
    index("identity_oauth_refresh_token_user_id_idx").on(table.userId),
    index("identity_oauth_refresh_token_authorization_code_id_idx").on(table.authorizationCodeId),
  ],
);

export const identityOAuthAccessToken = pgTable(
  "identity_oauth_access_token",
  {
    id: uuid("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => identityOAuthClient.clientId),
    sessionId: uuid("session_id").references(() => identitySession.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => identityUser.id),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    refreshId: uuid("refresh_id").references(() => identityOAuthRefreshToken.id),
    expiresAt: at("expires_at").notNull(),
    createdAt: at("created_at").notNull(),
    revoked: at("revoked"),
    confirmation: jsonb("confirmation"),
    scopes: text("scopes").array().notNull(),
  },
  (table) => [
    index("identity_oauth_access_token_client_id_idx").on(table.clientId),
    index("identity_oauth_access_token_session_id_idx").on(table.sessionId),
    index("identity_oauth_access_token_user_id_idx").on(table.userId),
    index("identity_oauth_access_token_authorization_code_id_idx").on(table.authorizationCodeId),
    index("identity_oauth_access_token_refresh_id_idx").on(table.refreshId),
  ],
);

export const identityOAuthConsent = pgTable(
  "identity_oauth_consent",
  {
    id: uuid("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => identityOAuthClient.clientId),
    userId: uuid("user_id").references(() => identityUser.id),
    referenceId: text("reference_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    scopes: text("scopes").array().notNull(),
    createdAt: at("created_at").notNull(),
    updatedAt: at("updated_at").notNull(),
  },
  (table) => [
    index("identity_oauth_consent_client_id_idx").on(table.clientId),
    index("identity_oauth_consent_user_id_idx").on(table.userId),
  ],
);

export const identityOAuthClientAssertion = pgTable("identity_oauth_client_assertion", {
  id: uuid("id").primaryKey(),
  expiresAt: at("expires_at").notNull(),
});
