import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import type { ProjectAccess } from "#modules/space/contracts/membership.ts";
import { err, ok, type Result } from "@repo/result";

import {
  candidateIssuePath,
  distinct,
  type ImportedResolver,
  type ImportIssue,
  readDocument,
  type ReadDocument,
  tokenIssuePath,
} from "../domain/dtcg-import.ts";
import { inCycle, referencesFirst } from "../domain/reference-order.ts";
import type { ProjectToken } from "../domain/reference.ts";
import type { ValidatedTokenFailure } from "../domain/token-check.ts";
import { groupConflict } from "../domain/token-name.ts";
import type { TokenDefinition } from "../domain/token.ts";
import type { PendingProposals } from "./add-token.ts";
import type { ModifierReader } from "./export-tokens.ts";
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

const parsedDocument = ({ candidates, issues }: ReadDocument, parse: ParseTokenDefinition) => {
  const parsed = candidates.map((imported) => ({
    imported,
    parsed: parse({ ...imported.candidate, name: imported.name }),
  }));
  return {
    count: candidates.length,
    definitions: parsed.flatMap(({ parsed: result }) =>
      "definition" in result ? [result.definition] : [],
    ),
    issues: distinct([
      ...issues,
      ...parsed.flatMap(({ imported, parsed: result }) =>
        "issues" in result
          ? result.issues.map(({ path, message }) => ({
              path: candidateIssuePath(imported, path),
              message,
            }))
          : [],
      ),
    ]),
  };
};

const sameModes = (first: readonly string[], second: readonly string[]) =>
  first.length === second.length && first.every((mode) => second.includes(mode));

const modesMismatch = (
  resolver: ImportedResolver | undefined,
  project: { readonly modifier: string | undefined; readonly modes: readonly string[] },
): readonly ImportIssue[] =>
  resolver === undefined ||
  resolver.modifier === undefined ||
  (resolver.modifier === project.modifier && sameModes(resolver.modes, project.modes))
    ? []
    : [{ path: "modifiers", message: "Modes différents de ceux du projet" }];

export const importTokens =
  ({
    access,
    modes,
    modifiers,
    projectTokens,
    unitOfWork,
    parseTokenDefinition,
    newId,
    now,
  }: {
    readonly access: ProjectAccess;
    readonly modes: ModeReader;
    readonly modifiers: ModifierReader;
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
    const read = readDocument(document);
    const { count, definitions, issues } = parsedDocument(read, parseTokenDefinition);
    if (count > MAX_TOKENS_PER_IMPORT) {
      return err(
        invalidDocument([
          { path: "tokens", message: `${MAX_TOKENS_PER_IMPORT} tokens au plus par import` },
        ]),
      );
    }
    const [projectModes, projectModifier, existing] = await Promise.all([
      modes.modesOf(projectId),
      modifiers.modifierOf(projectId),
      projectTokens.tokensOf(projectId),
    ]);
    if (read.resolver !== undefined && projectModifier === undefined) {
      return err(
        invalidDocument([
          { path: "modifiers", message: "Document Resolver dans un projet sans modes" },
        ]),
      );
    }
    const modesIssues = modesMismatch(read.resolver, {
      modifier: projectModifier,
      modes: projectModes.map(({ name }) => name),
    });
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
      if (modesIssues.length > 0 || issues.length > 0 || cycles.length > 0 || checks.length > 0) {
        return err(invalidDocument([...modesIssues, ...issues, ...cycles], checks));
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
