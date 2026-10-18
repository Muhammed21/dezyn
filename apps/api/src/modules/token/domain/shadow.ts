import { type ColorRefusal, colorRefusal, type SrgbColor } from "./color.ts";
import type { Dimension } from "./dimension.ts";

export type ShadowLayer = {
  readonly color: SrgbColor;
  readonly offsetX: Dimension;
  readonly offsetY: Dimension;
  readonly blur: Dimension;
  readonly spread: Dimension;
  readonly inset?: boolean;
};

export type Shadow = ShadowLayer | readonly ShadowLayer[];

export type ShadowRefusal = "no_layer" | "negative_blur" | ColorRefusal;

export type ShadowLayerRefusal = { readonly layer?: number; readonly refusal: ShadowRefusal };

const isLayered = (shadow: Shadow): shadow is readonly ShadowLayer[] => Array.isArray(shadow);

const layerRefusals = (layer: ShadowLayer): readonly ShadowRefusal[] => {
  const color = colorRefusal(layer.color);
  const colorRefusals: readonly ShadowRefusal[] = color === undefined ? [] : [color];
  const blurRefusals: readonly ShadowRefusal[] = layer.blur.value < 0 ? ["negative_blur"] : [];
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
