import { promises as fs } from "fs";
import path from "path";
import { cookies } from "next/headers";
import { del, get, put, list } from "@vercel/blob";
import { sealJson, unsealJson } from "@/lib/storage/crypto";
import type { StoredCredentials } from "@/lib/qbo/credentials";
import type {
  CategorizationRule,
  MorningRunResult,
  MorningSettings,
  TokenSet,
  TrainingModel,
} from "@/lib/qbo/types";

type CookieSetter = {
  set: (
    ...args:
      | [name: string, value: string, options?: Record<string, unknown>]
      | [options: { name: string; value: string } & Record<string, unknown>]
  ) => unknown;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const MAX_RUN_LOGS = 20;
const COOKIE_PREFIX = "aa_";
const BLOB_PREFIX = "accountant/";
/** Stay under typical 4KB browser cookie limits after sealing. */
const COOKIE_CHUNK_SIZE = 2800;

type StoreKey =
  | "credentials"
  | "tokens"
  | "oauth-state"
  | "rules"
  | "training-model"
  | "morning-settings"
  | "morning-runs";

const COOKIE_NAMES: Record<StoreKey, string> = {
  credentials: `${COOKIE_PREFIX}creds`,
  tokens: `${COOKIE_PREFIX}tokens`,
  "oauth-state": `${COOKIE_PREFIX}oauth`,
  rules: `${COOKIE_PREFIX}rules`,
  "training-model": `${COOKIE_PREFIX}train`,
  "morning-settings": `${COOKIE_PREFIX}morning`,
  "morning-runs": `${COOKIE_PREFIX}runs`,
};

function fileName(key: StoreKey): string {
  return `${key}.json`;
}

function blobPath(key: StoreKey): string {
  return `${BLOB_PREFIX}${key}.json`;
}

function hasBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function cookieOptions(maxAge = 60 * 60 * 24 * 180) {
  return {
    httpOnly: true,
    secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

async function canUseFilesystem(): Promise<boolean> {
  if (process.env.VERCEL) return false;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.access(DATA_DIR);
    return true;
  } catch {
    return false;
  }
}

async function readFileJson<T>(key: StoreKey, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, fileName(key)), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeFileJson<T>(key: StoreKey, value: T): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    path.join(DATA_DIR, fileName(key)),
    JSON.stringify(value, null, 2),
    "utf8",
  );
}

async function deleteFile(key: StoreKey): Promise<void> {
  try {
    await fs.unlink(path.join(DATA_DIR, fileName(key)));
  } catch {
    // already gone
  }
}

async function readBlobJson<T>(key: StoreKey, fallback: T): Promise<T> {
  if (!hasBlob()) return fallback;
  try {
    const result = await get(blobPath(key), { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return fallback;
    }
    const sealed = await new Response(result.stream).text();
    const value = await unsealJson<T>(sealed);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeBlobJson<T>(key: StoreKey, value: T): Promise<void> {
  if (!hasBlob()) return;
  const sealed = await sealJson(value);
  await put(blobPath(key), sealed, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "text/plain",
  });
}

async function deleteBlob(key: StoreKey): Promise<void> {
  if (!hasBlob()) return;
  try {
    const { blobs } = await list({ prefix: blobPath(key), limit: 5 });
    await Promise.all(blobs.map((b) => del(b.url)));
  } catch {
    // ignore
  }
}

function readChunkedFromJar(
  jar: Awaited<ReturnType<typeof cookies>>,
  key: StoreKey,
): string | null {
  const base = COOKIE_NAMES[key];
  const single = jar.get(base)?.value;
  if (single) return single;

  const countRaw = jar.get(`${base}_n`)?.value;
  const count = Number(countRaw ?? 0);
  if (!count || Number.isNaN(count)) return null;

  let combined = "";
  for (let i = 0; i < count; i++) {
    const part = jar.get(`${base}_${i}`)?.value;
    if (!part) return null;
    combined += part;
  }
  return combined;
}

async function readCookieJson<T>(key: StoreKey, fallback: T): Promise<T> {
  try {
    const jar = await cookies();
    const raw = readChunkedFromJar(jar, key);
    if (!raw) return fallback;
    const value = await unsealJson<T>(raw);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function applyChunkedCookie(
  target: CookieSetter,
  key: StoreKey,
  sealed: string,
  maxAge?: number,
) {
  const base = COOKIE_NAMES[key];
  const opts = cookieOptions(maxAge);

  // Clear any previous single/chunked values first.
  target.set(base, "", { ...opts, maxAge: 0 });
  target.set(`${base}_n`, "", { ...opts, maxAge: 0 });
  for (let i = 0; i < 10; i++) {
    target.set(`${base}_${i}`, "", { ...opts, maxAge: 0 });
  }

  if (sealed.length <= COOKIE_CHUNK_SIZE) {
    target.set(base, sealed, opts);
    return;
  }

  const chunks: string[] = [];
  for (let i = 0; i < sealed.length; i += COOKIE_CHUNK_SIZE) {
    chunks.push(sealed.slice(i, i + COOKIE_CHUNK_SIZE));
  }
  target.set(`${base}_n`, String(chunks.length), opts);
  chunks.forEach((chunk, index) => {
    target.set(`${base}_${index}`, chunk, opts);
  });
}

async function writeCookieJson<T>(
  key: StoreKey,
  value: T,
  responseCookies?: CookieSetter,
): Promise<void> {
  const sealed = await sealJson(value);
  if (responseCookies) {
    applyChunkedCookie(responseCookies, key, sealed);
    return;
  }

  try {
    const jar = await cookies();
    // next/headers cookies() supports set() with the same options.
    const opts = cookieOptions();
    const base = COOKIE_NAMES[key];
    jar.set(base, "", { ...opts, maxAge: 0 });
    jar.set(`${base}_n`, "", { ...opts, maxAge: 0 });
    for (let i = 0; i < 10; i++) {
      jar.set(`${base}_${i}`, "", { ...opts, maxAge: 0 });
    }

    if (sealed.length <= COOKIE_CHUNK_SIZE) {
      jar.set(base, sealed, opts);
      return;
    }
    const chunks: string[] = [];
    for (let i = 0; i < sealed.length; i += COOKIE_CHUNK_SIZE) {
      chunks.push(sealed.slice(i, i + COOKIE_CHUNK_SIZE));
    }
    jar.set(`${base}_n`, String(chunks.length), opts);
    chunks.forEach((chunk, index) => {
      jar.set(`${base}_${index}`, chunk, opts);
    });
  } catch {
    // cookies() unavailable outside request scope
  }
}

async function deleteCookie(
  key: StoreKey,
  responseCookies?: CookieSetter,
): Promise<void> {
  const base = COOKIE_NAMES[key];
  const opts = { ...cookieOptions(), maxAge: 0 };
  if (responseCookies) {
    responseCookies.set(base, "", opts);
    responseCookies.set(`${base}_n`, "", opts);
    for (let i = 0; i < 10; i++) {
      responseCookies.set(`${base}_${i}`, "", opts);
    }
    return;
  }
  try {
    const jar = await cookies();
    jar.set(base, "", opts);
    jar.set(`${base}_n`, "", opts);
    for (let i = 0; i < 10; i++) {
      jar.set(`${base}_${i}`, "", opts);
    }
  } catch {
    // ignore
  }
}

async function readJson<T>(key: StoreKey, fallback: T): Promise<T> {
  if (await canUseFilesystem()) {
    return readFileJson(key, fallback);
  }

  const fromBlob = await readBlobJson<T | null>(key, null);
  if (fromBlob !== null && fromBlob !== undefined) return fromBlob;

  return readCookieJson(key, fallback);
}

async function writeJson<T>(
  key: StoreKey,
  value: T,
  responseCookies?: CookieSetter,
): Promise<void> {
  if (await canUseFilesystem()) {
    await writeFileJson(key, value);
    return;
  }
  await writeBlobJson(key, value);
  await writeCookieJson(key, value, responseCookies);
}

async function clearKey(
  key: StoreKey,
  responseCookies?: CookieSetter,
): Promise<void> {
  if (await canUseFilesystem()) {
    await deleteFile(key);
  }
  await deleteBlob(key);
  await deleteCookie(key, responseCookies);
}

export async function getCredentials(): Promise<StoredCredentials | null> {
  return readJson<StoredCredentials | null>("credentials", null);
}

export async function saveCredentials(
  credentials: StoredCredentials,
): Promise<void> {
  await writeJson("credentials", credentials);
}

export async function clearCredentials(): Promise<void> {
  await clearKey("credentials");
}

export async function getTokens(): Promise<TokenSet | null> {
  return readJson<TokenSet | null>("tokens", null);
}

export async function saveTokens(
  tokens: TokenSet,
  responseCookies?: CookieSetter,
): Promise<void> {
  await writeJson("tokens", tokens, responseCookies);
}

export async function clearTokens(
  responseCookies?: CookieSetter,
): Promise<void> {
  await clearKey("tokens", responseCookies);
}

export async function getOAuthState(): Promise<string | null> {
  const data = await readJson<{ state?: string }>("oauth-state", {});
  return data.state ?? null;
}

export async function saveOAuthState(
  state: string,
  responseCookies?: CookieSetter,
): Promise<void> {
  await writeJson(
    "oauth-state",
    { state, createdAt: Date.now() },
    responseCookies,
  );
}

export async function clearOAuthState(
  responseCookies?: CookieSetter,
): Promise<void> {
  await clearKey("oauth-state", responseCookies);
}

export async function getRules(): Promise<CategorizationRule[]> {
  return readJson<CategorizationRule[]>("rules", []);
}

export async function saveRules(rules: CategorizationRule[]): Promise<void> {
  await writeJson("rules", rules);
}

export async function getTrainingModel(): Promise<TrainingModel | null> {
  return readJson<TrainingModel | null>("training-model", null);
}

export async function saveTrainingModel(model: TrainingModel): Promise<void> {
  await writeJson("training-model", model);
}

export async function getMorningSettings(): Promise<MorningSettings | null> {
  return readJson<MorningSettings | null>("morning-settings", null);
}

export async function saveMorningSettings(
  settings: MorningSettings,
): Promise<void> {
  await writeJson("morning-settings", settings);
}

export async function getMorningRuns(): Promise<MorningRunResult[]> {
  return readJson<MorningRunResult[]>("morning-runs", []);
}

export async function appendMorningRun(run: MorningRunResult): Promise<void> {
  const existing = await getMorningRuns();
  const slim: MorningRunResult = {
    ...run,
    suggestions: run.suggestions.slice(0, 15),
    errors: run.errors.slice(0, 10),
  };
  const next = [slim, ...existing].slice(0, MAX_RUN_LOGS);
  await writeJson("morning-runs", next);
}
