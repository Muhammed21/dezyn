import type { ProjectAccess } from "#modules/space/contracts/membership.ts";
import { err, ok, type Result } from "@repo/result";

import { type DtcgGroup, dtcgDocumentOf, resolverDocumentOf } from "../domain/dtcg-document.ts";
import { type GroupConflict, groupConflicts } from "../domain/token-name.ts";
import type { readValidatedTokens } from "./read-tokens.ts";

export interface ModifierReader {
  modifierOf(projectId: string): Promise<string | undefined>;
}

export type ExportFailure = "not_found" | { readonly conflicts: readonly GroupConflict[] };

export const exportTokens =
  ({
    access,
    modifiers,
    readValidatedTokens: read,
  }: {
    readonly access: ProjectAccess;
    readonly modifiers: ModifierReader;
    readonly readValidatedTokens: ReturnType<typeof readValidatedTokens>;
  }) =>
  async ({
    projectId,
    userId,
  }: {
    readonly projectId: string;
    readonly userId: string;
  }): Promise<Result<DtcgGroup, ExportFailure>> => {
    const project = await access({ projectId, userId, action: "space.read" });
    if (project === undefined) {
      return err("not_found");
    }
    const [{ modes, tokens }, modifier] = await Promise.all([
      read(projectId),
      modifiers.modifierOf(projectId),
    ]);
    const conflicts = groupConflicts(tokens.map(({ name }) => name));
    if (conflicts.length > 0) {
      return err({ conflicts });
    }
    return ok(
      modifier === undefined
        ? dtcgDocumentOf(tokens)
        : resolverDocumentOf({ modifier, modes, tokens }),
    );
  };
