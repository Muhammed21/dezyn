import { type DepartureRefusal, departureRefusal } from "./departure.ts";
import type { Role } from "./space.ts";

export type RemovalRefusal = "self_removal";

export const roleChangeRefusal = ({
  current,
  next,
  openOwners,
}: {
  readonly current: Role;
  readonly next: Role;
  readonly openOwners: number;
}): DepartureRefusal | undefined =>
  next === "editor" ? departureRefusal({ role: current, openOwners }) : undefined;

export const removalRefusal = ({
  actorId,
  targetId,
}: {
  readonly actorId: string;
  readonly targetId: string;
}): RemovalRefusal | undefined => (actorId === targetId ? "self_removal" : undefined);
