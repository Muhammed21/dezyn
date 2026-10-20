import { Hono } from "hono";

import type { HistoryUseCases } from "#modules/history/application/history-use-cases.ts";
import { historyRoutes } from "#modules/history/presentation/history-routes.ts";
import { registerReadHistory } from "#modules/history/presentation/read-history-tool.ts";
import type { Auth } from "#modules/identity/application/auth.ts";
import { authPages } from "#modules/identity/presentation/auth-pages.ts";
import { registerWhoami } from "#modules/identity/presentation/whoami-tool.ts";
import type { ProjectUseCases } from "#modules/project/application/project-use-cases.ts";
import { registerListProjects } from "#modules/project/presentation/list-projects-tool.ts";
import { projectsRoutes } from "#modules/project/presentation/projects-routes.ts";
import type { ProposalUseCases } from "#modules/proposal/application/proposal-use-cases.ts";
import { registerProposalBatchTools } from "#modules/proposal/presentation/proposal-batch-tools.ts";
import {
  projectBatchesRoutes,
  reviewRoutes,
} from "#modules/proposal/presentation/review-routes.ts";
import { registerWriteTokens } from "#modules/proposal/presentation/write-tokens-tool.ts";
import type { SpaceUseCases } from "#modules/space/application/spaces.ts";
import { invitationsRoutes } from "#modules/space/presentation/invitations-routes.ts";
import { registerListSpaces } from "#modules/space/presentation/list-spaces-tool.ts";
import { spacesRoutes } from "#modules/space/presentation/spaces-routes.ts";
import type { TokenUseCases } from "#modules/token/application/token-use-cases.ts";
import { registerDeclareFigmaStates } from "#modules/token/presentation/declare-figma-states-tool.ts";
import { registerReadTokens } from "#modules/token/presentation/read-tokens-tool.ts";
import { tokensRoutes } from "#modules/token/presentation/tokens-routes.ts";
import { type AuthenticatedEnv, requireAccessToken } from "#platform/access-token.ts";
import type { Database } from "#platform/database.ts";
import type { AppEnv } from "#platform/http.ts";
import { errorDetails, type LogSink } from "#platform/logging.ts";
import { mcpEndpoint } from "#platform/mcp.ts";
import { clientProblem, INTERNAL_ERROR, problemResponse } from "#platform/problem.ts";
import { requestContext } from "#platform/request-context.ts";

export const createApp = ({
  db,
  auth,
  log,
  spaces,
  projects,
  history,
  tokens,
  proposals,
}: {
  readonly db: Database;
  readonly auth: Auth;
  readonly log: LogSink;
  readonly spaces: SpaceUseCases;
  readonly projects: ProjectUseCases;
  readonly history: HistoryUseCases;
  readonly tokens: TokenUseCases;
  readonly proposals: ProposalUseCases;
}) => {
  const app = new Hono<AppEnv>();

  app.use(requestContext(log));

  app.on(["GET", "POST"], "/auth/*", (c) => auth.handle(c.req.raw));
  app.route("/", authPages({ auth, baseURL: auth.baseURL }));
  const v1 = new Hono<AuthenticatedEnv>().use(
    requireAccessToken({
      verifyAccessToken: auth.verifyAccessToken,
      resourceMetadataUrl: new URL("/.well-known/oauth-protected-resource/v1", auth.baseURL).href,
    }),
  );
  const registerSpaceTools = registerListSpaces(spaces);
  const registerProjectTools = registerListProjects(projects);
  const registerHistoryTools = registerReadHistory(history);
  const registerTokenTools = registerReadTokens({
    readTokens: tokens.readTokens,
    pendingProposalsOf: proposals.pendingProposalsOf,
    recordProjectCall: history.recordProjectCall,
  });
  const registerFigmaTools = registerDeclareFigmaStates({
    declareFigmaStates: tokens.declareFigmaStates,
    recordProjectCall: history.recordProjectCall,
  });
  const registerProposalTools = registerWriteTokens({
    writeTokens: proposals.writeTokens,
    recordProjectCall: history.recordProjectCall,
  });
  const registerBatchTools = registerProposalBatchTools({
    openBatch: proposals.openBatch,
    closeBatch: proposals.closeBatch,
    recordProjectCall: history.recordProjectCall,
  });
  v1.post(
    "/mcp",
    mcpEndpoint({
      registerTools: (server, call) => {
        registerWhoami(server, call);
        registerSpaceTools(server, call);
        registerProjectTools(server, call);
        registerHistoryTools(server, call);
        registerTokenTools(server, call);
        registerFigmaTools(server, call);
        registerProposalTools(server, call);
        registerBatchTools(server, call);
      },
    }),
  );
  v1.route("/spaces", spacesRoutes(spaces));
  v1.route("/spaces", projectsRoutes(projects));
  v1.route("/projects", historyRoutes(history));
  v1.route("/projects", tokensRoutes(tokens));
  v1.route("/projects", projectBatchesRoutes(proposals));
  v1.route("/", reviewRoutes(proposals));
  v1.route("/invitations", invitationsRoutes(spaces));
  app.route("/v1", v1);
  app.get("/.well-known/oauth-authorization-server", (c) =>
    auth.authorizationServerMetadata(c.req.raw),
  );
  app.get("/.well-known/oauth-authorization-server/auth", (c) =>
    auth.authorizationServerMetadata(c.req.raw),
  );
  app.get("/.well-known/oauth-protected-resource", (c) =>
    auth.protectedResourceMetadata(c.req.raw),
  );
  app.get("/.well-known/oauth-protected-resource/v1", (c) =>
    auth.protectedResourceMetadata(c.req.raw),
  );

  app.get("/health", async (c) => {
    try {
      await db.ping();
    } catch {
      return problemResponse(c, {
        type: "about:blank",
        title: "Service indisponible",
        status: 503,
      });
    }
    return c.json({ status: "ok" });
  });

  app.notFound((c) =>
    problemResponse(c, { type: "about:blank", title: "Ressource introuvable", status: 404 }),
  );

  app.onError((error, c) => {
    const problem = clientProblem(error);
    if (problem !== undefined) {
      return problemResponse(c, problem);
    }
    log({
      level: "error",
      msg: "unhandled",
      correlationId: c.get("correlationId"),
      ...errorDetails(error),
    });
    return problemResponse(c, INTERNAL_ERROR);
  });

  return app;
};
