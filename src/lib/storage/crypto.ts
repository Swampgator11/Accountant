import { CompactEncrypt, compactDecrypt, base64url } from "jose";

function secretKey(): Uint8Array {
  const secret =
    process.env.APP_SECRET ||
    process.env.CRON_SECRET ||
    process.env.QBO_CLIENT_SECRET ||
    "accountant-dev-secret-change-me";
  // Derive a stable 32-byte key from whatever secret we have.
  const bytes = new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 64));
  const key = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) {
    key[i % 32] ^= bytes[i]!;
  }
  return key;
}

export async function sealJson(value: unknown): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  return new CompactEncrypt(plaintext)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(secretKey());
}

export async function unsealJson<T>(token: string): Promise<T | null> {
  try {
    const { plaintext } = await compactDecrypt(token, secretKey());
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

export function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return base64url.encode(bytes);
}
