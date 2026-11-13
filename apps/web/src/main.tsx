import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createHistory } from "./modules/history/history-module.ts";
import { projectHistoryRoute } from "./modules/history/presentation/project-history-route.tsx";
import { createIdentity } from "./modules/identity/identity-module.ts";
import { signInRoute } from "./modules/identity/presentation/sign-in-route.tsx";
import { signUpRoute } from "./modules/identity/presentation/sign-up-route.tsx";
import { spaceProjectsRoute } from "./modules/project/presentation/space-projects-route.tsx";
import { createProjects } from "./modules/project/project-module.ts";
import { projectProposals } from "./modules/proposal/presentation/project-proposals.tsx";
import { proposalBatchRoute } from "./modules/proposal/presentation/proposal-batch-route.tsx";
import { createProposals } from "./modules/proposal/proposal-module.ts";
import { mySpacesRoute } from "./modules/space/presentation/my-spaces-route.tsx";
import { createSpaces } from "./modules/space/space-module.ts";
import {
  projectTokensRoute,
  refreshProjectTokens,
} from "./modules/token/presentation/project-tokens-route.tsx";
import { createTokens } from "./modules/token/token-module.ts";
import { configOf } from "./platform/config.ts";

const fetchFromBrowser = (url: string, init: RequestInit) => window.fetch(url, init);

const appRouter = ({
  apiUrl,
  queryClient,
}: {
  readonly apiUrl: string;
  readonly queryClient: QueryClient;
}) => {
  const identity = createIdentity({ apiUrl, fetch: fetchFromBrowser });
  const spaces = createSpaces({ apiUrl, fetch: fetchFromBrowser });
  const projects = createProjects({ apiUrl, fetch: fetchFromBrowser });
  const tokens = createTokens({ apiUrl, fetch: fetchFromBrowser });
  const projectHistory = createHistory({ apiUrl, fetch: fetchFromBrowser });
  const proposals = createProposals({ apiUrl, fetch: fetchFromBrowser });

  const root = createRootRoute();
  return createRouter({
    routeTree: root.addChildren([
      mySpacesRoute({
        parent: root,
        listMySpaces: spaces.listMySpaces,
        signOut: identity.signOut,
      }),
      signInRoute({ parent: root, signIn: identity.signIn }),
      signUpRoute({ parent: root, signUp: identity.signUp }),
      spaceProjectsRoute({
        parent: root,
        listProjects: projects.listProjects,
        createProject: projects.createProject,
        readSpace: spaces.readSpace,
      }),
      projectTokensRoute({
        parent: root,
        readTokens: tokens.readTokens,
        ProjectProposals: projectProposals({ listBatches: proposals.listBatches }),
      }),
      projectHistoryRoute({ parent: root, readHistory: projectHistory.readHistory }),
      proposalBatchRoute({
        parent: root,
        readBatch: proposals.readBatch,
        reviewProposal: proposals.reviewProposal,
        validateBatch: proposals.validateBatch,
        onReviewed: refreshProjectTokens(queryClient),
      }),
    ]),
  });
};

const config = configOf({
  env: import.meta.env,
  href: window.location.href,
  dev: import.meta.env.DEV,
});
const container = document.getElementById("root");
const queryClient = new QueryClient();

if (config.kind === "redirect") {
  window.location.replace(config.to);
} else if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      {config.kind === "ready" ? (
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={appRouter({ apiUrl: config.apiUrl, queryClient })} />
        </QueryClientProvider>
      ) : (
        <p role="alert">{config.message}</p>
      )}
    </StrictMode>,
  );
}
