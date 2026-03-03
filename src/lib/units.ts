export const MI_TO_M = 1609.34;
export const MI_TO_KM = 1.60934;

export type Units = "mi" | "km";

export function milesToMeters(mi: number) {
  return mi * MI_TO_M;
}

export function milesToKm(mi: number) {
  return mi * MI_TO_KM;
}

export function metersToMiles(m: number) {
  return m / MI_TO_M;
}

export function metersToKm(m: number) {
  return m / 1000;
}

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function formatDistance(meters: number, units: Units, digits = 1): string {
  const value = units === "mi" ? metersToMiles(meters) : metersToKm(meters);
  const factor = Math.pow(10, digits);
  const rounded = Math.round(value * factor) / factor;
  const unitLabel = units === "mi" ? "mi" : "km";
  return `${rounded.toFixed(digits)} ${unitLabel}`;
}