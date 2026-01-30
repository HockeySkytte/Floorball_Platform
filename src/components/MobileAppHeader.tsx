"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import TeamSlicer, { type TeamOption } from "@/components/TeamSlicer";
import StatsSidebarSlicers from "@/components/stats/StatsSidebarSlicers";
import PlayerSlicer from "@/components/PlayerSlicer";
import SpillerVideoSidebarSlicers from "@/components/spiller/SpillerVideoSidebarSlicers";

export type MobileAppHeaderUser = {
  username: string;
  teamRole: string | null;
};

export default function MobileAppHeader({
  user,
  isAdmin,
  teams,
  selectedTeamId,
  logoUrl,
  leaderPendingCount,
  adminPendingLeadersCount,
}: {
  user: MobileAppHeaderUser;
  isAdmin: boolean;
  teams: TeamOption[];
  selectedTeamId: string | null;
  logoUrl: string | null;
  leaderPendingCount?: number;
  adminPendingLeadersCount?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const isSpiller = pathname === "/spiller" || pathname.startsWith("/spiller/");
  const spillerTab = String(searchParams.get("tab") ?? "").toLowerCase();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function toggleMenu() {
    setMenuOpen((v) => {
      const next = !v;
      if (next) setFiltersOpen(false);
      return next;
    });
  }

  function toggleFilters() {
    setFiltersOpen((v) => {
      const next = !v;
      if (next) setMenuOpen(false);
      return next;
    });
  }

  return (
    <div className="sticky top-0 z-50 md:hidden">
      <div className="bg-[image:var(--sidebar-gradient)] bg-cover bg-no-repeat text-[var(--brand-foreground)]">
        <div className="flex items-start justify-between px-5 pt-5">
          <div>
            <div className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-12 w-12 rounded-md object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
              <span>Floorball</span>
            </div>
            <div className="mt-1 text-sm opacity-80">{user.username}</div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={toggleMenu}
              aria-expanded={menuOpen}
              className="grid h-12 w-12 place-items-center rounded-xl border border-white/20 bg-white/10"
              title="Menu"
            >
              <span className="text-xl leading-none">≡</span>
            </button>
            <button
              type="button"
              onClick={toggleFilters}
              aria-expanded={filtersOpen}
              className="grid h-12 w-12 place-items-center rounded-xl border border-white/20 bg-white/10"
              title="Filtre"
            >
              <span className="text-xl leading-none">⎚</span>
            </button>
          </div>
        </div>

        {/* Menu (mobile) */}
        {menuOpen ? (
          <div className="mt-5 px-4 pb-4">
            <div className="overflow-hidden rounded-xl border border-white/15 bg-white/5">
              <nav className="divide-y divide-white/10">
                <Link className="block px-4 py-4 text-lg font-semibold" href="/statistik">
                  Statistik
                </Link>
                <Link className="block px-4 py-4 text-lg font-semibold" href="/taktiktavle">
                  Taktiktavle
                </Link>
                <Link className="block px-4 py-4 text-lg font-semibold" href="/kampe">
                  Kampe
                </Link>
                <Link className="block px-4 py-4 text-lg font-semibold" href="/playbook">
                  Playbook
                </Link>
                <Link className="block px-4 py-4 text-lg font-semibold" href="/oevelser">
                  Øvelser
                </Link>
                <Link className="block px-4 py-4 text-lg font-semibold" href="/spiller">
                  Spiller
                </Link>
                {isAdmin ? (
                  <Link className="block px-4 py-4 text-lg font-semibold" href="/admin">
                    <span className="flex items-center justify-between gap-3">
                      <span>Admin</span>
                      {(adminPendingLeadersCount ?? 0) > 0 ? (
                        <span className="inline-grid min-w-[20px] place-items-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-5 text-white">
                          {adminPendingLeadersCount}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                ) : null}
                {user.teamRole === "LEADER" ? (
                  <Link className="block px-4 py-4 text-lg font-semibold" href="/leder">
                    <span className="flex items-center justify-between gap-3">
                      <span>Leder</span>
                      {(leaderPendingCount ?? 0) > 0 ? (
                        <span className="inline-grid min-w-[20px] place-items-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-5 text-white">
                          {leaderPendingCount}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                ) : null}

                <button
                  type="button"
                  onClick={logout}
                  className="block w-full px-4 py-4 text-left text-lg font-semibold"
                >
                  Log ud
                </button>

                <Link className="block px-4 py-4 text-lg font-semibold" href="/tilfoej-rolle">
                  Tilføj Rolle
                </Link>
              </nav>
            </div>
          </div>
        ) : null}

        {/* Filters (mobile) */}
        {filtersOpen ? (
          <div className="mt-5 px-5 pb-5">
            <div className="flex items-center justify-between rounded-full border border-white/15 bg-white/5 px-4 py-3">
              <div className="text-sm font-semibold opacity-90">
                {teams.find((t) => t.id === selectedTeamId)?.name ?? ""}
              </div>
            </div>

            <div className="mt-4">
              <TeamSlicer
                isAdmin={isAdmin}
                teams={teams}
                selectedTeamId={selectedTeamId}
              />
            </div>

            {pathname === "/statistik" || pathname.startsWith("/statistik/") ? (
              <StatsSidebarSlicers />
            ) : null}

            {isSpiller ? <PlayerSlicer /> : null}

            {isSpiller && spillerTab === "video" ? <SpillerVideoSidebarSlicers /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
