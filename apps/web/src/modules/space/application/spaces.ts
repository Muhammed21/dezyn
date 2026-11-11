import type { SpaceGateway } from "./space-gateway.ts";

export const spaceUseCases = ({ gateway }: { readonly gateway: SpaceGateway }) => ({
  listMySpaces: () => gateway.listMySpaces(),
});
