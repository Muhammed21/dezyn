import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import type { ProjectAccess } from "#modules/space/contracts/membership.ts";
import { err, ok, type Result } from "@repo/result";

import { flattenDocument, type ImportIssue, tokenIssuePath } from "../domain/dtcg-import.ts";
import { inCycle, referencesFirst } from "../domain/reference-order.ts";
import type { ProjectToken } from "../domain/reference.ts";
import type { ValidatedTokenFailure } from "../domain/token-check.ts";
import { groupConflict } from "../domain/token-name.ts";
import type { TokenDefinition } from "../domain/token.ts";
import type { PendingProposals } from "./add-token.ts";
import {
  checkedValues,
  type ModeReader,
  modeValueOf,
  type ProjectTokenReader,
  type TokenWriter,
} from "./token-values.ts";

export const MAX_TOKENS_PER_IMPORT = 500;

export type ParseTokenDefinition = (
  candidate: Readonly<Record<string, unknown>>,
) => { readonly definition: TokenDefinition } | { readonly issues: readonly ImportIssue[] };

export type TokenImportUnit = {
  readonly tokens: TokenWriter;
  readonly history: HistoryWriter;
  readonly proposals: PendingProposals;
};

export interface TokenImportUnitOfWork {
  run<T, E>(work: (unit: TokenImportUnit) => Promise<Result<T, E>>): Promise<Result<T, E>>;
}

export type TokenCheckOfImport = {
  readonly name: string;
  readonly failure: ValidatedTokenFailure;
};

export type ImportFailure =
  | "not_found"
  | { readonly issues: readonly ImportIssue[]; readonly checks: readonly TokenCheckOfImport[] }
  | { readonly names: readonly string[] };

export type Imported = { readonly imported: number; readonly modes: readonly string[] };

const invalidDocument = (
  issues: readonly ImportIssue[],
  checks: readonly TokenCheckOfImport[] = [],
): ImportFailure => ({ issues, checks });

const parsedDocument = (
  document: Readonly<Record<string, unknown>>,
  parse: ParseTokenDefinition,
) => {
  const { candidates, issues } = flattenDocument(document);
  const parsed = candidates.map(({ name, candidate }) => ({
    name,
    parsed: parse({ ...candidate, name }),
  }));
  return {
    count: candidates.length,
    definitions: parsed.flatMap(({ parsed: result }) =>
      "definition" in result ? [result.definition] : [],
    ),
    issues: [
      ...issues,
      ...parsed.flatMap(({ name, parsed: result }) =>
        "issues" in result
          ? result.issues.map(({ path, message }) => ({
              path: tokenIssuePath(name, path),
              message,
            }))
          : [],
      ),
    ],
  };
};

export const importTokens =
  ({
    access,
    modes,
    projectTokens,
    unitOfWork,
    parseTokenDefinition,
    newId,
    now,
  }: {
    readonly access: ProjectAccess;
    readonly modes: ModeReader;
    readonly projectTokens: ProjectTokenReader;
    readonly unitOfWork: TokenImportUnitOfWork;
    readonly parseTokenDefinition: ParseTokenDefinition;
    readonly newId: () => string;
    readonly now: () => Date;
  }) =>
  async ({
    projectId,
    userId,
    document,
    correlationId,
  }: {
    readonly projectId: string;
    readonly userId: string;
    readonly document: Readonly<Record<string, unknown>>;
    readonly correlationId: string;
  }): Promise<Result<Imported, ImportFailure>> => {
    const project = await access({ projectId, userId, action: "token.create" });
    if (project === undefined) {
      return err("not_found");
    }
    const { count, definitions, issues } = parsedDocument(document, parseTokenDefinition);
    if (count > MAX_TOKENS_PER_IMPORT) {
      return err(
        invalidDocument([
          { path: "tokens", message: `${MAX_TOKENS_PER_IMPORT} tokens au plus par import` },
        ]),
      );
    }
    const [projectModes, existing] = await Promise.all([
      modes.modesOf(projectId),
      projectTokens.tokensOf(projectId),
    ]);
    const createdAt = now();
    const ordered = referencesFirst(definitions, (token) => token).map((token) => ({
      token,
      id: newId(),
    }));
    const placed: readonly ProjectToken[] = [
      ...existing,
      ...ordered.map(({ token, id }) => ({
        id,
        name: token.name,
        $type: token.$type,
        status: "validated",
      })),
    ];
    return unitOfWork.run(async ({ tokens, history, proposals }) => {
      const pendingNames = await proposals.pendingNamesOf(projectId);
      const otherNames = [
        ...existing.map(({ name }) => name),
        ...pendingNames,
        ...definitions.map(({ name }) => name),
      ];
      const checked = ordered.map(({ token, id }) => {
        const other = groupConflict(token.name, otherNames);
        const conflict: ValidatedTokenFailure | undefined =
          other === undefined ? undefined : { code: "name_conflict", other };
        return {
          token,
          id,
          conflict,
          values: checkedValues(token, {
            projectModes,
            tokens: placed.filter((candidate) => candidate.id !== id),
          }),
        };
      });
      const checks = checked.flatMap(
        ({ token, conflict, values }): readonly TokenCheckOfImport[] => [
          ...(conflict === undefined ? [] : [{ name: token.name, failure: conflict }]),
          ...(values.ok ? [] : [{ name: token.name, failure: values.error }]),
        ],
      );
      const cycles = inCycle(definitions, (token) => token).map(({ name }) => ({
        path: tokenIssuePath(name, "$value"),
        message: "Référence circulaire",
      }));
      if (issues.length > 0 || cycles.length > 0 || checks.length > 0) {
        return err(invalidDocument([...issues, ...cycles], checks));
      }
      const taken = definitions
        .filter(({ name }) => existing.some((token) => token.name === name))
        .map(({ name }) => name);
      if (taken.length > 0) {
        return err({ names: taken });
      }
      const writable = checked.flatMap(({ token, id, values }) =>
        values.ok ? [{ token, id, values: values.value }] : [],
      );
      const written = await writable.reduce<Promise<Result<number, ImportFailure>>>(
        async (previous, { token, id, values }) => {
          const before = await previous;
          if (!before.ok) {
            return before;
          }
          const created = await tokens.create(
            { ...token, id, projectId, status: "validated", createdAt },
            values.map(modeValueOf),
          );
          if (created === "name_taken") {
            return err({ names: [token.name] });
          }
          const replaced = await proposals.replace({ projectId, name: token.name });
          await history.append({
            spaceId: project.spaceId,
            projectId,
            action: "token.created",
            userId,
            clientId: null,
            before: null,
            after: { ...token, replaced },
            correlationId,
            occurredAt: createdAt,
          });
          return ok(before.value + 1);
        },
        Promise.resolve(ok(0)),
      );
      return written.ok
        ? ok({ imported: written.value, modes: projectModes.map(({ name }) => name) })
        : written;
    });
  };
