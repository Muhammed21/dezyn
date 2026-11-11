import { useQuery } from "@tanstack/react-query";
import { type AnyRootRoute, createRoute, Navigate } from "@tanstack/react-router";

import type { Result } from "@repo/result";

import type { SpacesFailure } from "../application/space-gateway.ts";
import type { Space } from "../domain/space.ts";

type ListMySpaces = () => Promise<Result<readonly Space[], SpacesFailure>>;

const MySpaces = ({ listMySpaces }: { readonly listMySpaces: ListMySpaces }) => {
  const { data } = useQuery({ queryKey: ["my-spaces"], queryFn: listMySpaces });
  if (data === undefined) {
    return <p>Chargement de vos espaces…</p>;
  }
  if (!data.ok) {
    return data.error === "unauthenticated" ? (
      <Navigate to="/connexion" />
    ) : (
      <p role="alert">Vos espaces sont indisponibles pour le moment.</p>
    );
  }
  return (
    <main>
      <h1>Vos espaces</h1>
      <ul aria-label="Vos espaces">
        {data.value.map((space) => (
          <li key={space.id}>{space.name}</li>
        ))}
      </ul>
    </main>
  );
};

export const mySpacesRoute = ({
  parent,
  listMySpaces,
}: {
  readonly parent: AnyRootRoute;
  readonly listMySpaces: ListMySpaces;
}) =>
  createRoute({
    getParentRoute: () => parent,
    path: "/",
    component: () => <MySpaces listMySpaces={listMySpaces} />,
  });
