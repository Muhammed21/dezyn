import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createIdentity } from "./modules/identity/identity-module.ts";
import { signInRoute } from "./modules/identity/presentation/sign-in-route.tsx";
import { mySpacesRoute } from "./modules/space/presentation/my-spaces-route.tsx";
import { createSpaces } from "./modules/space/space-module.ts";

const apiUrl = import.meta.env.VITE_API_URL;
const fetchFromBrowser = (url: string, init: RequestInit) => window.fetch(url, init);

const identity = createIdentity({ apiUrl, fetch: fetchFromBrowser });
const spaces = createSpaces({ apiUrl, fetch: fetchFromBrowser });

const root = createRootRoute();
const router = createRouter({
  routeTree: root.addChildren([
    mySpacesRoute({ parent: root, listMySpaces: spaces.listMySpaces }),
    signInRoute({ parent: root, signIn: identity.signIn }),
  ]),
});

const container = document.getElementById("root");

if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
