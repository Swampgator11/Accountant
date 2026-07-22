import { NextResponse } from "next/server";
import { listExpenseAccounts, listTransactions } from "@/lib/qbo/client";
import {
  createDefaultRules,
  suggestCategories,
} from "@/lib/categorization/engine";
import { getRules, saveRules } from "@/lib/storage/store";

export async function POST() {
  try {
    const [transactions, accounts] = await Promise.all([
      listTransactions({ uncategorizedOnly: true }),
      listExpenseAccounts(),
    ]);

    let rules = await getRules();
    if (rules.length === 0) {
      rules = createDefaultRules(accounts);
      await saveRules(rules);
    }

    const suggestions = suggestCategories(transactions, rules, accounts);
    return NextResponse.json({
      suggestions,
      transactionCount: transactions.length,
      suggestionCount: suggestions.length,
      rulesUsed: rules.filter((r) => r.enabled).length,
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
