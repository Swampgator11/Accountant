import type {
  CategorizationRule,
  CategorySuggestion,
  NormalizedTransaction,
  QboAccount,
  TrainingModel,
} from "@/lib/qbo/types";
import { matchTrainingPattern } from "@/lib/categorization/trainer";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesRule(
  txn: NormalizedTransaction,
  rule: CategorizationRule,
): boolean {
  const haystacks: string[] = [];
  if (rule.matchField === "description" || rule.matchField === "any") {
    haystacks.push(txn.description);
  }
  if (rule.matchField === "vendor" || rule.matchField === "any") {
    if (txn.vendorName) haystacks.push(txn.vendorName);
  }

  let regex: RegExp;
  try {
    regex = new RegExp(rule.pattern, "i");
  } catch {
    regex = new RegExp(escapeRegExp(rule.pattern), "i");
  }

  return haystacks.some((text) => regex.test(text));
}

export function suggestCategories(
  transactions: NormalizedTransaction[],
  rules: CategorizationRule[],
  accounts: QboAccount[],
  trainingModel?: TrainingModel | null,
): CategorySuggestion[] {
  const enabledRules = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => b.priority - a.priority);

  const accountById = new Map(accounts.map((a) => [a.Id, a]));
  const suggestions: CategorySuggestion[] = [];

  for (const txn of transactions) {
    if (!txn.isUncategorized) continue;

    // 1) Past books win: learned mappings from previously categorized entries.
    const trained = matchTrainingPattern(txn, trainingModel ?? null);
    if (trained) {
      const account = accountById.get(trained.accountId);
      // Blend empirical support into confidence; floor at pattern confidence.
      const supportBoost = Math.min(0.08, trained.support * 0.01);
      suggestions.push({
        transactionId: txn.id,
        accountId: trained.accountId,
        accountName: account?.Name ?? trained.accountName,
        confidence: Math.min(0.98, trained.confidence + supportBoost),
        ruleId: trained.id,
        ruleLabel: `Learned: ${trained.displayKey}`,
        reason: `Learned from ${trained.support} past ${trained.kind} match${trained.support === 1 ? "" : "es"} → ${trained.accountName}`,
        source: "training",
      });
      continue;
    }

    // 2) Explicit user rules.
    const matched = enabledRules.find((rule) => matchesRule(txn, rule));
    if (matched) {
      const account = accountById.get(matched.accountId);
      suggestions.push({
        transactionId: txn.id,
        accountId: matched.accountId,
        accountName: account?.Name ?? matched.accountName,
        confidence: 0.92,
        ruleId: matched.id,
        ruleLabel: matched.label,
        reason: `Matched rule “${matched.label}”`,
        source: "rule",
      });
      continue;
    }

    // 3) Generic merchant heuristics as a last resort.
    const heuristic = heuristicSuggest(txn, accounts);
    if (heuristic) suggestions.push(heuristic);
  }

  return suggestions;
}

function heuristicSuggest(
  txn: NormalizedTransaction,
  accounts: QboAccount[],
): CategorySuggestion | null {
  const text = `${txn.description} ${txn.vendorName ?? ""}`.toLowerCase();
  const heuristics: Array<{ pattern: RegExp; names: string[] }> = [
    {
      pattern: /adobe|github|openai|notion|slack|zoom|aws|google\s*workspace|microsoft\s*365|dropbox/,
      names: ["Software Subscriptions", "Computer Software", "Software"],
    },
    {
      pattern: /uber|lyft|delta|united|american airlines|marriott|hilton|airbnb|hotel/,
      names: ["Travel", "Travel Expenses"],
    },
    {
      pattern: /starbucks|restaurant|cafe|doordash|ubereats|grubhub|chipotle/,
      names: ["Meals and Entertainment", "Meals", "Restaurants"],
    },
    {
      pattern: /office depot|staples|amazon|best buy/,
      names: ["Office Supplies", "Supplies"],
    },
    {
      pattern: /facebook|meta ads|google ads|adwords|linkedin ads/,
      names: ["Advertising", "Marketing", "Advertising & Marketing"],
    },
    {
      pattern: /electric|power|utility|utilities|water|gas bill|comcast|verizon|at&t/,
      names: ["Utilities", "Telephone", "Internet"],
    },
    {
      pattern: /payment|invoice|client|retainer/,
      names: ["Sales", "Services", "Income"],
    },
  ];

  for (const h of heuristics) {
    if (!h.pattern.test(text)) continue;
    const account = accounts.find((a) =>
      h.names.some((n) => a.Name.toLowerCase().includes(n.toLowerCase())),
    );
    if (!account) continue;
    return {
      transactionId: txn.id,
      accountId: account.Id,
      accountName: account.Name,
      confidence: 0.7,
      ruleId: null,
      ruleLabel: null,
      reason: `Heuristic match for ${account.Name}`,
      source: "heuristic",
    };
  }

  return null;
}

export function createDefaultRules(accounts: QboAccount[]): CategorizationRule[] {
  const find = (...names: string[]) =>
    accounts.find((a) =>
      names.some((n) => a.Name.toLowerCase() === n.toLowerCase()),
    ) ??
    accounts.find((a) =>
      names.some((n) => a.Name.toLowerCase().includes(n.toLowerCase())),
    );

  const candidates: Array<Omit<CategorizationRule, "id"> & { id?: string }> = [];

  const software = find("Software Subscriptions", "Software", "Computer Software");
  if (software) {
    candidates.push({
      label: "SaaS tools",
      pattern: "adobe|github|openai|notion|slack|zoom|aws|dropbox",
      matchField: "any",
      accountId: software.Id,
      accountName: software.Name,
      priority: 100,
      enabled: true,
    });
  }

  const travel = find("Travel", "Travel Expenses");
  if (travel) {
    candidates.push({
      label: "Travel & lodging",
      pattern: "uber|lyft|delta|united|marriott|hilton|airbnb|airline",
      matchField: "any",
      accountId: travel.Id,
      accountName: travel.Name,
      priority: 90,
      enabled: true,
    });
  }

  const meals = find("Meals and Entertainment", "Meals", "Restaurants");
  if (meals) {
    candidates.push({
      label: "Meals",
      pattern: "starbucks|restaurant|cafe|doordash|ubereats|chipotle",
      matchField: "any",
      accountId: meals.Id,
      accountName: meals.Name,
      priority: 80,
      enabled: true,
    });
  }

  const ads = find("Advertising", "Marketing");
  if (ads) {
    candidates.push({
      label: "Paid ads",
      pattern: "facebook|meta ads|google ads|adwords|linkedin",
      matchField: "any",
      accountId: ads.Id,
      accountName: ads.Name,
      priority: 85,
      enabled: true,
    });
  }

  const supplies = find("Office Supplies", "Supplies");
  if (supplies) {
    candidates.push({
      label: "Office supplies",
      pattern: "office depot|staples|amazon",
      matchField: "any",
      accountId: supplies.Id,
      accountName: supplies.Name,
      priority: 70,
      enabled: true,
    });
  }

  const utilities = find("Utilities");
  if (utilities) {
    candidates.push({
      label: "Utilities",
      pattern: "electric|power|utility|water|comcast|verizon",
      matchField: "any",
      accountId: utilities.Id,
      accountName: utilities.Name,
      priority: 75,
      enabled: true,
    });
  }

  const sales = find("Sales", "Services", "Income");
  if (sales) {
    candidates.push({
      label: "Client payments",
      pattern: "payment|invoice|client|retainer",
      matchField: "any",
      accountId: sales.Id,
      accountName: sales.Name,
      priority: 60,
      enabled: true,
    });
  }

  return candidates.map((rule, index) => ({
    ...rule,
    id: `default-${index + 1}`,
  }));
}
