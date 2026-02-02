import { prisma } from "@/lib/prisma";

function getConfiguredLeagueId() {
  const v = (process.env.APP_LEAGUE_ID ?? "").trim();
  return v.length > 0 ? v : "floorball-platform";
}

function getConfiguredLeagueName() {
  const v = (process.env.APP_LEAGUE_NAME ?? "").trim();
  return v.length > 0 ? v : "Floorball Platform";
}

export async function getOrCreateAppLeagueId(): Promise<string> {
  const leagueId = getConfiguredLeagueId();
  const leagueName = getConfiguredLeagueName();
  const now = new Date();

  const existing = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await prisma.league.create({
    data: { id: leagueId, name: leagueName, createdAt: now, updatedAt: now },
    select: { id: true },
  });

  return created.id;
}
