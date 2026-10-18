export type SrgbColor = {
  readonly colorSpace: "srgb";
  readonly components: readonly [number, number, number];
  readonly alpha?: number;
  readonly hex?: string;
};

export type ColorRefusal =
  | "component_out_of_range"
  | "alpha_out_of_range"
  | "malformed_hex"
  | "hex_mismatch";

const HEX = /^#[0-9a-f]{6}$/i;

const isUnit = (value: number) => value >= 0 && value <= 1;

const hexOf = (components: SrgbColor["components"]) =>
  `#${components
    .map((component) =>
      Math.round(component * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

const hexRefusal = ({ components, hex }: SrgbColor): ColorRefusal | undefined => {
  if (hex === undefined) {
    return undefined;
  }
  if (!HEX.test(hex)) {
    return "malformed_hex";
  }
  return hex.toLowerCase() === hexOf(components) ? undefined : "hex_mismatch";
};

export const colorRefusal = (color: SrgbColor): ColorRefusal | undefined => {
  if (!color.components.every(isUnit)) {
    return "component_out_of_range";
  }
  if (color.alpha !== undefined && !isUnit(color.alpha)) {
    return "alpha_out_of_range";
  }
  return hexRefusal(color);
};
