import type { ProjectFinder } from "#modules/project/contracts/project.ts";
import { can, type MembershipReader } from "#modules/space/contracts/membership.ts";
import { err, ok, type Result } from "@repo/result";

import type { FigmaState } from "../domain/figma-declaration.ts";
import type { ModeReader } from "./add-token.ts";

export type StoredValue = {
  readonly tokenId: string;
  readonly name: string;
  readonly $type: string;
  readonly $description: string | null;
  readonly mode: string | null;
  readonly value: unknown;
  readonly referencedName: string | null;
};

export interface ValidatedTokenReader {
  validatedValuesOf(projectId: string): Promise<readonly StoredValue[]>;
}

export type TokenFigmaState = {
  readonly tokenId: string;
  readonly state: FigmaState;
  readonly figmaVariables?: readonly string[];
  readonly declaredAt: Date;
  readonly author: { readonly kind: "member"; readonly userId: string; readonly name: string };
  readonly clientId: string;
};

export interface FigmaStateReader {
  figmaStatesOf(projectId: string): Promise<readonly TokenFigmaState[]>;
}

export type ReadToken = {
  readonly id: string;
  readonly name: string;
  readonly $type: string;
  readonly $value?: unknown;
  readonly modes?: Readonly<Record<string, unknown>>;
  readonly $description?: string;
  readonly status: "validated";
  readonly figma?: Omit<TokenFigmaState, "tokenId">;
};

export type ProjectTokens = {
  readonly modes: readonly string[];
  readonly tokens: readonly ReadToken[];
};

const renderedValue = ({ value, referencedName }: StoredValue): unknown =>
  referencedName === null ? value : `{${referencedName}}`;

type TokenValues = readonly [StoredValue, ...StoredValue[]];

const figmaOf = (
  tokenId: string,
  figmaStates: readonly TokenFigmaState[],
): Pick<ReadToken, "figma"> => {
  const found = figmaStates.find((figma) => figma.tokenId === tokenId);
  if (found === undefined) {
    return {};
  }
  const { tokenId: _, ...figma } = found;
  return { figma };
};

const tokenOf = (values: TokenValues, figmaStates: readonly TokenFigmaState[]): ReadToken => {
  const { tokenId, name, $type, $description, mode } = values[0];
  return {
    id: tokenId,
    name,
    $type,
    ...(mode === null
      ? { $value: renderedValue(values[0]) }
      : { modes: Object.fromEntries(values.map((value) => [value.mode, renderedValue(value)])) }),
    ...($description === null ? {} : { $description }),
    status: "validated",
    ...figmaOf(tokenId, figmaStates),
  };
};

const byToken = (values: readonly StoredValue[]): readonly TokenValues[] =>
  values.reduce<readonly TokenValues[]>((groups, value) => {
    const last = groups.at(-1);
    return last?.[0].tokenId === value.tokenId
      ? [...groups.slice(0, -1), [...last, value]]
      : [...groups, [value]];
  }, []);

export const readTokens =
  ({
    modes,
    tokens,
    figmaStates,
  }: {
    readonly modes: ModeReader;
    readonly tokens: ValidatedTokenReader;
    readonly figmaStates: FigmaStateReader;
  }) =>
  async (projectId: string): Promise<ProjectTokens> => {
    const [projectModes, values, figma] = await Promise.all([
      modes.modesOf(projectId),
      tokens.validatedValuesOf(projectId),
      figmaStates.figmaStatesOf(projectId),
    ]);
    return {
      modes: projectModes.map(({ name }) => name),
      tokens: byToken(values).map((value) => tokenOf(value, figma)),
    };
  };

export const readProjectTokens =
  ({
    projects,
    memberships,
    readTokens: read,
  }: {
    readonly projects: ProjectFinder;
    readonly memberships: MembershipReader;
    readonly readTokens: (projectId: string) => Promise<ProjectTokens>;
  }) =>
  async ({
    projectId,
    userId,
  }: {
    readonly projectId: string;
    readonly userId: string;
  }): Promise<Result<ProjectTokens, "not_found">> => {
    const project = await projects.find(projectId);
    if (project === undefined) {
      return err("not_found");
    }
    const membership = await memberships.activeMembership({ spaceId: project.spaceId, userId });
    if (!can({ membership, action: "space.read" })) {
      return err("not_found");
    }
    return ok(await read(projectId));
  };
