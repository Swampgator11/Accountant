import { promises as fs } from "fs";
import path from "path";
import type {
  CategorizationRule,
  MorningRunResult,
  MorningSettings,
  TokenSet,
  TrainingModel,
} from "@/lib/qbo/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const MAX_RUN_LOGS = 30;

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(filename: string, fallback: T): Promise<T> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(filename: string, value: T): Promise<void> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export async function getTokens(): Promise<TokenSet | null> {
  return readJson<TokenSet | null>("tokens.json", null);
}

export async function saveTokens(tokens: TokenSet): Promise<void> {
  await writeJson("tokens.json", tokens);
}

export async function clearTokens(): Promise<void> {
  await ensureDataDir();
  try {
    await fs.unlink(path.join(DATA_DIR, "tokens.json"));
  } catch {
    // already gone
  }
}

export async function getOAuthState(): Promise<string | null> {
  const data = await readJson<{ state?: string }>("oauth-state.json", {});
  return data.state ?? null;
}

export async function saveOAuthState(state: string): Promise<void> {
  await writeJson("oauth-state.json", { state, createdAt: Date.now() });
}

export async function clearOAuthState(): Promise<void> {
  try {
    await fs.unlink(path.join(DATA_DIR, "oauth-state.json"));
  } catch {
    // already gone
  }
}

export async function getRules(): Promise<CategorizationRule[]> {
  return readJson<CategorizationRule[]>("rules.json", []);
}

export async function saveRules(rules: CategorizationRule[]): Promise<void> {
  await writeJson("rules.json", rules);
}

export async function getTrainingModel(): Promise<TrainingModel | null> {
  return readJson<TrainingModel | null>("training-model.json", null);
}

export async function saveTrainingModel(model: TrainingModel): Promise<void> {
  await writeJson("training-model.json", model);
}

export async function getMorningSettings(): Promise<MorningSettings | null> {
  return readJson<MorningSettings | null>("morning-settings.json", null);
}

export async function saveMorningSettings(
  settings: MorningSettings,
): Promise<void> {
  await writeJson("morning-settings.json", settings);
}

export async function getMorningRuns(): Promise<MorningRunResult[]> {
  return readJson<MorningRunResult[]>("morning-runs.json", []);
}

export async function appendMorningRun(run: MorningRunResult): Promise<void> {
  const existing = await getMorningRuns();
  const next = [run, ...existing].slice(0, MAX_RUN_LOGS);
  await writeJson("morning-runs.json", next);
}
