import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateAppLeagueId } from "@/lib/league";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { message: "Server-konfiguration fejl (DATABASE_URL mangler)." },
      { status: 500 }
    );
  }

  try {
    const leagueId = await getOrCreateAppLeagueId();
    const teams = await prisma.team.findMany({
      where: { leagueId },
      select: { id: true, name: true, logoUrl: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ teams });
  } catch (err) {
    console.error("GET /api/public/teams failed", err);
    return NextResponse.json(
      {
        message:
          "Kunne ikke hente hold (serverfejl). Tjek DATABASE_URL og at migrations er kørt.",
      },
      { status: 500 }
    );
  }
}
