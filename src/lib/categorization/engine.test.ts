import { describe, expect, it } from "vitest";
import {
  createDefaultRules,
  suggestCategories,
} from "@/lib/categorization/engine";
import { getDemoAccounts, getDemoTransactions } from "@/lib/qbo/demo";

describe("categorization engine", () => {
  it("creates default rules from chart of accounts", () => {
    const rules = createDefaultRules(getDemoAccounts());
    expect(rules.length).toBeGreaterThan(3);
    expect(rules.every((r) => r.accountId && r.pattern)).toBe(true);
  });

  it("suggests categories for uncategorized demo transactions", () => {
    const accounts = getDemoAccounts();
    const rules = createDefaultRules(accounts);
    const txns = getDemoTransactions().filter((t) => t.isUncategorized);
    const suggestions = suggestCategories(txns, rules, accounts);

    expect(suggestions.length).toBeGreaterThanOrEqual(4);

    const byId = Object.fromEntries(
      suggestions.map((s) => [s.transactionId, s.accountName]),
    );
    expect(byId.d2).toMatch(/Software/i);
    expect(byId.d3).toMatch(/Travel/i);
    expect(byId.d5).toMatch(/Advertising/i);
  });

  it("skips already categorized transactions", () => {
    const accounts = getDemoAccounts();
    const rules = createDefaultRules(accounts);
    const categorized = getDemoTransactions().filter((t) => !t.isUncategorized);
    const suggestions = suggestCategories(categorized, rules, accounts);
    expect(suggestions).toHaveLength(0);
  });
});
