"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Login failed");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="surface w-full max-w-sm rounded-xl p-6 md:p-8">
        <p className="mb-2 text-center text-xs font-semibold tracking-[0.2em] text-sage uppercase">
          Anarchy Ale Works
        </p>
        <h1 className="mb-6 text-center font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Accountant
        </h1>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" autoComplete="on">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-[var(--line)] bg-white px-3 py-2.5"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
              Password
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-[var(--line)] bg-white px-3 py-2.5"
            />
          </label>
          {error ? (
            <div className="rounded-md border border-copper/30 bg-copper/10 px-3 py-2 text-sm text-copper">
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-sage px-4 py-2.5 text-sm font-semibold text-paper hover:bg-sage-bright disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Log in"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-ink-soft/65">
          Internal QuickBooks categorization
        </p>
      </div>
    </main>
  );
}
