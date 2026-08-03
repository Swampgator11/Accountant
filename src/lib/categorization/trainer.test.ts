import { describe, expect, it } from "vitest";
import {
  matchTrainingPattern,
  normalizeMerchantKey,
  trainFromHistory,
} from "@/lib/categorization/trainer";
import { suggestCategories } from "@/lib/categorization/engine";
import { getDemoAccounts, getDemoTransactions } from "@/lib/qbo/demo";

describe("training from history", () => {
  it("normalizes noisy bank memos into stable keys", () => {
    expect(normalizeMerchantKey("STARBUCKS STORE 10221")).toBe("starbucks");
    expect(normalizeMerchantKey("ADOBE *CREATIVE CLOUD")).toBe(
      "adobe creative cloud",
    );
  });

  it("learns vendor → account mappings from categorized history", () => {
    const history = getDemoTransactions().filter((t) => !t.isUncategorized);
    const model = trainFromHistory(history);

    expect(model.categorizedCount).toBeGreaterThan(5);
    expect(model.patternCount).toBeGreaterThan(3);

    const starbucks = model.patterns.find(
      (p) => p.kind === "vendor" && p.key.includes("starbucks"),
    );
    expect(starbucks?.accountName).toMatch(/Meals/i);
    expect(starbucks!.support).toBeGreaterThanOrEqual(2);
  });

  it("suggests categories from training before falling back to rules", () => {
    const accounts = getDemoAccounts();
    const history = getDemoTransactions().filter((t) => !t.isUncategorized);
    const model = trainFromHistory(history);
    const uncategorized = getDemoTransactions().filter((t) => t.isUncategorized);

    const suggestions = suggestCategories(uncategorized, [], accounts, model);
    const byId = Object.fromEntries(
      suggestions.map((s) => [s.transactionId, s]),
    );

    expect(byId.d1.source).toBe("training");
    expect(byId.d1.accountName).toMatch(/Meals/i);
    expect(byId.d2.accountName).toMatch(/Software/i);
    expect(byId.d8.accountName).toMatch(/Software/i);
    expect(byId.d6.accountName).toMatch(/Sales/i);
  });

  it("matches uncategorized txns against the trained model", () => {
    const history = getDemoTransactions().filter((t) => !t.isUncategorized);
    const model = trainFromHistory(history);
    const github = getDemoTransactions().find((t) => t.id === "d8")!;
    const hit = matchTrainingPattern(github, model);
    expect(hit?.accountName).toMatch(/Software/i);
  });
});
