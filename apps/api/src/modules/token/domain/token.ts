import type { SrgbColor } from "./color.ts";

export type ColorToken = {
  readonly name: string;
  readonly $type: "color";
  readonly $value: SrgbColor;
  readonly $description?: string;
};

export type Token = ColorToken & {
  readonly id: string;
  readonly projectId: string;
  readonly status: "validated";
  readonly createdAt: Date;
};
