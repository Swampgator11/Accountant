import type {
  NormalizedTransaction,
  TrainingModel,
  TrainingPattern,
} from "@/lib/qbo/types";

function stripNoise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[#*]/g, " ")
    .replace(/\b(store|inc|llc|ltd|co|corp|payment|pos|online|www)\b/g, " ")
    .replace(/\d{3,}/g, " ")
    .replace(/[^a-z0-9\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Collapse noisy bank memo text into a stable merchant-like key. */
export function normalizeMerchantKey(value: string): string {
  const cleaned = stripNoise(value);
  if (!cleaned) return "";
  // Keep the distinctive leading tokens; bank memos often append city/state noise.
  const tokens = cleaned.split(" ").filter(Boolean);
  return tokens.slice(0, 4).join(" ");
}

type Vote = {
  accountId: string;
  accountName: string;
  count: number;
};

type Bucket = {
  kind: TrainingPattern["kind"];
  key: string;
  displayKey: string;
  votes: Map<string, Vote>;
  total: number;
};

function bump(
  buckets: Map<string, Bucket>,
  kind: TrainingPattern["kind"],
  raw: string,
  accountId: string,
  accountName: string,
) {
  const key = normalizeMerchantKey(raw);
  if (!key || key.length < 2) return;

  const mapKey = `${kind}:${key}`;
  let bucket = buckets.get(mapKey);
  if (!bucket) {
    bucket = {
      kind,
      key,
      displayKey: raw.trim(),
      votes: new Map(),
      total: 0,
    };
    buckets.set(mapKey, bucket);
  }

  bucket.total += 1;
  const existing = bucket.votes.get(accountId);
  if (existing) {
    existing.count += 1;
  } else {
    bucket.votes.set(accountId, { accountId, accountName, count: 1 });
  }
}

/**
 * Train a lightweight categorization model from already-categorized history.
 * Uses majority vote per vendor / description key.
 */
export function trainFromHistory(
  categorized: NormalizedTransaction[],
  options?: { historyStartDate?: string; historyEndDate?: string },
): TrainingModel {
  const buckets = new Map<string, Bucket>();

  for (const txn of categorized) {
    if (txn.isUncategorized) continue;
    if (!txn.currentAccountId || !txn.currentAccountName) continue;

    if (txn.vendorName) {
      bump(
        buckets,
        "vendor",
        txn.vendorName,
        txn.currentAccountId,
        txn.currentAccountName,
      );
    }
    bump(
      buckets,
      "description",
      txn.description,
      txn.currentAccountId,
      txn.currentAccountName,
    );
  }

  const patterns: TrainingPattern[] = [];
  let index = 0;

  for (const bucket of buckets.values()) {
    const ranked = [...bucket.votes.values()].sort((a, b) => b.count - a.count);
    const winner = ranked[0];
    if (!winner) continue;

    // Need a clear majority and enough support to avoid one-off noise.
    const confidence = winner.count / bucket.total;
    if (winner.count < 1 || confidence < 0.5) continue;

    patterns.push({
      id: `train-${++index}`,
      kind: bucket.kind,
      key: bucket.key,
      displayKey: bucket.displayKey,
      accountId: winner.accountId,
      accountName: winner.accountName,
      support: winner.count,
      confidence: Number(confidence.toFixed(3)),
    });
  }

  // Prefer stronger, more specific patterns first (vendor over description when equal).
  patterns.sort((a, b) => {
    if (b.support !== a.support) return b.support - a.support;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.kind !== b.kind) return a.kind === "vendor" ? -1 : 1;
    return a.key.localeCompare(b.key);
  });

  const dates = categorized.map((t) => t.date).sort();
  const today = new Date().toISOString().slice(0, 10);

  return {
    trainedAt: new Date().toISOString(),
    historyStartDate: options?.historyStartDate ?? dates[0] ?? today,
    historyEndDate: options?.historyEndDate ?? dates[dates.length - 1] ?? today,
    categorizedCount: categorized.length,
    patternCount: patterns.length,
    patterns,
  };
}

export function matchTrainingPattern(
  txn: NormalizedTransaction,
  model: TrainingModel | null,
): TrainingPattern | null {
  if (!model || model.patterns.length === 0) return null;

  const vendorKey = txn.vendorName
    ? normalizeMerchantKey(txn.vendorName)
    : "";
  const descriptionKey = normalizeMerchantKey(txn.description);

  // Exact vendor match first (highest signal), then description.
  if (vendorKey) {
    const vendorHit = model.patterns.find(
      (p) => p.kind === "vendor" && p.key === vendorKey,
    );
    if (vendorHit) return vendorHit;
  }

  if (descriptionKey) {
    const exactDesc = model.patterns.find(
      (p) => p.kind === "description" && p.key === descriptionKey,
    );
    if (exactDesc) return exactDesc;

    // Soft containment for truncated bank memos.
    const soft = model.patterns.find((p) => {
      if (p.kind !== "description" && p.kind !== "vendor") return false;
      return (
        descriptionKey.includes(p.key) ||
        p.key.includes(descriptionKey) ||
        (vendorKey && (vendorKey.includes(p.key) || p.key.includes(vendorKey)))
      );
    });
    if (soft) return soft;
  }

  return null;
}
