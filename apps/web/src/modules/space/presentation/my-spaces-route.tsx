import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type AnyRootRoute,
  createRoute,
  Link,
  Navigate,
  useNavigate,
} from "@tanstack/react-router";

import type { Result } from "@repo/result";

import type { SpacesFailure } from "../application/space-gateway.ts";
import type { Space } from "../domain/space.ts";

type ListMySpaces = () => Promise<Result<readonly Space[], SpacesFailure>>;
type SignOut = () => Promise<Result<undefined, unknown>>;

const SignOutButton = ({ signOut }: { readonly signOut: SignOut }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isPending, mutate } = useMutation({
    mutationFn: signOut,
    onSuccess: async (result) => {
      if (result.ok) {
        await navigate({ to: "/connexion" });
        queryClient.removeQueries();
      }
    },
  });
  return (
    <>
      <button type="button" disabled={isPending} onClick={() => mutate()}>
        Se déconnecter
      </button>
      {!isPending && data?.ok === false && (
        <p role="alert">La déconnexion est impossible pour le moment.</p>
      )}
    </>
  );
};

const MySpaces = ({
  listMySpaces,
  signOut,
}: {
  readonly listMySpaces: ListMySpaces;
  readonly signOut: SignOut;
}) => {
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
          <li key={space.id}>
            <Link to="/espaces/$spaceId" params={{ spaceId: space.id }}>
              {space.name}
            </Link>
          </li>
        ))}
      </ul>
      <SignOutButton signOut={signOut} />
    </main>
  );
};

export const mySpacesRoute = ({
  parent,
  listMySpaces,
  signOut,
}: {
  readonly parent: AnyRootRoute;
  readonly listMySpaces: ListMySpaces;
  readonly signOut: SignOut;
}) =>
  createRoute({
    getParentRoute: () => parent,
    path: "/",
    component: () => <MySpaces listMySpaces={listMySpaces} signOut={signOut} />,
  });
