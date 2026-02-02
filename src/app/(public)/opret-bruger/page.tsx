"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Team = { id: string; name: string };

type Role = "LEADER" | "PLAYER" | "SUPPORTER";

export default function SignupPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string>("");
  const [role, setRole] = useState<Role>("PLAYER");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setTeamsError(null);
        const res = await fetch("/api/public/teams", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));

        if (cancelled) return;

        if (!res.ok) {
          setTeams([]);
          setTeamsError(data?.message ?? "Kunne ikke hente hold.");
          return;
        }

        setTeams(data?.teams ?? []);
      } catch {
        if (cancelled) return;
        setTeams([]);
        setTeamsError("Kunne ikke hente hold.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const requiresTeam = useMemo(() => true, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, role, email, username, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "Kunne ikke oprette bruger.");
        return;
      }

      setSuccess(
        role === "LEADER"
          ? "Din leder-bruger afventer admin-godkendelse."
          : "Din bruger afventer godkendelse fra en leder på holdet."
      );

      setEmail("");
      setUsername("");
      setPassword("");

      setTimeout(() => {
        router.push("/login");
      }, 800);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold">Opret bruger</h1>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium">Hold</label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            required={requiresTeam}
          >
            <option value="" disabled>
              Vælg hold
            </option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {teamsError ? <p className="mt-1 text-sm text-red-600">{teamsError}</p> : null}
        </div>

        <div>
          <label className="block text-sm font-medium">Rolle</label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            required
          >
            <option value="LEADER">Leder</option>
            <option value="PLAYER">Spiller</option>
            <option value="SUPPORTER">Supporter</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            type="email"
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Brugernavn</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Kodeord</label>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-green-700">{success}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-[var(--brand)] px-4 py-2 text-[var(--brand-foreground)] disabled:opacity-50"
        >
          {loading ? "Opretter..." : "Opret bruger"}
        </button>
      </form>

      <p className="mt-4 text-sm text-zinc-600">
        Har du allerede en bruger?{" "}
        <a className="underline" href="/login">
          Log ind
        </a>
      </p>
    </main>
  );
}
