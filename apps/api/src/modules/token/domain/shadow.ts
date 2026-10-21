import { type ColorRefusal, colorRefusal, type SrgbColor } from "./color.ts";
import type { Dimension } from "./dimension.ts";
import { type Alias, isReference } from "./reference.ts";

export type ShadowLayer = {
  readonly color: SrgbColor | Alias;
  readonly offsetX: Dimension | Alias;
  readonly offsetY: Dimension | Alias;
  readonly blur: Dimension | Alias;
  readonly spread: Dimension | Alias;
  readonly inset?: boolean;
};

export type Shadow = ShadowLayer | readonly ShadowLayer[];

export type ShadowRefusal = "no_layer" | "negative_blur" | ColorRefusal;

export type ShadowLayerRefusal = { readonly layer?: number; readonly refusal: ShadowRefusal };

const isLayered = (shadow: Shadow): shadow is readonly ShadowLayer[] => Array.isArray(shadow);

const layerRefusals = ({ color, blur }: ShadowLayer): readonly ShadowRefusal[] => {
  const colorRefused = isReference(color) ? undefined : colorRefusal(color);
  const colorRefusals: readonly ShadowRefusal[] = colorRefused === undefined ? [] : [colorRefused];
  const blurRefusals: readonly ShadowRefusal[] =
    !isReference(blur) && blur.value < 0 ? ["negative_blur"] : [];
  return [...colorRefusals, ...blurRefusals];
};

export const shadowRefusals = (shadow: Shadow): readonly ShadowLayerRefusal[] => {
  if (!isLayered(shadow)) {
    return layerRefusals(shadow).map((refusal) => ({ refusal }));
  }
  if (shadow.length === 0) {
    return [{ refusal: "no_layer" }];
  }
  return shadow.flatMap((layer, index) =>
    layerRefusals(layer).map((refusal) => ({ layer: index, refusal })),
  );
};
