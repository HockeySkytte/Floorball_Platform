import { redirect } from "next/navigation";
import { ApprovalStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import TeamSlicer from "@/components/TeamSlicer";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import MobileAppHeader from "@/components/MobileAppHeader";
import StatsFiltersProvider from "@/components/stats/StatsFiltersProvider";
import StatsSidebarSlicers from "@/components/stats/StatsSidebarSlicers";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin && user.activeMembership?.status !== ApprovalStatus.APPROVED) {
    redirect("/afventer");
  }

  const isAdmin = user.isAdmin;
  const session = await getSession();
  const selectedTeamId = isAdmin ? session.selectedTeamId ?? null : null;

  const teams = isAdmin
    ? await prisma.team.findMany({
        select: { id: true, name: true, logoUrl: true },
        orderBy: { name: "asc" },
      })
    : user.activeTeam
      ? [{ id: user.activeTeam.id, name: user.activeTeam.name, logoUrl: user.activeTeam.logoUrl }]
      : [];

  const resolvedSelectedTeamId =
    selectedTeamId ?? (teams.length > 0 ? teams[0]!.id : null);

  const selectedTeamLogoUrl =
    teams.find((t) => t.id === resolvedSelectedTeamId)?.logoUrl ?? null;

  return (
    <StatsFiltersProvider>
      <div className="grid min-h-dvh w-full grid-cols-1 md:grid-cols-[280px_1fr]">
        {/* Desktop: left slicer pane */}
        <aside className="hidden min-h-dvh flex-col bg-[image:var(--sidebar-gradient)] bg-cover bg-no-repeat p-4 text-[var(--brand-foreground)] md:flex">
          <Link
            className="flex items-center gap-3 text-xl font-semibold tracking-tight"
            href="/statistik"
            aria-label="Statistik"
          >
            {selectedTeamLogoUrl ? (
              <img
                src={selectedTeamLogoUrl}
                alt="Logo"
                className="h-16 w-16 object-contain"
              />
            ) : null}
            <span>Floorball</span>
          </Link>
          <div className="mt-4">
            <TeamSlicer
              isAdmin={isAdmin}
              teams={teams}
              selectedTeamId={resolvedSelectedTeamId}
            />
          </div>
          <StatsSidebarSlicers />
        </aside>

        {/* Right side: topbar starts AFTER sidebar */}
        <div className="flex min-h-dvh flex-col">
          <div className="hidden md:block">
            <TopNav
              user={{ username: user.username, isAdmin, teamRole: user.activeRole }}
            />
          </div>

          <MobileAppHeader
            user={{ username: user.username, teamRole: user.activeRole }}
            isAdmin={isAdmin}
            teams={teams}
            selectedTeamId={resolvedSelectedTeamId}
            logoUrl={selectedTeamLogoUrl}
          />

          <main className="flex-1 p-4 text-[var(--surface-foreground)] md:p-6">
            {children}
          </main>
        </div>
      </div>
    </StatsFiltersProvider>
  );
}
