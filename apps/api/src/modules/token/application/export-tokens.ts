import { err, ok, type Result } from "@repo/result";

import { type DtcgGroup, dtcgDocumentOf } from "../domain/dtcg-document.ts";
import { type GroupConflict, groupConflicts } from "../domain/token-name.ts";
import type { ProjectTokens } from "./read-tokens.ts";

export type ExportFailure = "not_found" | { readonly conflicts: readonly GroupConflict[] };

export const exportTokens =
  ({
    readProjectTokens,
  }: {
    readonly readProjectTokens: (input: {
      readonly projectId: string;
      readonly userId: string;
    }) => Promise<Result<ProjectTokens, "not_found">>;
  }) =>
  async (input: {
    readonly projectId: string;
    readonly userId: string;
  }): Promise<Result<DtcgGroup, ExportFailure>> => {
    const read = await readProjectTokens(input);
    if (!read.ok) {
      return read;
    }
    const conflicts = groupConflicts(read.value.tokens.map(({ name }) => name));
    if (conflicts.length > 0) {
      return err({ conflicts });
    }
    return ok(dtcgDocumentOf(read.value.tokens));
  };
