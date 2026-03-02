export const MI_TO_M = 1609.34;
export const MI_TO_KM = 1.60934;

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