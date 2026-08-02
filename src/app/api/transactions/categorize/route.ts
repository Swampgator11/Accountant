import { NextResponse } from "next/server";
import { listExpenseAccounts, listTransactions } from "@/lib/qbo/client";
import {
  createDefaultRules,
  suggestCategories,
} from "@/lib/categorization/engine";
import { trainFromHistory } from "@/lib/categorization/trainer";
import {
  getRules,
  getTrainingModel,
  saveRules,
  saveTrainingModel,
} from "@/lib/storage/store";

export async function POST() {
  try {
    const [allTransactions, accounts] = await Promise.all([
      listTransactions({ startDate: "2023-01-01" }),
      listExpenseAccounts(),
    ]);

    let rules = await getRules();
    if (rules.length === 0) {
      rules = createDefaultRules(accounts);
      await saveRules(rules);
    }

    let model = await getTrainingModel();
    if (!model) {
      const history = allTransactions.filter((t) => !t.isUncategorized);
      model = trainFromHistory(history);
      await saveTrainingModel(model);
    }

    const transactions = allTransactions.filter((t) => t.isUncategorized);
    const suggestions = suggestCategories(
      transactions,
      rules,
      accounts,
      model,
    );
    return NextResponse.json({
      suggestions,
      transactionCount: transactions.length,
      suggestionCount: suggestions.length,
      rulesUsed: rules.filter((r) => r.enabled).length,
      trainingPatterns: model.patternCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to categorize transactions",
      },
      { status: 500 },
    );
  }
}
