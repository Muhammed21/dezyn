import type { Role } from "./space.ts";

export type DepartureRefusal = "last_owner";

export const departureRefusal = ({
  role,
  openOwners,
}: {
  readonly role: Role;
  readonly openOwners: number;
}): DepartureRefusal | undefined =>
  role === "owner" && openOwners <= 1 ? "last_owner" : undefined;
