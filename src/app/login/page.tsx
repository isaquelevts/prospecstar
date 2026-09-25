"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) window.location.href = "/";
    else setError((await res.json().catch(() => ({}))).error ?? "Não foi possível entrar");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-card p-8 shadow-2xl">
        <p className="font-display text-3xl font-extrabold tracking-tight">
          prospec<span className="text-heat">.</span>
        </p>
        <p className="mt-1 mb-8 text-sm text-mute">Entre para ver seus leads e conversas.</p>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-[13px] font-medium">E-mail</span>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-lg border border-line px-3 text-sm focus:border-cobalt focus:outline-none"
          />
        </label>
        <label className="mb-6 block">
          <span className="mb-1.5 block text-[13px] font-medium">Senha</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full rounded-lg border border-line px-3 text-sm focus:border-cobalt focus:outline-none"
          />
        </label>
        {error && <p className="mb-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        <button disabled={busy} className="h-11 w-full rounded-lg bg-cobalt text-sm font-medium text-white hover:bg-[#1a32c4] disabled:opacity-60">
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
