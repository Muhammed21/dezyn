import type { ProjectFinder } from "#modules/project/contracts/project.ts";
import { can, type MembershipReader } from "#modules/space/contracts/membership.ts";
import { err, ok, type Result } from "@repo/result";

import {
  checkFigmaDeclaration,
  type DeclaredState,
  type FigmaEntry,
  type FigmaRefusal,
} from "../domain/figma-declaration.ts";
import type { ProjectTokenReader } from "./add-token.ts";

export type FigmaDeclaration = {
  readonly states: readonly DeclaredState[];
  readonly declaredAt: Date;
  readonly userId: string;
  readonly clientId: string;
};

export interface FigmaStateWriter {
  declare(declaration: FigmaDeclaration): Promise<void>;
}

export type DeclaredFigmaStates = {
  readonly states: readonly (Omit<DeclaredState, "tokenId"> & { readonly declaredAt: Date })[];
};

export type InvalidDeclaration = {
  readonly code: "invalid_declaration";
  readonly refusals: readonly { readonly index: number; readonly refusal: FigmaRefusal }[];
};

export const declareFigmaStates =
  ({
    projects,
    memberships,
    projectTokens,
    figmaStates,
    now,
  }: {
    readonly projects: ProjectFinder;
    readonly memberships: MembershipReader;
    readonly projectTokens: ProjectTokenReader;
    readonly figmaStates: FigmaStateWriter;
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
    const tokens = await projectTokens.tokensOf(projectId);
    const checked = checkFigmaDeclaration({
      entries,
      tokens: tokens.filter(({ status }) => status === "validated"),
    });
    if ("refusals" in checked) {
      return err({ code: "invalid_declaration", refusals: checked.refusals });
    }
    const declaredAt = now();
    await figmaStates.declare({ states: checked.states, declaredAt, userId, clientId });
    return ok({
      states: checked.states.map((state) => {
        const { tokenId: _, ...declared } = state;
        return { ...declared, declaredAt };
      }),
    });
  };
