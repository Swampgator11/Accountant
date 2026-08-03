export const SESSION_COOKIE = "aa_session";

function authConfigured(): boolean {
  return Boolean(process.env.AUTH_EMAIL && process.env.AUTH_PASSWORD);
}

function secret(): string {
  return (
    process.env.APP_SECRET ||
    process.env.CRON_SECRET ||
    process.env.AUTH_PASSWORD ||
    "accountant-dev-secret"
  );
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacSign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return toBase64Url(sig);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function verifyLogin(email: string, password: string): boolean {
  // If auth is not configured, allow local/demo use without a gate.
  if (!authConfigured()) return true;

  const expectedEmail = (process.env.AUTH_EMAIL ?? "").trim().toLowerCase();
  const expectedPassword = process.env.AUTH_PASSWORD ?? "";
  const emailOk = email.trim().toLowerCase() === expectedEmail;
  const passOk = timingSafeEqualStr(password, expectedPassword);
  return emailOk && passOk;
}

export async function createSessionToken(email: string): Promise<string> {
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        email: email.trim().toLowerCase(),
        exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
      }),
    ),
  );
  const sig = await hmacSign(payload);
  return `${payload}.${sig}`;
}

export async function readSessionEmail(
  token: string | undefined | null,
): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await hmacSign(payload);
  if (!timingSafeEqualStr(sig, expected)) return null;
  try {
    const data = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payload)),
    ) as { email?: string; exp?: number };
    if (!data.email || !data.exp || data.exp < Date.now()) return null;
    return data.email;
  } catch {
    return null;
  }
}

export async function createSessionCookie(email: string) {
  return {
    name: SESSION_COOKIE,
    value: await createSessionToken(email),
    httpOnly: true,
    secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export function isAuthRequired(): boolean {
  return authConfigured();
}
