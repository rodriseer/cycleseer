export function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in environment.`);
  return v;
}

export function getOptionalEnv(name: string) {
  return process.env[name] ?? null;
}
