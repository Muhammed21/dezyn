import { z } from "zod";

import { openEnum, Uuid } from "../conventions/schemas.ts";
import { ROLES } from "./my-spaces.ts";

export const SentInvitationOutput = z.looseObject({
  id: Uuid,
  email: z.string(),
  expiresAt: z.iso.datetime(),
});

export const ChangedRoleOutput = z.looseObject({
  userId: Uuid,
  role: openEnum(ROLES),
});

export const LastOwnerProblem = z.looseObject({
  type: z.literal("https://dezyn.dev/problems/last-owner"),
  title: z.string(),
  status: z.literal(409),
});

export const SelfRemovalProblem = z.looseObject({
  type: z.literal("https://dezyn.dev/problems/self-removal"),
  title: z.string(),
  status: z.literal(409),
});

export const AlreadyMemberProblem = z.looseObject({
  type: z.literal("https://dezyn.dev/problems/already-member"),
  title: z.string(),
  status: z.literal(409),
});

export const EmailMismatchProblem = z.looseObject({
  type: z.literal("https://dezyn.dev/problems/email-mismatch"),
  title: z.string(),
  status: z.literal(403),
});
