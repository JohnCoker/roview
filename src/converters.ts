import type { Col } from "./RunFile";

/**
 * Return a function that converts a distance value from the column's unit to
 * meters, or undefined if the unit is unrecognized.
 */
export function distanceToMeters(col: Col): ((v: number | null) => number | null) | undefined {
  let convert: (v: number) => number;
  switch (col.unit()) {
    case "m":
      convert = (v) => v;
      break;
    case "km":
      convert = (v) => v * 1000;
      break;
    case "ft":
      convert = (v) => v * 0.3048;
      break;
    case "NM":
    case "nmi":
      convert = (v) => v * 1852;
      break;
    default:
      return undefined;
  }
  return (v) => {
    if (v == null || !Number.isFinite(v)) return null;
    return convert(v);
  };
}
