import { prisma } from "@/lib/prisma";

function getConfiguredLeagueId() {
  const v = (process.env.APP_LEAGUE_ID ?? "").trim();
  // Default to the shared "Standard Liga" league used by this app.
  // Render may not have APP_LEAGUE_ID configured yet; this prevents cross-app mixing.
  return v.length > 0 ? v : "league_default";
}

function getConfiguredLeagueName() {
  const v = (process.env.APP_LEAGUE_NAME ?? "").trim();
  return v.length > 0 ? v : "Standard Liga";
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
