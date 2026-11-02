import type { MeasurementUnit } from "@/generated/prisma/enums";

/** Centimetres per inch (exact, by definition). */
export const CM_PER_INCH = 2.54;

export function cmToIn(cm: number): number {
  return cm / CM_PER_INCH;
}

export function inToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

/** Round to a fixed number of decimal places (default 1, per US-A2's ±0.1 tolerance). */
export function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Convert a measurement between units. Same-unit conversion returns the input unchanged. */
export function convertMeasurement(
  value: number,
  from: MeasurementUnit,
  to: MeasurementUnit,
): number {
  if (from === to) return value;
  return from === "CM" ? cmToIn(value) : inToCm(value);
}

const UNIT_SUFFIX: Record<MeasurementUnit, string> = { CM: "cm", IN: "in" };

/**
 * Format a measurement for display, converting if needed.
 * @example formatMeasurement(91.4, "CM", "IN") // "36.0 in"
 */
export function formatMeasurement(
  value: number,
  from: MeasurementUnit,
  to: MeasurementUnit = from,
  decimals = 1,
): string {
  const converted = roundTo(convertMeasurement(value, from, to), decimals);
  return `${converted.toFixed(decimals)} ${UNIT_SUFFIX[to]}`;
}
