import { ApprovalStatus, GlobalRole, TeamRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getOrCreateAppLeagueId } from "@/lib/league";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function getCurrentUser() {
  const session = await getSession();
  if (!session.userId) return null;

  const appLeagueId = await getOrCreateAppLeagueId();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      memberships: {
        include: { team: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user) return null;

  const isAdmin = user.globalRole === GlobalRole.ADMIN;

  let activeTeam = null as (typeof user.memberships)[number]["team"] | null;
  let activeTeamId: string | null = null;
  let activeMembership = null as (typeof user.memberships)[number] | null;

  if (isAdmin) {
    const selectedTeamId = session.selectedTeamId ?? null;
    if (selectedTeamId) {
      activeTeam =
        user.memberships.find((m) => m.teamId === selectedTeamId)?.team ??
        (await prisma.team.findFirst({
          where: { id: selectedTeamId, leagueId: appLeagueId },
        }));

      if (activeTeam) {
        activeTeamId = activeTeam.id;
      } else {
        session.selectedTeamId = undefined;
        await session.save();

        const firstTeam = await prisma.team.findFirst({
          where: { leagueId: appLeagueId },
          orderBy: { name: "asc" },
        });
        activeTeam = firstTeam;
        activeTeamId = firstTeam?.id ?? null;
      }
    } else {
      const firstTeam = await prisma.team.findFirst({
        where: { leagueId: appLeagueId },
        orderBy: { name: "asc" },
      });
      activeTeam = firstTeam;
      activeTeamId = firstTeam?.id ?? null;
    }

    if (activeTeamId) {
      activeMembership =
        user.memberships.find((m) => m.teamId === activeTeamId) ?? null;
    }
  } else {
    activeMembership =
      user.memberships.find(
        (m) => m.status === ApprovalStatus.APPROVED && m.team.leagueId === appLeagueId
      ) ??
      user.memberships.find((m) => m.team.leagueId === appLeagueId) ??
      null;
    activeTeam = activeMembership?.team ?? null;
    activeTeamId = activeMembership?.teamId ?? null;
  }

  const activeRole = activeMembership?.role ?? null;

  return {
    ...user,
    isAdmin,
    activeTeam,
    activeTeamId,
    activeMembership,
    activeRole,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("NOT_AUTHENTICATED");
  return user;
}

export async function requireApprovedUser() {
  const user = await requireUser();
  if (user.isAdmin) return user;
  if (user.activeMembership?.status !== ApprovalStatus.APPROVED) {
    throw new Error("NOT_APPROVED");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireApprovedUser();
  if (!user.isAdmin) throw new Error("NOT_AUTHORIZED");
  return user;
}

export async function requireLeader() {
  const user = await requireApprovedUser();
  if (user.activeMembership?.role !== TeamRole.LEADER) {
    throw new Error("NOT_AUTHORIZED");
  }
  if (!user.activeTeamId) throw new Error("NO_TEAM");
  return user;
}

export async function requireLeaderOrAdmin() {
  const user = await requireApprovedUser();
  if (!user.activeTeamId) throw new Error("NO_TEAM");
  if (user.isAdmin) return user;
  if (user.activeMembership?.role !== TeamRole.LEADER) {
    throw new Error("NOT_AUTHORIZED");
  }
  return user;
}

export async function requireTeamId() {
  const user = await requireApprovedUser();
  if (!user.activeTeamId) throw new Error("NO_TEAM");
  return { user, teamId: user.activeTeamId };
}
