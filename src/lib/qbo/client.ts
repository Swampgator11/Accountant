import { getConfig } from "@/lib/config";
import { getValidTokens } from "@/lib/qbo/oauth";
import type {
  NormalizedTransaction,
  PnLReport,
  PnLRow,
  QboAccount,
  QboDeposit,
  QboPurchase,
  TokenSet,
} from "@/lib/qbo/types";
import { getDemoAccounts, getDemoPnL, getDemoTransactions } from "@/lib/qbo/demo";

const UNCATEGORIZED_PATTERNS = [
  /uncategorized/i,
  /ask my accountant/i,
  /^expenses?$/i,
];

function isUncategorizedName(name: string | null | undefined): boolean {
  if (!name) return true;
  return UNCATEGORIZED_PATTERNS.some((re) => re.test(name));
}

async function qboFetch<T>(
  tokens: TokenSet,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const config = getConfig();
  const url = `${config.apiBaseUrl}/v3/company/${tokens.realmId}${path}${
    path.includes("?") ? "&" : "?"
  }minorversion=75`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`QuickBooks API error (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

export async function requireConnection(): Promise<
  | { mode: "demo" }
  | { mode: "live"; tokens: TokenSet }
> {
  const config = getConfig();
  const tokens = await getValidTokens();
  if (tokens) return { mode: "live", tokens };
  if (config.DEMO_MODE) return { mode: "demo" };
  throw new Error("Not connected to QuickBooks Online.");
}

export async function listExpenseAccounts(): Promise<QboAccount[]> {
  const connection = await requireConnection();
  if (connection.mode === "demo") return getDemoAccounts();

  const data = await qboFetch<{ QueryResponse: { Account?: QboAccount[] } }>(
    connection.tokens,
    `/query?query=${encodeURIComponent(
      "select * from Account where AccountType in ('Expense','Cost of Goods Sold','Other Expense','Income','Other Income') maxresults 1000",
    )}`,
  );

  return (data.QueryResponse.Account ?? []).filter((a) => a.Active !== false);
}

function normalizePurchase(purchase: QboPurchase): NormalizedTransaction {
  const expenseLine = purchase.Line?.find(
    (line) => line.DetailType === "AccountBasedExpenseLineDetail",
  );
  const account =
    expenseLine?.AccountBasedExpenseLineDetail?.AccountRef ??
    purchase.AccountRef;
  const description =
    expenseLine?.Description ||
    purchase.PrivateNote ||
    purchase.EntityRef?.name ||
    `Purchase ${purchase.Id}`;

  return {
    id: purchase.Id,
    syncToken: purchase.SyncToken,
    source: "Purchase",
    date: purchase.TxnDate,
    amount: -Math.abs(purchase.TotalAmt),
    description,
    vendorName: purchase.EntityRef?.name ?? null,
    currentAccountId: account?.value ?? null,
    currentAccountName: account?.name ?? null,
    isUncategorized: isUncategorizedName(account?.name),
    lineId: expenseLine?.Id,
  };
}

function normalizeDeposit(deposit: QboDeposit): NormalizedTransaction {
  const line = deposit.Line?.[0];
  const account = line?.DepositLineDetail?.AccountRef;
  const description =
    line?.Description ||
    deposit.PrivateNote ||
    line?.DepositLineDetail?.Entity?.name ||
    `Deposit ${deposit.Id}`;

  return {
    id: deposit.Id,
    syncToken: deposit.SyncToken,
    source: "Deposit",
    date: deposit.TxnDate,
    amount: Math.abs(deposit.TotalAmt),
    description,
    vendorName: line?.DepositLineDetail?.Entity?.name ?? null,
    currentAccountId: account?.value ?? null,
    currentAccountName: account?.name ?? null,
    isUncategorized: isUncategorizedName(account?.name),
    lineId: line?.Id,
  };
}

export async function listTransactions(options?: {
  uncategorizedOnly?: boolean;
  startDate?: string;
  endDate?: string;
}): Promise<NormalizedTransaction[]> {
  const connection = await requireConnection();
  if (connection.mode === "demo") {
    let txns = getDemoTransactions();
    if (options?.uncategorizedOnly) {
      txns = txns.filter((t) => t.isUncategorized);
    }
    return txns;
  }

  const start = options?.startDate ?? "2024-01-01";
  const end = options?.endDate ?? new Date().toISOString().slice(0, 10);

  const [purchases, deposits] = await Promise.all([
    qboFetch<{ QueryResponse: { Purchase?: QboPurchase[] } }>(
      connection.tokens,
      `/query?query=${encodeURIComponent(
        `select * from Purchase where MetaData.LastUpdatedTime >= '${start}' maxresults 500`,
      )}`,
    ),
    qboFetch<{ QueryResponse: { Deposit?: QboDeposit[] } }>(
      connection.tokens,
      `/query?query=${encodeURIComponent(
        `select * from Deposit where TxnDate >= '${start}' and TxnDate <= '${end}' maxresults 500`,
      )}`,
    ),
  ]);

  let txns = [
    ...(purchases.QueryResponse.Purchase ?? []).map(normalizePurchase),
    ...(deposits.QueryResponse.Deposit ?? []).map(normalizeDeposit),
  ].sort((a, b) => b.date.localeCompare(a.date));

  if (options?.uncategorizedOnly) {
    txns = txns.filter((t) => t.isUncategorized);
  }

  return txns;
}

export async function applyCategory(params: {
  transactionId: string;
  source: NormalizedTransaction["source"];
  accountId: string;
  accountName: string;
}): Promise<void> {
  const connection = await requireConnection();
  if (connection.mode === "demo") {
    // Demo mode is read-only for writes; categorization is preview-only.
    return;
  }

  if (params.source === "Purchase") {
    const current = await qboFetch<{ Purchase: QboPurchase }>(
      connection.tokens,
      `/purchase/${params.transactionId}`,
    );
    const purchase = current.Purchase;
    const updatedLines = purchase.Line.map((line) => {
      if (line.DetailType !== "AccountBasedExpenseLineDetail") return line;
      return {
        ...line,
        AccountBasedExpenseLineDetail: {
          ...line.AccountBasedExpenseLineDetail!,
          AccountRef: {
            value: params.accountId,
            name: params.accountName,
          },
        },
      };
    });

    await qboFetch(connection.tokens, `/purchase?operation=update`, {
      method: "POST",
      body: JSON.stringify({
        Id: purchase.Id,
        SyncToken: purchase.SyncToken,
        sparse: true,
        Line: updatedLines,
      }),
    });
    return;
  }

  if (params.source === "Deposit") {
    const current = await qboFetch<{ Deposit: QboDeposit }>(
      connection.tokens,
      `/deposit/${params.transactionId}`,
    );
    const deposit = current.Deposit;
    const updatedLines = deposit.Line.map((line) => {
      if (line.DetailType !== "DepositLineDetail") return line;
      return {
        ...line,
        DepositLineDetail: {
          ...line.DepositLineDetail,
          AccountRef: {
            value: params.accountId,
            name: params.accountName,
          },
        },
      };
    });

    await qboFetch(connection.tokens, `/deposit?operation=update`, {
      method: "POST",
      body: JSON.stringify({
        Id: deposit.Id,
        SyncToken: deposit.SyncToken,
        sparse: true,
        Line: updatedLines,
      }),
    });
  }
}

type ReportCol = { value?: string };
type ReportNode = {
  Header?: { ColData?: ReportCol[] };
  Summary?: { ColData?: ReportCol[] };
  ColData?: ReportCol[];
  Rows?: { Row?: ReportNode | ReportNode[] };
  type?: string;
  group?: string;
};

function asRowList(row: ReportNode | ReportNode[] | undefined): ReportNode[] {
  if (!row) return [];
  return Array.isArray(row) ? row : [row];
}

function parsePnLRows(report: Record<string, unknown>): {
  rows: PnLRow[];
  incomeTotal: number;
  expenseTotal: number;
  netIncome: number;
} {
  const rows: PnLRow[] = [];
  let incomeTotal = 0;
  let expenseTotal = 0;
  let netIncome = 0;

  const walk = (node: ReportNode, depth = 0, group?: string) => {
    const header = node.Header;
    const summary = node.Summary;
    const colData = node.ColData;

    if (colData && colData.length >= 2) {
      const label = colData[0]?.value ?? "";
      const amount = Number(colData[1]?.value ?? 0) || 0;
      if (label) rows.push({ label, amount, depth, group });
    }

    const sectionName = header?.ColData?.[0]?.value;
    const nextGroup = sectionName || group;

    if (sectionName) {
      rows.push({
        label: sectionName,
        amount: Number(summary?.ColData?.[1]?.value ?? 0) || 0,
        depth,
        group: nextGroup,
      });
    }

    for (const child of asRowList(node.Rows?.Row)) {
      walk(child, depth + (sectionName ? 1 : 0), nextGroup);
    }

    if (summary?.ColData?.[0]?.value) {
      const label = summary.ColData[0].value ?? "";
      const amount = Number(summary.ColData[1]?.value ?? 0) || 0;
      if (/total income/i.test(label)) incomeTotal = amount;
      if (/total expenses?/i.test(label)) expenseTotal = amount;
      if (/net (operating )?income/i.test(label)) netIncome = amount;
    }
  };

  const root = report.Rows as { Row?: ReportNode | ReportNode[] } | undefined;
  for (const row of asRowList(root?.Row)) walk(row, 0);

  if (!netIncome && (incomeTotal || expenseTotal)) {
    netIncome = incomeTotal - expenseTotal;
  }

  return { rows, incomeTotal, expenseTotal, netIncome };
}

export async function getMonthlyPnL(
  year: number,
  month: number,
): Promise<PnLReport> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = new Date(year, month, 0);
  const endDate = end.toISOString().slice(0, 10);

  const connection = await requireConnection();
  if (connection.mode === "demo") {
    return getDemoPnL(startDate, endDate);
  }

  const report = await qboFetch<Record<string, unknown>>(
    connection.tokens,
    `/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&accounting_method=Accrual`,
  );

  const parsed = parsePnLRows(report);
  const header = report.Header as
    | { ReportName?: string; Currency?: string }
    | undefined;

  return {
    startDate,
    endDate,
    title: header?.ReportName ?? "Profit and Loss",
    currency: header?.Currency ?? "USD",
    ...parsed,
  };
}
