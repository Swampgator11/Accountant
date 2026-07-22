"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AuthStatus = {
  connected: boolean;
  realmId: string | null;
  qboConfigured: boolean;
  demoMode: boolean;
  environment: string;
};

type Transaction = {
  id: string;
  source: string;
  date: string;
  amount: number;
  description: string;
  vendorName: string | null;
  currentAccountName: string | null;
  isUncategorized: boolean;
};

type Suggestion = {
  transactionId: string;
  accountId: string;
  accountName: string;
  confidence: number;
  ruleLabel: string | null;
  reason: string;
};

type Rule = {
  id: string;
  label: string;
  pattern: string;
  matchField: "description" | "vendor" | "any";
  accountId: string;
  accountName: string;
  priority: number;
  enabled: boolean;
};

type PnLReport = {
  startDate: string;
  endDate: string;
  title: string;
  currency: string;
  rows: Array<{ label: string; amount: number; depth: number; group?: string }>;
  incomeTotal: number;
  expenseTotal: number;
  netIncome: number;
};

function money(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(n);
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export default function Dashboard() {
  const now = new Date();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [report, setReport] = useState<PnLReport | null>(null);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"transactions" | "pnl" | "rules">(
    "transactions",
  );

  const suggestionMap = useMemo(() => {
    const map = new Map<string, Suggestion>();
    for (const s of suggestions) map.set(s.transactionId, s);
    return map;
  }, [suggestions]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, txnRes, rulesRes, pnlRes] = await Promise.all([
        fetch("/api/auth/status"),
        fetch("/api/transactions?uncategorized=1"),
        fetch("/api/rules"),
        fetch(`/api/reports/pnl?year=${year}&month=${month}`),
      ]);

      const statusJson = await statusRes.json();
      const txnJson = await txnRes.json();
      const rulesJson = await rulesRes.json();
      const pnlJson = await pnlRes.json();

      if (!statusRes.ok) throw new Error(statusJson.error ?? "Status failed");
      if (!txnRes.ok) throw new Error(txnJson.error ?? "Transactions failed");
      if (!rulesRes.ok) throw new Error(rulesJson.error ?? "Rules failed");
      if (!pnlRes.ok) throw new Error(pnlJson.error ?? "P&L failed");

      setStatus(statusJson);
      setTransactions(txnJson.transactions ?? []);
      setRules(rulesJson.rules ?? []);
      setReport(pnlJson.report ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") {
      setMessage("QuickBooks Online connected.");
    }
    if (params.get("error")) {
      setError(params.get("error"));
    }
    void refresh();
  }, [refresh]);

  async function runCategorize() {
    setBusy("categorize");
    setError(null);
    try {
      const res = await fetch("/api/transactions/categorize", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Categorization failed");
      setSuggestions(json.suggestions ?? []);
      const next: Record<string, boolean> = {};
      for (const s of json.suggestions ?? []) {
        if (s.confidence >= 0.7) next[s.transactionId] = true;
      }
      setSelected(next);
      setMessage(
        `Suggested categories for ${json.suggestionCount} of ${json.transactionCount} uncategorized transactions.`,
      );
      setTab("transactions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Categorization failed");
    } finally {
      setBusy(null);
    }
  }

  async function applySelected() {
    const items = Object.entries(selected)
      .filter(([, on]) => on)
      .map(([transactionId]) => {
        const suggestion = suggestionMap.get(transactionId);
        if (!suggestion) return null;
        return {
          transactionId,
          accountId: suggestion.accountId,
          accountName: suggestion.accountName,
        };
      })
      .filter(Boolean) as Array<{
      transactionId: string;
      accountId: string;
      accountName: string;
    }>;

    if (items.length === 0) {
      setError("Select at least one suggested categorization.");
      return;
    }

    setBusy("apply");
    setError(null);
    try {
      const res = await fetch("/api/transactions/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Apply failed");
      const okCount = (json.results ?? []).filter(
        (r: { ok: boolean }) => r.ok,
      ).length;
      setMessage(
        status?.demoMode
          ? `Previewed ${okCount} categorizations in demo mode. Connect QuickBooks to write them back.`
          : `Applied ${okCount} categories in QuickBooks.`,
      );
      setSuggestions([]);
      setSelected({});
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    await fetch("/api/auth/disconnect", { method: "POST" });
    setMessage("Disconnected from QuickBooks.");
    setBusy(null);
    await refresh();
  }

  async function saveRules() {
    setBusy("rules");
    try {
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setRules(json.rules);
      setMessage("Rules saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function loadPnL() {
    setBusy("pnl");
    try {
      const res = await fetch(`/api/reports/pnl?year=${year}&month=${month}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "P&L failed");
      setReport(json.report);
      setTab("pnl");
    } catch (err) {
      setError(err instanceof Error ? err.message : "P&L failed");
    } finally {
      setBusy(null);
    }
  }

  function exportPnL() {
    if (!report) return;
    const lines = [
      `${report.title},${report.startDate},${report.endDate}`,
      "Label,Amount",
      ...report.rows.map((r) => `"${r.label}",${r.amount}`),
      `Income Total,${report.incomeTotal}`,
      `Expense Total,${report.expenseTotal}`,
      `Net Income,${report.netIncome}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pnl-${report.startDate}-${report.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 pb-16 pt-8 md:px-8">
      <header className="animate-rise mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.22em] text-sage uppercase">
            Books that keep themselves
          </p>
          <h1
            className="font-[family-name:var(--font-display)] text-5xl leading-none tracking-tight text-ink md:text-6xl"
          >
            Accountant
          </h1>
          <div className="brand-underline mt-3 h-1 w-40 rounded-full bg-sage" />
          <p className="mt-4 max-w-xl text-base text-ink-soft/80">
            Connect QuickBooks Online, auto-categorize bank activity with rules,
            and pull a clean monthly profit &amp; loss.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {status?.connected ? (
            <button
              onClick={() => void disconnect()}
              disabled={busy === "disconnect"}
              className="rounded-md border border-[var(--line)] bg-white/60 px-4 py-2.5 text-sm font-medium hover:bg-white"
            >
              Disconnect
            </button>
          ) : (
            <a
              href="/api/auth/connect"
              className="rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition hover:bg-ink-soft"
            >
              Connect QuickBooks
            </a>
          )}
          <button
            onClick={() => void runCategorize()}
            disabled={busy === "categorize"}
            className="rounded-md bg-sage px-4 py-2.5 text-sm font-semibold text-paper transition hover:bg-sage-bright"
          >
            {busy === "categorize" ? "Categorizing…" : "Auto-categorize"}
          </button>
        </div>
      </header>

      <section className="animate-rise-delay mb-6 grid gap-3 md:grid-cols-3">
        <Stat
          label="Connection"
          value={
            status?.connected
              ? "Live QBO"
              : status?.demoMode
                ? "Demo mode"
                : "Not connected"
          }
          detail={
            status?.connected
              ? `Company ${status.realmId}`
              : status?.qboConfigured
                ? `${status.environment} ready`
                : "Add Intuit app credentials"
          }
        />
        <Stat
          label="Uncategorized"
          value={String(transactions.length)}
          detail="Ready for review"
        />
        <Stat
          label={monthLabel(year, month)}
          value={report ? money(report.netIncome, report.currency) : "—"}
          detail="Net income"
        />
      </section>

      {(message || error) && (
        <div
          className={`mb-5 rounded-md border px-4 py-3 text-sm ${
            error
              ? "border-copper/30 bg-copper/10 text-copper"
              : "border-sage/30 bg-sage/10 text-sage"
          }`}
        >
          {error ?? message}
        </div>
      )}

      <nav className="mb-4 flex gap-2">
        {(
          [
            ["transactions", "Transactions"],
            ["pnl", "Monthly P&L"],
            ["rules", "Rules"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === id
                ? "bg-ink text-paper"
                : "bg-white/50 text-ink-soft hover:bg-white"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="surface rounded-xl p-10 text-center text-ink-soft">
          Loading your books…
        </div>
      ) : tab === "transactions" ? (
        <section className="surface overflow-hidden rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl">
                Uncategorized activity
              </h2>
              <p className="text-sm text-ink-soft/75">
                Review suggestions, then apply them to QuickBooks.
              </p>
            </div>
            <button
              onClick={() => void applySelected()}
              disabled={busy === "apply" || suggestions.length === 0}
              className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-paper disabled:opacity-40"
            >
              {busy === "apply" ? "Applying…" : "Apply selected"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-paper-deep/60 text-xs tracking-wide text-ink-soft uppercase">
                <tr>
                  <th className="px-4 py-3">Use</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Suggested category</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-ink-soft"
                    >
                      No uncategorized transactions found.
                    </td>
                  </tr>
                ) : (
                  transactions.map((txn) => {
                    const suggestion = suggestionMap.get(txn.id);
                    return (
                      <tr
                        key={txn.id}
                        className="border-t border-[var(--line)] align-top"
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            disabled={!suggestion}
                            checked={Boolean(selected[txn.id])}
                            onChange={(e) =>
                              setSelected((prev) => ({
                                ...prev,
                                [txn.id]: e.target.checked,
                              }))
                            }
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {txn.date}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{txn.description}</div>
                          <div className="text-xs text-ink-soft/70">
                            {txn.vendorName ?? "No vendor"} ·{" "}
                            {txn.currentAccountName ?? "Uncategorized"}
                          </div>
                        </td>
                        <td
                          className={`px-4 py-3 font-semibold whitespace-nowrap ${
                            txn.amount >= 0 ? "money-pos" : "money-neg"
                          }`}
                        >
                          {money(txn.amount)}
                        </td>
                        <td className="px-4 py-3">
                          {suggestion ? (
                            <div>
                              <div className="font-medium">
                                {suggestion.accountName}
                              </div>
                              <div className="text-xs text-ink-soft/70">
                                {Math.round(suggestion.confidence * 100)}% ·{" "}
                                {suggestion.reason}
                              </div>
                            </div>
                          ) : (
                            <span className="text-ink-soft/60">
                              Run auto-categorize
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : tab === "pnl" ? (
        <section className="surface rounded-xl p-5 md:p-6">
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl">
                Monthly profit &amp; loss
              </h2>
              <p className="text-sm text-ink-soft/75">
                Pull the official QuickBooks P&amp;L for any month.
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="rounded-md border border-[var(--line)] bg-white/70 px-3 py-2"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i, 1).toLocaleString("en-US", {
                      month: "long",
                    })}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-24 rounded-md border border-[var(--line)] bg-white/70 px-3 py-2"
              />
              <button
                onClick={() => void loadPnL()}
                className="rounded-md bg-sage px-4 py-2 text-sm font-semibold text-paper"
              >
                {busy === "pnl" ? "Loading…" : "Generate"}
              </button>
              <button
                onClick={exportPnL}
                disabled={!report}
                className="rounded-md border border-[var(--line)] bg-white/70 px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                Export CSV
              </button>
            </div>
          </div>

          {report && (
            <>
              <div className="mb-5 grid gap-3 md:grid-cols-3">
                <Stat
                  label="Income"
                  value={money(report.incomeTotal, report.currency)}
                />
                <Stat
                  label="Expenses"
                  value={money(report.expenseTotal, report.currency)}
                />
                <Stat
                  label="Net income"
                  value={money(report.netIncome, report.currency)}
                />
              </div>
              <div className="overflow-hidden rounded-lg border border-[var(--line)]">
                <table className="min-w-full text-sm">
                  <tbody>
                    {report.rows.map((row, idx) => (
                      <tr
                        key={`${row.label}-${idx}`}
                        className="border-t border-[var(--line)] first:border-t-0"
                      >
                        <td
                          className="px-4 py-2.5"
                          style={{ paddingLeft: `${16 + row.depth * 16}px` }}
                        >
                          {row.label}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                          {money(row.amount, report.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="surface rounded-xl p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl">
                Categorization rules
              </h2>
              <p className="text-sm text-ink-soft/75">
                Patterns match vendor or description text, then map to a chart
                of accounts category.
              </p>
            </div>
            <button
              onClick={() => void saveRules()}
              className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper"
            >
              {busy === "rules" ? "Saving…" : "Save rules"}
            </button>
          </div>

          <div className="space-y-3">
            {rules.map((rule, index) => (
              <div
                key={rule.id}
                className="grid gap-2 rounded-lg border border-[var(--line)] bg-white/50 p-3 md:grid-cols-[1fr_1.2fr_1fr_auto]"
              >
                <input
                  value={rule.label}
                  onChange={(e) => {
                    const next = [...rules];
                    next[index] = { ...rule, label: e.target.value };
                    setRules(next);
                  }}
                  className="rounded-md border border-[var(--line)] bg-white px-3 py-2"
                  placeholder="Label"
                />
                <input
                  value={rule.pattern}
                  onChange={(e) => {
                    const next = [...rules];
                    next[index] = { ...rule, pattern: e.target.value };
                    setRules(next);
                  }}
                  className="rounded-md border border-[var(--line)] bg-white px-3 py-2 font-mono text-xs"
                  placeholder="Regex pattern"
                />
                <input
                  value={rule.accountName}
                  onChange={(e) => {
                    const next = [...rules];
                    next[index] = { ...rule, accountName: e.target.value };
                    setRules(next);
                  }}
                  className="rounded-md border border-[var(--line)] bg-white px-3 py-2"
                  placeholder="Account name"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => {
                      const next = [...rules];
                      next[index] = { ...rule, enabled: e.target.checked };
                      setRules(next);
                    }}
                  />
                  On
                </label>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-10 text-sm text-ink-soft/65">
        Setup: create an Intuit Developer app, set{" "}
        <code className="rounded bg-white/60 px-1">QBO_CLIENT_ID</code> /{" "}
        <code className="rounded bg-white/60 px-1">QBO_CLIENT_SECRET</code>, then
        connect. Demo mode works without credentials.
      </footer>
    </main>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="surface rounded-xl px-4 py-4">
      <div className="text-xs font-semibold tracking-[0.16em] text-sage uppercase">
        {label}
      </div>
      <div className="mt-2 font-[family-name:var(--font-display)] text-2xl tracking-tight">
        {value}
      </div>
      {detail ? (
        <div className="mt-1 text-xs text-ink-soft/70">{detail}</div>
      ) : null}
    </div>
  );
}
