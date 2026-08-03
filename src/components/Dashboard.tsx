"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CredentialsForm from "@/components/CredentialsForm";

type AuthStatus = {
  connected: boolean;
  realmId: string | null;
  qboConfigured: boolean;
  demoMode: boolean;
  environment: string;
  redirectUri?: string;
  baseUrl?: string;
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
  source?: "training" | "rule" | "heuristic";
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

type TrainingModel = {
  trainedAt: string;
  historyStartDate: string;
  historyEndDate: string;
  categorizedCount: number;
  patternCount: number;
  patterns: Array<{
    id: string;
    kind: "vendor" | "description";
    displayKey: string;
    accountName: string;
    support: number;
    confidence: number;
  }>;
};

type MorningSettings = {
  enabled: boolean;
  hourLocal: number;
  timezone: string;
  minConfidence: number;
  autoApply: boolean;
  lastRunAt: string | null;
};

type MorningRun = {
  id: string;
  startedAt: string;
  finishedAt: string;
  trained: boolean;
  uncategorizedCount: number;
  suggestedCount: number;
  appliedCount: number;
  skippedLowConfidence: number;
  errors: string[];
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

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Dashboard() {
  const now = new Date();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [model, setModel] = useState<TrainingModel | null>(null);
  const [morning, setMorning] = useState<MorningSettings | null>(null);
  const [runs, setRuns] = useState<MorningRun[]>([]);
  const [report, setReport] = useState<PnLReport | null>(null);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<
    "transactions" | "morning" | "training" | "pnl" | "rules"
  >("transactions");
  const [showSetup, setShowSetup] = useState(false);

  const suggestionMap = useMemo(() => {
    const map = new Map<string, Suggestion>();
    for (const s of suggestions) map.set(s.transactionId, s);
    return map;
  }, [suggestions]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Always load connection status first so the Connect button shows even
      // before QuickBooks OAuth has been completed.
      const statusRes = await fetch("/api/auth/status");
      const statusJson = await statusRes.json();
      if (!statusRes.ok) throw new Error(statusJson.error ?? "Status failed");
      setStatus(statusJson);

      if (!statusJson.connected && !statusJson.demoMode) {
        setTransactions([]);
        setRules([]);
        setReport(null);
        setModel(null);
        setMorning(null);
        setRuns([]);
        setMessage(
          statusJson.qboConfigured
            ? "Credentials are ready. Click Sign in with Intuit to authorize your company."
            : "Add your Intuit Client ID and Secret, then connect QuickBooks.",
        );
        return;
      }

      const [txnRes, rulesRes, pnlRes, trainRes, morningRes] =
        await Promise.all([
          fetch("/api/transactions?uncategorized=1"),
          fetch("/api/rules"),
          fetch(`/api/reports/pnl?year=${year}&month=${month}`),
          fetch("/api/training"),
          fetch("/api/morning"),
        ]);

      const txnJson = await txnRes.json();
      const rulesJson = await rulesRes.json();
      const pnlJson = await pnlRes.json();
      const trainJson = await trainRes.json();
      const morningJson = await morningRes.json();

      if (!txnRes.ok) throw new Error(txnJson.error ?? "Transactions failed");
      if (!rulesRes.ok) throw new Error(rulesJson.error ?? "Rules failed");
      if (!pnlRes.ok) throw new Error(pnlJson.error ?? "P&L failed");
      if (!trainRes.ok) throw new Error(trainJson.error ?? "Training failed");
      if (!morningRes.ok) throw new Error(morningJson.error ?? "Morning failed");

      setTransactions(txnJson.transactions ?? []);
      setRules(rulesJson.rules ?? []);
      setReport(pnlJson.report ?? null);
      setModel(trainJson.model ?? null);
      setMorning(morningJson.settings ?? null);
      setRuns(morningJson.runs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") {
      setMessage("QuickBooks Online connected. Train on past entries, then enable the morning job.");
    }
    if (params.get("error")) {
      setError(params.get("error"));
    }
    if (params.get("setup") === "1") {
      setShowSetup(true);
    }
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (status && !status.qboConfigured && !status.connected) {
      setShowSetup(true);
    }
  }, [status]);

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
        `Suggested categories for ${json.suggestionCount} of ${json.transactionCount} uncategorized transactions${
          json.trainingPatterns
            ? ` using ${json.trainingPatterns} learned patterns`
            : ""
        }.`,
      );
      setTab("transactions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Categorization failed");
    } finally {
      setBusy(null);
    }
  }

  async function trainFromHistory() {
    setBusy("train");
    setError(null);
    try {
      const res = await fetch("/api/training", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Training failed");
      setModel(json.model);
      setMessage(json.message ?? "Training complete.");
      setTab("training");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Training failed");
    } finally {
      setBusy(null);
    }
  }

  async function runMorning() {
    setBusy("morning");
    setError(null);
    try {
      const res = await fetch("/api/morning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retrain: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Morning job failed");
      const result = json.result as MorningRun;
      setSuggestions(json.result?.suggestions ?? []);
      setMessage(
        `Morning run finished: ${result.suggestedCount} suggested, ${result.appliedCount} applied, ${result.skippedLowConfidence} skipped (low confidence).`,
      );
      await refresh();
      setTab("morning");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Morning job failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveMorning() {
    if (!morning) return;
    setBusy("morning-save");
    setError(null);
    try {
      const res = await fetch("/api/morning", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: morning.enabled,
          hourLocal: morning.hourLocal,
          timezone: morning.timezone,
          minConfidence: morning.minConfidence,
          autoApply: morning.autoApply,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setMorning(json.settings);
      setMessage("Morning settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
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

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
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
            Morning books, trained on yours
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-5xl leading-none tracking-tight text-ink md:text-6xl">
            Accountant
          </h1>
          <div className="brand-underline mt-3 h-1 w-40 rounded-full bg-sage" />
          <p className="mt-4 max-w-xl text-base text-ink-soft/80">
            Connect your QuickBooks Online company, learn categories from past
            entries, and auto-categorize what QuickBooks leaves behind each
            morning.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {status?.connected ? (
            <button
              onClick={() => void disconnect()}
              disabled={busy === "disconnect"}
              className="rounded-md border border-[var(--line)] bg-white/60 px-4 py-2.5 text-sm font-medium hover:bg-white"
            >
              Disconnect QBO
            </button>
          ) : null}
          <button
            onClick={() => void logout()}
            className="rounded-md border border-[var(--line)] bg-white/70 px-4 py-2.5 text-sm font-medium hover:bg-white"
          >
            Log out
          </button>
          {status?.connected || status?.demoMode ? (
            <>
              <button
                onClick={() => void trainFromHistory()}
                disabled={busy === "train"}
                className="rounded-md border border-[var(--line)] bg-white/70 px-4 py-2.5 text-sm font-medium hover:bg-white disabled:opacity-40"
              >
                {busy === "train" ? "Training…" : "Train on past entries"}
              </button>
              <button
                onClick={() => void runMorning()}
                disabled={busy === "morning"}
                className="rounded-md bg-sage px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sage-bright disabled:opacity-40"
              >
                {busy === "morning" ? "Running…" : "Run morning job"}
              </button>
            </>
          ) : null}
        </div>
      </header>

      {!status?.connected && !status?.demoMode ? (
        <section className="surface mb-8 rounded-xl p-6 md:p-8">
          <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-sage uppercase">
            Next step
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
            {status?.qboConfigured
              ? "Authorize QuickBooks Online"
              : "Add your Intuit credentials"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft/80">
            {status?.qboConfigured
              ? "Credentials are loaded. Click below to sign in with Intuit and approve access for your company."
              : "Paste your Intuit Client ID and Client Secret, then authorize QuickBooks."}
          </p>
          {status?.qboConfigured ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a
                href="/api/auth/connect"
                className="btn-connect inline-flex items-center gap-2 rounded-md px-5 py-3 text-sm font-semibold shadow-sm"
              >
                Sign in with Intuit
                <span aria-hidden="true">→</span>
              </a>
              <button
                onClick={() => setShowSetup(true)}
                className="rounded-md border border-[var(--line)] bg-white/70 px-4 py-3 text-sm font-medium hover:bg-white"
              >
                Edit credentials
              </button>
            </div>
          ) : (
            <div className="mt-5">
              <button
                onClick={() => setShowSetup(true)}
                className="inline-flex rounded-md bg-[#0d2a2e] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1d4348]"
              >
                Add credentials
              </button>
            </div>
          )}
          {status?.redirectUri ? (
            <div className="mt-5 space-y-2 text-xs text-ink-soft/80">
              <p>
                Intuit Redirect URI must be exactly:{" "}
                <code className="rounded bg-white/70 px-1.5 py-0.5 text-[11px]">
                  {status.redirectUri}
                </code>
              </p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>
                  In Intuit Developer → your app →{" "}
                  <strong>Keys &amp; credentials</strong> → Redirect URIs, add
                  the URI above (not only Host domain / Launch / Disconnect).
                </li>
                <li>
                  Use{" "}
                  <strong>
                    {status.environment === "sandbox"
                      ? "Development"
                      : "Production"}
                  </strong>{" "}
                  keys to match this app&apos;s{" "}
                  <strong>{status.environment}</strong> setting.
                </li>
                <li>
                  Give the Intuit app a display name (blank names show as
                  &quot;undefined didn&apos;t connect&quot;).
                </li>
                <li>
                  Click <strong>Sign in with Intuit</strong> above and approve
                  access for your company.
                </li>
              </ol>
            </div>
          ) : null}
        </section>
      ) : null}

      {(showSetup || (!status?.qboConfigured && !status?.connected)) &&
      !status?.connected ? (
        <div className="mb-8">
          <CredentialsForm
            redirectUri={status?.redirectUri}
            environment={status?.environment}
            onSaved={() => {
              setMessage(
                "Credentials saved. Click Sign in with Intuit to authorize your company.",
              );
              setShowSetup(false);
              void refresh();
            }}
          />
        </div>
      ) : null}

      <section className="animate-rise-delay mb-6 grid gap-3 md:grid-cols-4">
        <Stat
          label="Connection"
          value={
            status?.connected
              ? "Live QBO"
              : status?.demoMode
                ? "Demo mode"
                : status?.qboConfigured
                  ? "Ready to connect"
                  : "Not configured"
          }
          detail={
            status?.connected
              ? `Company ${status.realmId}`
              : status?.qboConfigured
                ? `${status.environment} credentials loaded`
                : "Add Intuit app credentials"
          }
        />
        <Stat
          label="Uncategorized"
          value={String(transactions.length)}
          detail="Left by QuickBooks"
        />
        <Stat
          label="Training"
          value={model ? String(model.patternCount) : "—"}
          detail={
            model
              ? `${model.categorizedCount} past entries`
              : "Train to learn your books"
          }
        />
        <Stat
          label="Last morning run"
          value={formatWhen(morning?.lastRunAt)}
          detail={
            morning?.enabled
              ? `Auto-apply ≥ ${Math.round((morning?.minConfidence ?? 0.8) * 100)}%`
              : "Morning job disabled"
          }
        />
      </section>

      {(message || error) && status?.connected ? (
        <div
          className={`mb-5 rounded-md border px-4 py-3 text-sm ${
            error
              ? "border-copper/30 bg-copper/10 text-copper"
              : "border-sage/30 bg-sage/10 text-sage"
          }`}
        >
          {error ?? message}
        </div>
      ) : null}

      <nav className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["transactions", "Transactions"],
            ["morning", "Morning job"],
            ["training", "Training"],
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
                Suggestions prefer learned history, then your rules, then
                heuristics.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void runCategorize()}
                disabled={busy === "categorize"}
                className="rounded-md border border-[var(--line)] bg-white/70 px-4 py-2 text-sm font-medium"
              >
                {busy === "categorize" ? "Categorizing…" : "Suggest categories"}
              </button>
              <button
                onClick={() => void applySelected()}
                disabled={busy === "apply" || suggestions.length === 0}
                className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-paper disabled:opacity-40"
              >
                {busy === "apply" ? "Applying…" : "Apply selected"}
              </button>
            </div>
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
                                {suggestion.source ?? "rule"} ·{" "}
                                {suggestion.reason}
                              </div>
                            </div>
                          ) : (
                            <span className="text-ink-soft/60">
                              Suggest or run morning job
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
      ) : tab === "morning" && morning ? (
        <section className="surface rounded-xl p-5 md:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl">
                Morning categorization
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-ink-soft/75">
                Each morning the app retrains on your categorized history, finds
                entries QuickBooks left uncategorized, and writes high-confidence
                categories back to your company.
              </p>
            </div>
            <button
              onClick={() => void runMorning()}
              disabled={busy === "morning"}
              className="rounded-md bg-sage px-4 py-2 text-sm font-semibold text-paper"
            >
              {busy === "morning" ? "Running…" : "Run now"}
            </button>
          </div>

          <div className="mb-6 grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-white/50 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={morning.enabled}
                onChange={(e) =>
                  setMorning({ ...morning, enabled: e.target.checked })
                }
              />
              Enable morning job
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-white/50 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={morning.autoApply}
                onChange={(e) =>
                  setMorning({ ...morning, autoApply: e.target.checked })
                }
              />
              Auto-apply to QuickBooks
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
                Local hour (for cron docs)
              </span>
              <input
                type="number"
                min={0}
                max={23}
                value={morning.hourLocal}
                onChange={(e) =>
                  setMorning({
                    ...morning,
                    hourLocal: Number(e.target.value),
                  })
                }
                className="rounded-md border border-[var(--line)] bg-white/70 px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
                Timezone
              </span>
              <input
                value={morning.timezone}
                onChange={(e) =>
                  setMorning({ ...morning, timezone: e.target.value })
                }
                className="rounded-md border border-[var(--line)] bg-white/70 px-3 py-2"
                placeholder="America/Chicago"
              />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
                Minimum confidence to auto-apply (
                {Math.round(morning.minConfidence * 100)}%)
              </span>
              <input
                type="range"
                min={0.5}
                max={0.98}
                step={0.01}
                value={morning.minConfidence}
                onChange={(e) =>
                  setMorning({
                    ...morning,
                    minConfidence: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>

          <button
            onClick={() => void saveMorning()}
            disabled={busy === "morning-save"}
            className="mb-8 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper"
          >
            {busy === "morning-save" ? "Saving…" : "Save settings"}
          </button>

          <div className="mb-4 rounded-lg border border-[var(--line)] bg-white/40 p-4 text-sm text-ink-soft">
            <div className="font-medium text-ink">Schedule with cron</div>
            <p className="mt-1">
              Keep the app running, set <code>CRON_SECRET</code> in{" "}
              <code>.env.local</code>, then schedule:
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-ink px-3 py-3 text-xs text-paper">
{`0 ${morning.hourLocal} * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" \\
  $APP_BASE_URL/api/morning/run`}
            </pre>
            <p className="mt-2 text-xs">
              Or use <code>scripts/morning-run.sh</code> from this repo.
            </p>
          </div>

          <h3 className="mb-2 font-[family-name:var(--font-display)] text-xl">
            Recent runs
          </h3>
          {runs.length === 0 ? (
            <p className="text-sm text-ink-soft/70">No morning runs yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--line)]">
              <table className="min-w-full text-sm">
                <thead className="bg-paper-deep/60 text-xs tracking-wide text-ink-soft uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">When</th>
                    <th className="px-4 py-3 text-left">Uncategorized</th>
                    <th className="px-4 py-3 text-left">Suggested</th>
                    <th className="px-4 py-3 text-left">Applied</th>
                    <th className="px-4 py-3 text-left">Skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      className="border-t border-[var(--line)]"
                    >
                      <td className="px-4 py-3">{formatWhen(run.startedAt)}</td>
                      <td className="px-4 py-3">{run.uncategorizedCount}</td>
                      <td className="px-4 py-3">{run.suggestedCount}</td>
                      <td className="px-4 py-3">{run.appliedCount}</td>
                      <td className="px-4 py-3">{run.skippedLowConfidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : tab === "training" ? (
        <section className="surface rounded-xl p-5 md:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl">
                Training from past entries
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-ink-soft/75">
                Pulls already-categorized purchases and deposits from QuickBooks
                and learns merchant → account mappings. Those patterns drive the
                morning job.
              </p>
            </div>
            <button
              onClick={() => void trainFromHistory()}
              disabled={busy === "train"}
              className="rounded-md bg-sage px-4 py-2 text-sm font-semibold text-paper"
            >
              {busy === "train" ? "Training…" : "Retrain now"}
            </button>
          </div>

          {model ? (
            <>
              <div className="mb-5 grid gap-3 md:grid-cols-3">
                <Stat
                  label="Past entries"
                  value={String(model.categorizedCount)}
                />
                <Stat label="Patterns" value={String(model.patternCount)} />
                <Stat
                  label="Last trained"
                  value={formatWhen(model.trainedAt)}
                  detail={`${model.historyStartDate} → ${model.historyEndDate}`}
                />
              </div>
              <div className="overflow-hidden rounded-lg border border-[var(--line)]">
                <table className="min-w-full text-sm">
                  <thead className="bg-paper-deep/60 text-xs tracking-wide text-ink-soft uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Match</th>
                      <th className="px-4 py-3 text-left">Kind</th>
                      <th className="px-4 py-3 text-left">Account</th>
                      <th className="px-4 py-3 text-left">Support</th>
                      <th className="px-4 py-3 text-left">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.patterns.slice(0, 40).map((p) => (
                      <tr
                        key={p.id}
                        className="border-t border-[var(--line)]"
                      >
                        <td className="px-4 py-3 font-medium">{p.displayKey}</td>
                        <td className="px-4 py-3 capitalize">{p.kind}</td>
                        <td className="px-4 py-3">{p.accountName}</td>
                        <td className="px-4 py-3">{p.support}</td>
                        <td className="px-4 py-3">
                          {Math.round(p.confidence * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-soft/70">
              No training model yet. Click <strong>Retrain now</strong> after
              connecting QuickBooks (or use demo history).
            </p>
          )}
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
                  detail={monthLabel(year, month)}
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
                Fallback patterns when training has not seen a merchant yet.
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
        Paste your Intuit Client ID / Secret on the credentials screen, add the
        shown Redirect URI in your Intuit app, then click{" "}
        <strong>Sign in with Intuit</strong>. On Vercel, morning runs via the
        scheduled cron job.
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
