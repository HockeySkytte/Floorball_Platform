import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getOrCreateAppLeagueId } from "@/lib/league";

export async function POST(req: Request) {
  await requireAdmin();
  const body = await req.json().catch(() => null);
  const teamId = String(body?.teamId ?? "").trim();

  if (!teamId) {
    return NextResponse.json({ message: "teamId mangler." }, { status: 400 });
  }

  const appLeagueId = await getOrCreateAppLeagueId();

  const team = await prisma.team.findFirst({
    where: { id: teamId, leagueId: appLeagueId },
    select: { id: true },
  });

  if (!team) {
    return NextResponse.json({ message: "Ugyldigt hold." }, { status: 400 });
  }

  const session = await getSession();
  session.selectedTeamId = teamId;
  await session.save();

  return NextResponse.json({ ok: true });
}
