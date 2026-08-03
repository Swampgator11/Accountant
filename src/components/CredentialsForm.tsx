"use client";

import { useState } from "react";

type Props = {
  redirectUri?: string | null;
  environment?: string;
  onSaved?: () => void;
};

export default function CredentialsForm({
  redirectUri,
  environment = "production",
  onSaved,
}: Props) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [env, setEnv] = useState<"sandbox" | "production">(
    environment === "sandbox" ? "sandbox" : "production",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedUri, setSavedUri] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientSecret,
          environment: env,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSavedUri(json.redirectUri ?? null);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const uri = savedUri || redirectUri;

  return (
    <section className="surface mx-auto max-w-xl rounded-2xl p-6 md:p-8">
      <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-sage uppercase">
        Connect your Intuit app
      </p>
      <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
        Add QuickBooks credentials
      </h2>
      <p className="mt-2 text-sm text-ink-soft/75">
        Paste the Client ID and Client Secret from your Intuit Developer app
        (Anarchy Accountant). Then approve access to your company.
      </p>

      <form onSubmit={(e) => void save(e)} className="mt-6 space-y-4">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
            Client ID
          </span>
          <input
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="rounded-md border border-[var(--line)] bg-white px-3 py-2.5 font-mono text-sm"
            placeholder="AB…"
            autoComplete="off"
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
            Client secret
          </span>
          <input
            required
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            className="rounded-md border border-[var(--line)] bg-white px-3 py-2.5 font-mono text-sm"
            placeholder="••••••••"
            autoComplete="off"
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
            Environment
          </span>
          <select
            value={env}
            onChange={(e) =>
              setEnv(e.target.value as "sandbox" | "production")
            }
            className="rounded-md border border-[var(--line)] bg-white px-3 py-2.5"
          >
            <option value="production">Production (live books)</option>
            <option value="sandbox">Sandbox</option>
          </select>
        </label>

        {error ? (
          <div className="rounded-md border border-copper/30 bg-copper/10 px-3 py-2 text-sm text-copper">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-sage px-4 py-3 text-sm font-semibold text-paper hover:bg-sage-bright disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save credentials"}
        </button>
      </form>

      {uri ? (
        <div className="mt-5 rounded-lg border border-[var(--line)] bg-white/50 p-4 text-sm">
          <div className="font-medium text-ink">Redirect URI for Intuit</div>
          <p className="mt-1 text-ink-soft/75">
            In your Intuit app → Keys &amp; credentials → Redirect URIs, add:
          </p>
          <code className="mt-2 block break-all rounded-md bg-ink px-3 py-2 text-xs text-paper">
            {uri}
          </code>
          <a
            href="/api/auth/connect"
            className="btn-connect mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold"
          >
            Sign in with Intuit
            <span aria-hidden="true">→</span>
          </a>
        </div>
      ) : null}
    </section>
  );
}
