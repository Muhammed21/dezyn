import type { ProjectFinder } from "#modules/project/contracts/project.ts";
import { can, type MembershipReader } from "#modules/space/contracts/membership.ts";
import { err, ok, type Result } from "@repo/result";

import {
  checkFigmaDeclaration,
  type DeclaredState,
  type FigmaEntry,
  type FigmaRefusal,
} from "../domain/figma-declaration.ts";
import { type ComparedDefinition, sameDefinition } from "../domain/same-definition.ts";
import type { CheckTokens, TokenCheckFailure } from "../domain/token-check.ts";
import type { TokenDefinition } from "../domain/token.ts";
import type { ProjectTokenReader } from "./add-token.ts";
import type { ReadToken } from "./read-tokens.ts";

export type FigmaDeclaration = {
  readonly states: readonly (DeclaredState & { readonly proposalId: string | null })[];
  readonly declaredAt: Date;
  readonly userId: string;
  readonly clientId: string;
};

export interface FigmaStateWriter {
  declare(declaration: FigmaDeclaration): Promise<void>;
}

export type FigmaProposal = {
  readonly id: string;
  readonly batch: { readonly id: string; readonly state: string };
};

export interface FigmaProposals {
  propose(proposed: {
    readonly projectId: string;
    readonly userId: string;
    readonly clientId: string;
    readonly tokens: readonly TokenDefinition[];
    readonly validated: readonly ReadToken[];
    readonly createdAt: Date;
  }): Promise<{
    readonly batch: { readonly id: string; readonly state: string } | null;
    readonly proposals: readonly { readonly id: string; readonly name: string }[];
  }>;
}

export type RejectedValue = Omit<ComparedDefinition, "$description">;

export interface RejectedValueReader {
  rejectedValuesOf(
    projectId: string,
  ): Promise<readonly { readonly tokenId: string; readonly rejected: RejectedValue }[]>;
}

export interface FigmaUnitOfWork {
  run<T>(
    work: (unit: {
      readonly figmaStates: FigmaStateWriter;
      readonly proposals: FigmaProposals;
    }) => Promise<T>,
  ): Promise<T>;
}

export type FigmaValueIssue = { readonly path: string; readonly message: string };

export type ParseFigmaValue = (
  candidate: Readonly<Record<string, unknown>>,
) => { readonly definition: TokenDefinition } | { readonly issues: readonly FigmaValueIssue[] };

type DeclaredOutput =
  | { readonly name: string; readonly state: "synced" | "missing_in_figma" }
  | {
      readonly name: string;
      readonly state: "duplicate_in_figma";
      readonly figmaVariables: readonly string[];
    };

export type DeclaredFigmaStates = {
  readonly states: readonly (
    | (DeclaredOutput & { readonly declaredAt: Date })
    | {
        readonly name: string;
        readonly state: "diverged";
        readonly declaredAt: Date;
        readonly proposal: FigmaProposal | null;
      }
  )[];
};

export type FigmaValueFailure =
  | { readonly kind: "malformed"; readonly issues: readonly FigmaValueIssue[] }
  | { readonly kind: "unchecked"; readonly check: TokenCheckFailure }
  | { readonly kind: "same_as_validated" };

export type InvalidDeclaration =
  | {
      readonly code: "invalid_declaration";
      readonly refusals: readonly { readonly index: number; readonly refusal: FigmaRefusal }[];
    }
  | {
      readonly code: "invalid_figma_values";
      readonly failures: readonly { readonly index: number; readonly failure: FigmaValueFailure }[];
    };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type Divergence = {
  readonly index: number;
  readonly tokenId: string;
  readonly validated: ReadToken | undefined;
  readonly parsed: ReturnType<ParseFigmaValue>;
};

const divergencesOf = (
  states: readonly DeclaredState[],
  {
    tokens,
    validated,
    parseFigmaValue,
  }: {
    readonly tokens: readonly { readonly id: string; readonly $type: string }[];
    readonly validated: readonly ReadToken[];
    readonly parseFigmaValue: ParseFigmaValue;
  },
): readonly Divergence[] =>
  states.flatMap((declared, index) => {
    if (declared.state !== "diverged") {
      return [];
    }
    const token = tokens.find(({ id }) => id === declared.tokenId);
    const current = validated.find(({ id }) => id === declared.tokenId);
    const parsed: ReturnType<ParseFigmaValue> = isRecord(declared.figmaValue)
      ? parseFigmaValue({
          ...declared.figmaValue,
          name: declared.name,
          $type: token?.$type,
          ...(current?.$description === undefined ? {} : { $description: current.$description }),
        })
      : { issues: [{ path: "", message: "Objet attendu, avec $value ou modes" }] };
    return [{ index, tokenId: declared.tokenId, validated: current, parsed }];
  });

export const declareFigmaStates =
  ({
    projects,
    memberships,
    projectTokens,
    validatedTokensOf,
    rejectedValues,
    parseFigmaValue,
    checkTokens,
    unitOfWork,
    now,
  }: {
    readonly projects: ProjectFinder;
    readonly memberships: MembershipReader;
    readonly projectTokens: ProjectTokenReader;
    readonly validatedTokensOf: (projectId: string) => Promise<readonly ReadToken[]>;
    readonly rejectedValues: RejectedValueReader;
    readonly parseFigmaValue: ParseFigmaValue;
    readonly checkTokens: CheckTokens;
    readonly unitOfWork: FigmaUnitOfWork;
    readonly now: () => Date;
  }) =>
  async ({
    projectId,
    userId,
    clientId,
    entries,
  }: {
    readonly projectId: string;
    readonly userId: string;
    readonly clientId: string;
    readonly entries: readonly FigmaEntry[];
  }): Promise<Result<DeclaredFigmaStates, "not_found" | InvalidDeclaration>> => {
    const project = await projects.find(projectId);
    if (project === undefined) {
      return err("not_found");
    }
    const membership = await memberships.activeMembership({ spaceId: project.spaceId, userId });
    if (!can({ membership, action: "token.declareFigmaState" })) {
      return err("not_found");
    }
    const tokens = (await projectTokens.tokensOf(projectId)).filter(
      ({ status }) => status === "validated",
    );
    const checked = checkFigmaDeclaration({ entries, tokens });
    if ("refusals" in checked) {
      return err({ code: "invalid_declaration", refusals: checked.refusals });
    }
    const validated = await validatedTokensOf(projectId);
    const divergences = divergencesOf(checked.states, { tokens, validated, parseFigmaValue });
    const parsedDivergences = divergences.flatMap(({ parsed, ...divergence }) =>
      "definition" in parsed ? [{ ...divergence, definition: parsed.definition }] : [],
    );
    const tokenChecks = await checkTokens({
      projectId,
      tokens: parsedDivergences.map(({ definition }) => definition),
    });
    const failures = [
      ...divergences.flatMap(({ index, parsed }) =>
        "issues" in parsed
          ? [
              {
                index,
                failure: { kind: "malformed", issues: parsed.issues } satisfies FigmaValueFailure,
              },
            ]
          : [],
      ),
      ...tokenChecks.flatMap(({ index, failure }) => {
        const divergence = parsedDivergences[index];
        return divergence === undefined
          ? []
          : [
              {
                index: divergence.index,
                failure: { kind: "unchecked", check: failure } satisfies FigmaValueFailure,
              },
            ];
      }),
      ...parsedDivergences.flatMap(({ index, validated: current, definition }) =>
        current !== undefined && sameDefinition(current, definition)
          ? [{ index, failure: { kind: "same_as_validated" } satisfies FigmaValueFailure }]
          : [],
      ),
    ].toSorted((left, right) => left.index - right.index);
    if (failures.length > 0) {
      return err({ code: "invalid_figma_values", failures });
    }
    const rejected = await rejectedValues.rejectedValuesOf(projectId);
    const proposable = parsedDivergences.filter(({ tokenId, definition }) => {
      const last = rejected.find((candidate) => candidate.tokenId === tokenId);
      return (
        last === undefined ||
        !sameDefinition(last.rejected, { $value: definition.$value, modes: definition.modes })
      );
    });
    const declaredAt = now();
    const proposed = await unitOfWork.run(async ({ figmaStates, proposals }) => {
      const written =
        proposable.length === 0
          ? { batch: null, proposals: [] }
          : await proposals.propose({
              projectId,
              userId,
              clientId,
              tokens: proposable.map(({ definition }) => definition),
              validated,
              createdAt: declaredAt,
            });
      await figmaStates.declare({
        states: checked.states.map((declared) => ({
          ...declared,
          proposalId: written.proposals.find(({ name }) => name === declared.name)?.id ?? null,
        })),
        declaredAt,
        userId,
        clientId,
      });
      return written;
    });
    const proposalOf = (name: string): FigmaProposal | null => {
      const found = proposed.proposals.find((proposal) => proposal.name === name);
      return found === undefined || proposed.batch === null
        ? null
        : { id: found.id, batch: { id: proposed.batch.id, state: proposed.batch.state } };
    };
    return ok({
      states: checked.states.map((declared) => {
        if (declared.state === "diverged") {
          return {
            name: declared.name,
            state: declared.state,
            declaredAt,
            proposal: proposalOf(declared.name),
          };
        }
        const { tokenId: _, ...kept } = declared;
        return { ...kept, declaredAt };
      }),
    });
  };
