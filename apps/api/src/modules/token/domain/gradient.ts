import { type ColorRefusal, colorRefusal, type SrgbColor } from "./color.ts";
import { type Alias, isReference } from "./reference.ts";

export type GradientStop = {
  readonly color: SrgbColor | Alias;
  readonly position: number | Alias;
};

export type Gradient = readonly GradientStop[];

export type GradientRefusal = "no_stop" | "position_out_of_range" | ColorRefusal;

export type GradientStopRefusal = { readonly stop?: number; readonly refusal: GradientRefusal };

const stopRefusals = ({ color, position }: GradientStop): readonly GradientRefusal[] => {
  const colorRefused = isReference(color) ? undefined : colorRefusal(color);
  const colorRefusals: readonly GradientRefusal[] =
    colorRefused === undefined ? [] : [colorRefused];
  const positionRefusals: readonly GradientRefusal[] =
    !isReference(position) && (position < 0 || position > 1) ? ["position_out_of_range"] : [];
  return [...colorRefusals, ...positionRefusals];
};

export const gradientRefusals = (gradient: Gradient): readonly GradientStopRefusal[] =>
  gradient.length === 0
    ? [{ refusal: "no_stop" }]
    : gradient.flatMap((stop, index) =>
        stopRefusals(stop).map((refusal) => ({ stop: index, refusal })),
      );
