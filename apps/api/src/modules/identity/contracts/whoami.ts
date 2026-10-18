import { z } from "zod";

import { Uuid } from "@repo/contracts";

export const WhoamiOutput = z.looseObject({ userId: Uuid, clientId: z.string() });
