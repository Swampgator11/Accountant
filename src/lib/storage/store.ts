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

const DATA_DIR = path.join(process.cwd(), ".data");
const MAX_RUN_LOGS = 20;
const COOKIE_PREFIX = "aa_";
const BLOB_PREFIX = "accountant/";

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

async function readCookieJson<T>(key: StoreKey, fallback: T): Promise<T> {
  try {
    const jar = await cookies();
    const raw = jar.get(COOKIE_NAMES[key])?.value;
    if (!raw) return fallback;
    const value = await unsealJson<T>(raw);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeCookieJson<T>(key: StoreKey, value: T): Promise<void> {
  try {
    const jar = await cookies();
    const sealed = await sealJson(value);
    jar.set(COOKIE_NAMES[key], sealed, {
      httpOnly: true,
      secure:
        process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  } catch {
    // cookies() unavailable outside request scope (e.g. some cron contexts)
  }
}

async function deleteCookie(key: StoreKey): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(COOKIE_NAMES[key]);
  } catch {
    // ignore
  }
}

async function readJson<T>(key: StoreKey, fallback: T): Promise<T> {
  if (await canUseFilesystem()) {
    return readFileJson(key, fallback);
  }

  // Prefer durable blob (works for Vercel Cron), then cookies (browser session).
  const fromBlob = await readBlobJson<T | null>(key, null);
  if (fromBlob !== null && fromBlob !== undefined) return fromBlob;

  return readCookieJson(key, fallback);
}

async function writeJson<T>(key: StoreKey, value: T): Promise<void> {
  if (await canUseFilesystem()) {
    await writeFileJson(key, value);
    return;
  }
  await writeBlobJson(key, value);
  await writeCookieJson(key, value);
}

async function clearKey(key: StoreKey): Promise<void> {
  if (await canUseFilesystem()) {
    await deleteFile(key);
  }
  await deleteBlob(key);
  await deleteCookie(key);
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

export async function saveTokens(tokens: TokenSet): Promise<void> {
  await writeJson("tokens", tokens);
}

export async function clearTokens(): Promise<void> {
  await clearKey("tokens");
}

export async function getOAuthState(): Promise<string | null> {
  const data = await readJson<{ state?: string }>("oauth-state", {});
  return data.state ?? null;
}

export async function saveOAuthState(state: string): Promise<void> {
  await writeJson("oauth-state", { state, createdAt: Date.now() });
}

export async function clearOAuthState(): Promise<void> {
  await clearKey("oauth-state");
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
