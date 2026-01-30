"use client";

import { useEffect, useState, type FormEvent } from "react";

type PendingLeaderMembership = {
  id: string;
  userId: string;
  email: string;
  username: string;
  teamName: string;
  createdAt: string;
};

type TeamColor = "RED" | "WHITE" | "BLACK" | "BLUE" | "GREEN";

const colorLabels: Record<TeamColor, string> = {
  RED: "Rød",
  WHITE: "Hvid",
  BLACK: "Sort",
  BLUE: "Blå",
  GREEN: "Grøn",
};

type TeamListItem = {
  id: string;
  name: string;
  logoUrl: string | null;
  themePrimary: TeamColor;
  themeSecondary: TeamColor | "WHITE" | "BLACK";
  createdAt: string;
  updatedAt: string;
};

type MembershipRow = {
  id: string;
  userId: string;
  username: string;
  email: string;
  role: "LEADER" | "PLAYER" | "SUPPORTER";
  status: "PENDING_ADMIN" | "PENDING_LEADER" | "APPROVED" | "REJECTED";
  createdAt: string;
  approvedAt: string | null;
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"MEMBERS" | "TEAMS">("MEMBERS");

  const [teamName, setTeamName] = useState("");
  const [teamLogoUrl, setTeamLogoUrl] = useState("");
  const [themePrimary, setThemePrimary] = useState<TeamColor>("RED");
  const [themeSecondary, setThemeSecondary] = useState<"WHITE" | "BLACK">("WHITE");
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamSuccess, setTeamSuccess] = useState<string | null>(null);

  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [editPrimary, setEditPrimary] = useState<TeamColor>("RED");
  const [editSecondary, setEditSecondary] = useState<"WHITE" | "BLACK">("WHITE");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const [deleteAdminCode, setDeleteAdminCode] = useState("");
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingLeaderMembership[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);

  const [members, setMembers] = useState<MembershipRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  async function loadPending() {
    setLoadingPending(true);
    setPendingError(null);

    try {
      const res = await fetch("/api/admin/pending-leaders", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPendingError(data?.message ?? "Kunne ikke hente afventende ledere.");
        setPending([]);
        return;
      }

      const memberships = (data?.memberships ?? []) as PendingLeaderMembership[];
      memberships.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPending(memberships);
    } finally {
      setLoadingPending(false);
    }
  }

  async function loadTeams() {
    setTeamsLoading(true);
    setTeamsError(null);

    try {
      const res = await fetch("/api/admin/teams", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTeams([]);
        setTeamsError(data?.message ?? "Kunne ikke hente hold.");
        return;
      }

      setTeams((data?.teams ?? []) as TeamListItem[]);
    } finally {
      setTeamsLoading(false);
    }
  }

  async function loadMembers() {
    setMembersLoading(true);
    setMembersError(null);

    try {
      const res = await fetch("/api/admin/memberships", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMembers([]);
        setMembersError(data?.message ?? "Kunne ikke hente medlemmer.");
        return;
      }

      setMembers((data?.memberships ?? []) as MembershipRow[]);
    } finally {
      setMembersLoading(false);
    }
  }

  useEffect(() => {
    loadPending();
    loadMembers();
    loadTeams();
  }, []);

  async function createTeam(e: FormEvent) {
    e.preventDefault();
    setTeamError(null);
    setTeamSuccess(null);

    const name = teamName.trim();
    if (!name) {
      setTeamError("Holdnavn mangler.");
      return;
    }

    const res = await fetch("/api/admin/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        logoUrl: teamLogoUrl.trim(),
        themePrimary,
        themeSecondary,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTeamError(data?.message ?? "Kunne ikke oprette hold.");
      return;
    }

    const created = data?.team as { id: string; name: string } | undefined;
    setTeamSuccess(created ? `Hold oprettet: ${created.name}` : "Hold oprettet.");
    setTeamName("");
    setTeamLogoUrl("");
    await loadTeams();
  }

  function startEditTeam(t: TeamListItem) {
    setEditError(null);
    setEditSuccess(null);
    setEditingTeamId(t.id);
    setEditName(t.name);
    setEditLogoUrl(t.logoUrl ?? "");
    setEditPrimary(t.themePrimary);
    setEditSecondary(((t.themeSecondary as any) ?? "WHITE") as "WHITE" | "BLACK");
    setDeletingTeamId(null);
    setDeleteError(null);
  }

  function cancelEditTeam() {
    setEditingTeamId(null);
    setEditName("");
    setEditLogoUrl("");
    setEditPrimary("RED");
    setEditSecondary("WHITE");
    setEditError(null);
  }

  async function saveTeam(teamId: string) {
    setEditError(null);
    setEditSuccess(null);

    const res = await fetch(`/api/admin/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim(),
        logoUrl: editLogoUrl.trim(),
        themePrimary: editPrimary,
        themeSecondary: editSecondary,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEditError(data?.message ?? "Kunne ikke opdatere hold.");
      return;
    }

    setEditSuccess("Hold opdateret.");
    setEditingTeamId(null);
    await loadTeams();
  }

  function startDeleteTeam(teamId: string) {
    setDeletingTeamId(teamId);
    setDeleteAdminCode("");
    setDeleteConfirmName("");
    setDeleteError(null);
    setEditingTeamId(null);
    setEditError(null);
    setEditSuccess(null);
  }

  async function confirmDeleteTeam(teamId: string) {
    setDeleteError(null);
    const res = await fetch(`/api/admin/teams/${teamId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminCode: deleteAdminCode,
        confirmName: deleteConfirmName,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDeleteError(data?.message ?? "Kunde ikke slette hold.");
      return;
    }

    setDeletingTeamId(null);
    setDeleteAdminCode("");
    setDeleteConfirmName("");
    await loadTeams();
  }

  async function approveLeader(membershipId: string, approve: boolean) {
    const res = await fetch("/api/admin/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membershipId, approve }),
    });

    if (res.ok) {
      await loadPending();
      await loadMembers();
    } else {
      const data = await res.json().catch(() => ({}));
      setPendingError(data?.message ?? "Kunne ikke opdatere bruger.");
    }
  }

  async function deleteMembership(membershipId: string) {
    setMembersError(null);
    const res = await fetch(`/api/admin/memberships/${membershipId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMembersError(data?.message ?? "Kunne ikke slette medlem.");
      return;
    }

    await loadMembers();
  }

  return (
    <main className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-2 text-sm text-zinc-600">Opret hold og godkend leder-brugere.</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("MEMBERS")}
            className={
              activeTab === "MEMBERS"
                ? "inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white"
                : "inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
            }
          >
            Medlemmer
            {pending.length > 0 ? (
              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                {pending.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("TEAMS")}
            className={
              activeTab === "TEAMS"
                ? "inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white"
                : "inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
            }
          >
            Hold
          </button>
        </div>
      </section>

      {activeTab === "MEMBERS" ? (
        <>
          <section className="rounded-md border bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Afventende ledere</h2>
              <button
                type="button"
                onClick={loadPending}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                disabled={loadingPending}
              >
                Opdater
              </button>
            </div>

            {pendingError ? <p className="mt-2 text-sm text-red-600">{pendingError}</p> : null}

            {pending.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">Ingen afventende leder-brugere.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {pending.map((u) => (
                  <div
                    key={u.id}
                    className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="text-sm">
                      <div className="font-medium">{u.username}</div>
                      <div className="text-zinc-600">{u.email} • {u.teamName}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => approveLeader(u.id, true)}
                        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white"
                      >
                        Godkend
                      </button>
                      <button
                        type="button"
                        onClick={() => approveLeader(u.id, false)}
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                      >
                        Afvis
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-md border bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Medlemmer (valgt hold)</h2>
              <button
                type="button"
                onClick={loadMembers}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                disabled={membersLoading}
              >
                Opdater
              </button>
            </div>

            {membersError ? <p className="mt-2 text-sm text-red-600">{membersError}</p> : null}

            {members.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">Ingen medlemmer.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="text-sm">
                      <div className="font-medium">{m.username}</div>
                      <div className="text-zinc-600">{m.email} • {m.role} • {m.status}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => deleteMembership(m.id)}
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                      >
                        Slet
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="rounded-md border bg-white p-4">
            <h2 className="text-lg font-semibold">Opret hold</h2>
            <form onSubmit={createTeam} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input
                className="sm:col-span-2 rounded-md border border-zinc-300 px-3 py-2"
                placeholder="Holdnavn"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
              <input
                className="sm:col-span-2 rounded-md border border-zinc-300 px-3 py-2"
                placeholder="Logo URL (valgfri)"
                value={teamLogoUrl}
                onChange={(e) => setTeamLogoUrl(e.target.value)}
              />
              <select
                className="rounded-md border border-zinc-300 bg-white px-3 py-2"
                value={themePrimary}
                onChange={(e) => setThemePrimary(e.target.value as TeamColor)}
              >
                {Object.entries(colorLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    Primær: {label}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border border-zinc-300 bg-white px-3 py-2"
                value={themeSecondary}
                onChange={(e) => setThemeSecondary(e.target.value as "WHITE" | "BLACK")}
              >
                <option value="WHITE">Sekundær: {colorLabels.WHITE}</option>
                <option value="BLACK">Sekundær: {colorLabels.BLACK}</option>
              </select>
              <button className="sm:col-span-4 rounded-md bg-[var(--brand)] px-4 py-2 text-[var(--brand-foreground)]">
                Opret
              </button>
            </form>
            {teamError ? <p className="mt-2 text-sm text-red-600">{teamError}</p> : null}
            {teamSuccess ? <p className="mt-2 text-sm text-green-700">{teamSuccess}</p> : null}
          </section>

          <section className="rounded-md border bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Hold</h2>
              <button
                type="button"
                onClick={loadTeams}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                disabled={teamsLoading}
              >
                Opdater
              </button>
            </div>

            {teamsError ? <p className="mt-2 text-sm text-red-600">{teamsError}</p> : null}
            {editError ? <p className="mt-2 text-sm text-red-600">{editError}</p> : null}
            {editSuccess ? <p className="mt-2 text-sm text-green-700">{editSuccess}</p> : null}
            {deleteError ? <p className="mt-2 text-sm text-red-600">{deleteError}</p> : null}

            {teams.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">Ingen hold.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {teams.map((t) => {
                  const isEditing = editingTeamId === t.id;
                  const isDeleting = deletingTeamId === t.id;
                  const themeSecondaryValue = ((t.themeSecondary as any) ?? "WHITE") as "WHITE" | "BLACK";

                  return (
                    <div key={t.id} className="rounded-md border border-zinc-200 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            {t.logoUrl ? (
                              <img
                                src={t.logoUrl}
                                alt="Logo"
                                className="h-9 w-9 rounded-md bg-white object-contain p-1"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : null}
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">{t.name}</div>
                              <div className="text-xs text-zinc-600">{t.themePrimary} / {themeSecondaryValue}</div>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEditTeam(t)}
                            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                          >
                            Rediger
                          </button>
                          <button
                            type="button"
                            onClick={() => startDeleteTeam(t.id)}
                            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700"
                          >
                            Slet
                          </button>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                          <input
                            className="sm:col-span-2 rounded-md border border-zinc-300 px-3 py-2"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Holdnavn"
                          />
                          <input
                            className="sm:col-span-2 rounded-md border border-zinc-300 px-3 py-2"
                            value={editLogoUrl}
                            onChange={(e) => setEditLogoUrl(e.target.value)}
                            placeholder="Logo URL (valgfri)"
                          />

                          <select
                            className="rounded-md border border-zinc-300 bg-white px-3 py-2"
                            value={editPrimary}
                            onChange={(e) => setEditPrimary(e.target.value as TeamColor)}
                          >
                            {Object.entries(colorLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                Primær: {label}
                              </option>
                            ))}
                          </select>
                          <select
                            className="rounded-md border border-zinc-300 bg-white px-3 py-2"
                            value={editSecondary}
                            onChange={(e) => setEditSecondary(e.target.value as "WHITE" | "BLACK")}
                          >
                            <option value="WHITE">Sekundær: {colorLabels.WHITE}</option>
                            <option value="BLACK">Sekundær: {colorLabels.BLACK}</option>
                          </select>

                          <div className="sm:col-span-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => saveTeam(t.id)}
                              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
                            >
                              Gem
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditTeam}
                              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm"
                            >
                              Annuller
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {isDeleting ? (
                        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
                          <div className="text-sm font-semibold text-red-800">Bekræft sletning</div>
                          <p className="mt-1 text-sm text-red-700">
                            Skriv holdnavnet og admin-koden for at slette. Dette sletter også relateret statistik og medlemskaber.
                          </p>
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                            <input
                              className="sm:col-span-2 rounded-md border border-red-300 bg-white px-3 py-2"
                              placeholder={`Skriv: ${t.name}`}
                              value={deleteConfirmName}
                              onChange={(e) => setDeleteConfirmName(e.target.value)}
                            />
                            <input
                              className="sm:col-span-2 rounded-md border border-red-300 bg-white px-3 py-2"
                              placeholder="Admin kode"
                              value={deleteAdminCode}
                              onChange={(e) => setDeleteAdminCode(e.target.value)}
                            />
                            <div className="sm:col-span-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => confirmDeleteTeam(t.id)}
                                className="rounded-md bg-red-700 px-4 py-2 text-sm text-white"
                              >
                                Slet hold
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingTeamId(null)}
                                className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm"
                              >
                                Annuller
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
