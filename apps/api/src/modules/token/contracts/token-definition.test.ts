import { describe, expect, it } from "vitest";

import { TokenDefinitionInput } from "./token-definition.ts";

describe("un nombre non fini est refusé en nommant le champ (ADR 0028 §1)", () => {
  it.each([[Number.POSITIVE_INFINITY], [Number.NEGATIVE_INFINITY], [Number.NaN]])(
    "%s",
    ($value) => {
      const parsed = TokenDefinitionInput.safeParse({
        name: "calque.haut",
        $type: "number",
        $value,
      });

      expect(parsed.error?.issues).toMatchObject([{ path: ["$value"] }]);
    },
  );
});
