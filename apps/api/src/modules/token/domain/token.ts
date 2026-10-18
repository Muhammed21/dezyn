import type { SrgbColor } from "./color.ts";
import type { Dimension } from "./dimension.ts";
import type { Shadow } from "./shadow.ts";
import type { Typography } from "./typography.ts";

type Typed<Type extends string, Value> = {
  readonly name: string;
  readonly $type: Type;
  readonly $value: Value;
  readonly $description?: string;
};

export type TokenDefinition =
  | Typed<"color", SrgbColor>
  | Typed<"dimension", Dimension>
  | Typed<"typography", Typography>
  | Typed<"shadow", Shadow>;

export type Token = TokenDefinition & {
  readonly id: string;
  readonly projectId: string;
  readonly status: "validated";
  readonly createdAt: Date;
};
