import { randomBytes } from "crypto";
import {
  createDefaultRules,
  suggestCategories,
} from "@/lib/categorization/engine";
import { trainFromHistory } from "@/lib/categorization/trainer";
import {
  applyCategory,
  listExpenseAccounts,
  listTransactions,
} from "@/lib/qbo/client";
import {
  getMorningSettings,
  getRules,
  getTrainingModel,
  saveMorningSettings,
  saveRules,
  saveTrainingModel,
  appendMorningRun,
} from "@/lib/storage/store";
import type { MorningRunResult, MorningSettings } from "@/lib/qbo/types";

const DEFAULT_HISTORY_START = "2023-01-01";

export function defaultMorningSettings(): MorningSettings {
  return {
    enabled: true,
    hourLocal: 7,
    timezone: "America/Chicago",
    minConfidence: 0.8,
    autoApply: true,
    lastRunAt: null,
  };
}

/**
 * Retrain from categorized history, then categorize (and optionally apply)
 * anything QuickBooks left uncategorized.
 */
export async function runMorningJob(options?: {
  retrain?: boolean;
}): Promise<MorningRunResult> {
  const settings = {
    ...defaultMorningSettings(),
    ...(await getMorningSettings()),
  };

  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  let trained = false;

  const [allTxns, accounts] = await Promise.all([
    listTransactions({ startDate: DEFAULT_HISTORY_START }),
    listExpenseAccounts(),
  ]);

  let rules = await getRules();
  if (rules.length === 0) {
    rules = createDefaultRules(accounts);
    await saveRules(rules);
  }

  let model = await getTrainingModel();
  const shouldRetrain = options?.retrain !== false;
  if (shouldRetrain) {
    const history = allTxns.filter((t) => !t.isUncategorized);
    model = trainFromHistory(history, {
      historyStartDate: DEFAULT_HISTORY_START,
      historyEndDate: new Date().toISOString().slice(0, 10),
    });
    await saveTrainingModel(model);
    trained = true;
  }

  const uncategorized = allTxns.filter((t) => t.isUncategorized);
  const suggestions = suggestCategories(
    uncategorized,
    rules,
    accounts,
    model,
  );

  const eligible = suggestions.filter(
    (s) => s.confidence >= settings.minConfidence,
  );
  const skippedLowConfidence = suggestions.length - eligible.length;

  let appliedCount = 0;
  if (settings.autoApply && eligible.length > 0) {
    const byId = new Map(uncategorized.map((t) => [t.id, t]));
    for (const suggestion of eligible) {
      const txn = byId.get(suggestion.transactionId);
      if (!txn) continue;
      try {
        await applyCategory({
          transactionId: txn.id,
          source: txn.source,
          accountId: suggestion.accountId,
          accountName: suggestion.accountName,
        });
        // Demo mode apply is a no-op write; still count for the morning summary.
        appliedCount += 1;
      } catch (error) {
        errors.push(
          `${suggestion.transactionId}: ${
            error instanceof Error ? error.message : "apply failed"
          }`,
        );
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const result: MorningRunResult = {
    id: randomBytes(8).toString("hex"),
    startedAt,
    finishedAt,
    trained,
    uncategorizedCount: uncategorized.length,
    suggestedCount: suggestions.length,
    appliedCount: settings.autoApply ? appliedCount : 0,
    skippedLowConfidence,
    errors,
    suggestions,
  };

  await appendMorningRun(result);
  await saveMorningSettings({
    ...settings,
    lastRunAt: finishedAt,
  });

  return result;
}
