export function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export function clampNumber(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

export function parseRideType(x: unknown): "road" | "gravel" {
  return x === "gravel" ? "gravel" : "road";
}
