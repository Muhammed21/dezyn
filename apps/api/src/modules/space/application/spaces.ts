import { type MySpace, type PersonalSpace, personalSpaceOf } from "../domain/space.ts";

export interface SpaceStore {
  createPersonal(personal: PersonalSpace): Promise<void>;
  listOpenMembershipsOf(userId: string): Promise<readonly MySpace[]>;
}

export const createPersonalSpace =
  ({
    store,
    newId,
    now,
  }: {
    readonly store: SpaceStore;
    readonly newId: () => string;
    readonly now: () => Date;
  }) =>
  (user: { readonly id: string; readonly name: string }) =>
    store.createPersonal(
      personalSpaceOf({ user, ids: { space: newId(), member: newId() }, now: now() }),
    );

export const listMySpaces =
  ({ store }: { readonly store: SpaceStore }) =>
  (userId: string) =>
    store.listOpenMembershipsOf(userId);
