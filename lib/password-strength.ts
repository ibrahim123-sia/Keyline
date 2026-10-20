/**
 * Small password strength estimate for the sign-up form (12 §1: "with strength check").
 * Length matters most; character variety and avoiding common patterns add a little.
 * Returns 0 (weak) to 3 (strong).
 */
const COMMON = [
  "password",
  "123456",
  "qwerty",
  "letmein",
  "welcome",
  "admin",
  "iloveyou",
  "abc123",
  "monkey",
  "dragon",
];

export type Strength = 0 | 1 | 2 | 3;

export function passwordStrength(password: string, context: string[] = []): Strength {
  if (!password) return 0;
  const lower = password.toLowerCase();
  if (COMMON.some((c) => lower.includes(c))) return 0;
  if (personalTokens(context).some((token) => lower.includes(token))) return 0;
  if (/^(.)\1+$/.test(password)) return 0;

  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (password.length >= 20) score++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes >= 3) score++;
  if (/(012|123|234|345|456|567|678|789|abc|bcd|cde|xyz)/i.test(password)) score--;
  return Math.max(0, Math.min(3, score)) as Strength;
}

/** Name parts and email local-part pieces of 3+ characters ("Sara Khan" -> sara, khan). */
function personalTokens(context: string[]): string[] {
  const tokens = new Set<string>();
  for (const value of context) {
    if (!value) continue;
    const base = value.toLowerCase().split("@")[0]!;
    for (const part of base.split(/[^a-z0-9]+/)) if (part.length >= 3) tokens.add(part);
  }
  return [...tokens];
}
