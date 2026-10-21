import type { SrgbColor } from "./color.ts";
import type { Dimension } from "./dimension.ts";
import type { Gradient } from "./gradient.ts";
import type { Alias } from "./reference.ts";
import type { Shadow } from "./shadow.ts";
import type { FontFamily, FontWeight, Typography } from "./typography.ts";

type Typed<Type extends string, Value> = {
  readonly name: string;
  readonly $type: Type;
  readonly $value?: Value | Alias;
  readonly modes?: Readonly<Record<string, Value | Alias>>;
  readonly $description?: string;
};

export type TokenDefinition =
  | Typed<"color", SrgbColor>
  | Typed<"dimension", Dimension>
  | Typed<"typography", Typography>
  | Typed<"shadow", Shadow>
  | Typed<"gradient", Gradient>
  | Typed<"fontFamily", FontFamily>
  | Typed<"fontWeight", FontWeight>
  | Typed<"number", number>;

export type Token = TokenDefinition & {
  readonly id: string;
  readonly projectId: string;
  readonly status: "validated";
  readonly createdAt: Date;
};
