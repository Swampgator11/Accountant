export type QboRef = {
  value: string;
  name?: string;
};

export type QboAccount = {
  Id: string;
  Name: string;
  AccountType: string;
  AccountSubType?: string;
  Classification?: string;
  Active?: boolean;
  FullyQualifiedName?: string;
};

export type QboPurchaseLine = {
  Id?: string;
  Amount: number;
  DetailType: string;
  Description?: string;
  AccountBasedExpenseLineDetail?: {
    AccountRef: QboRef;
    BillableStatus?: string;
  };
};

export type QboPurchase = {
  Id: string;
  SyncToken: string;
  TxnDate: string;
  TotalAmt: number;
  PaymentType?: string;
  EntityRef?: QboRef;
  AccountRef?: QboRef;
  PrivateNote?: string;
  Line: QboPurchaseLine[];
  MetaData?: {
    CreateTime?: string;
    LastUpdatedTime?: string;
  };
};

export type QboDeposit = {
  Id: string;
  SyncToken: string;
  TxnDate: string;
  TotalAmt: number;
  DepositToAccountRef?: QboRef;
  PrivateNote?: string;
  Line: Array<{
    Id?: string;
    Amount: number;
    Description?: string;
    DetailType: string;
    DepositLineDetail?: {
      AccountRef?: QboRef;
      Entity?: QboRef;
    };
  }>;
};

export type NormalizedTransaction = {
  id: string;
  syncToken: string;
  source: "Purchase" | "Deposit" | "Demo";
  date: string;
  amount: number;
  description: string;
  vendorName: string | null;
  currentAccountId: string | null;
  currentAccountName: string | null;
  isUncategorized: boolean;
  lineId?: string;
};

export type CategorySuggestion = {
  transactionId: string;
  accountId: string;
  accountName: string;
  confidence: number;
  ruleId: string | null;
  ruleLabel: string | null;
  reason: string;
  source?: "training" | "rule" | "heuristic";
};

export type CategorizationRule = {
  id: string;
  label: string;
  pattern: string;
  matchField: "description" | "vendor" | "any";
  accountId: string;
  accountName: string;
  priority: number;
  enabled: boolean;
};

/** Learned merchant/description → account mapping from past categorized books. */
export type TrainingPattern = {
  id: string;
  kind: "vendor" | "description";
  /** Normalized match key (lowercased, stripped) */
  key: string;
  displayKey: string;
  accountId: string;
  accountName: string;
  /** How many historical categorized txns voted for this mapping */
  support: number;
  /** support / total observations for this key */
  confidence: number;
};

export type TrainingModel = {
  trainedAt: string;
  historyStartDate: string;
  historyEndDate: string;
  categorizedCount: number;
  patternCount: number;
  patterns: TrainingPattern[];
};

export type MorningSettings = {
  enabled: boolean;
  /** Local hour 0–23 when the morning job should run (informational for cron docs) */
  hourLocal: number;
  timezone: string;
  /** Only auto-write categories at or above this confidence (0–1) */
  minConfidence: number;
  /** If false, morning run only suggests; if true, writes to QBO */
  autoApply: boolean;
  lastRunAt: string | null;
};

export type MorningRunResult = {
  id: string;
  startedAt: string;
  finishedAt: string;
  trained: boolean;
  uncategorizedCount: number;
  suggestedCount: number;
  appliedCount: number;
  skippedLowConfidence: number;
  errors: string[];
  suggestions: CategorySuggestion[];
};

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  realmId: string;
  tokenType: string;
};

export type PnLRow = {
  label: string;
  amount: number;
  depth: number;
  group?: string;
};

export type PnLReport = {
  startDate: string;
  endDate: string;
  title: string;
  currency: string;
  rows: PnLRow[];
  incomeTotal: number;
  expenseTotal: number;
  netIncome: number;
};
