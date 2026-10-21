import { type ColorRefusal, colorRefusal, type SrgbColor } from "./color.ts";

export type GradientStop = {
  readonly color: SrgbColor;
  readonly position: number;
};

export type Gradient = readonly GradientStop[];

export type GradientRefusal = "no_stop" | "position_out_of_range" | ColorRefusal;

export type GradientStopRefusal = { readonly stop?: number; readonly refusal: GradientRefusal };

const stopRefusals = ({ color, position }: GradientStop): readonly GradientRefusal[] => {
  const colorRefused = colorRefusal(color);
  const colorRefusals: readonly GradientRefusal[] =
    colorRefused === undefined ? [] : [colorRefused];
  const positionRefusals: readonly GradientRefusal[] =
    position < 0 || position > 1 ? ["position_out_of_range"] : [];
  return [...colorRefusals, ...positionRefusals];
};

export const gradientRefusals = (gradient: Gradient): readonly GradientStopRefusal[] =>
  gradient.length === 0
    ? [{ refusal: "no_stop" }]
    : gradient.flatMap((stop, index) =>
        stopRefusals(stop).map((refusal) => ({ stop: index, refusal })),
      );
