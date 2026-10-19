import { z } from "zod";

import { extensibleUnion, openEnum, Uuid } from "@repo/contracts";

const DefinitionOutput = z.looseObject({
  name: z.string(),
  $type: openEnum(["color", "dimension", "typography", "shadow"]),
  $value: z.unknown().optional(),
  modes: z.record(z.string(), z.unknown()).optional(),
  $description: z.string().optional(),
});

const FigmaStateEnum = openEnum(["synced", "missing_in_figma", "duplicate_in_figma", "diverged"]);

const BatchRef = z.looseObject({ id: Uuid, state: openEnum(["open", "closed"]) });

const FigmaVariables = z.array(z.string()).optional();

const FigmaStateOutput = z.looseObject({
  state: FigmaStateEnum,
  figmaVariables: FigmaVariables,
  declaredAt: z.iso.datetime(),
  author: extensibleUnion("kind", [
    z.looseObject({ kind: z.literal("member"), userId: Uuid, name: z.string() }),
  ]),
  clientId: z.string(),
});

export const TokenOutput = DefinitionOutput.extend({
  id: Uuid,
  status: openEnum(["validated"]),
  duplicates: z.array(z.string()).optional(),
  figma: FigmaStateOutput.optional(),
});

const ProposalOutput = z.looseObject({
  id: Uuid,
  name: z.string(),
  kind: openEnum(["create", "update"]),
  status: openEnum(["proposed"]),
  batch: BatchRef,
  token: DefinitionOutput,
});

export const TokensOutput = z.looseObject({
  modes: z.array(z.string()),
  tokens: z.array(TokenOutput),
  proposals: z.array(ProposalOutput).optional(),
});

export const DeclaredFigmaStatesOutput = z.looseObject({
  states: z.array(
    z.looseObject({
      name: z.string(),
      state: FigmaStateEnum,
      figmaVariables: FigmaVariables,
      declaredAt: z.iso.datetime(),
      proposal: z.looseObject({ id: Uuid, batch: BatchRef }).nullable().optional(),
    }),
  ),
});
