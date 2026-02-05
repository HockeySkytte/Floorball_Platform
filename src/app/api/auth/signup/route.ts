import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { ApprovalStatus, TeamRole } from "@prisma/client";
import { getOrCreateAppLeagueId } from "@/lib/league";

export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { message: "Server-konfiguration fejl (DATABASE_URL mangler)." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);

  const teamId = String(body?.teamId ?? "").trim();
  const roleInput = String(body?.role ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");

  if (!teamId || !roleInput || !email || !username || !password) {
    return NextResponse.json(
      { message: "Udfyld venligst alle felter." },
      { status: 400 }
    );
  }

  const allowedRoles = [TeamRole.LEADER, TeamRole.PLAYER, TeamRole.SUPPORTER] as const;
  if (!allowedRoles.includes(roleInput as (typeof allowedRoles)[number])) {
    return NextResponse.json({ message: "Ugyldig rolle." }, { status: 400 });
  }

  const role = roleInput as TeamRole;

  if (password.length < 6) {
    return NextResponse.json(
      { message: "Kodeord skal være mindst 6 tegn." },
      { status: 400 }
    );
  }

  try {
    const appLeagueId = await getOrCreateAppLeagueId();
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, leagueId: true },
    });
    if (!team) {
      return NextResponse.json({ message: "Ugyldigt hold." }, { status: 400 });
    }

    if (team.leagueId !== appLeagueId) {
      return NextResponse.json({ message: "Ugyldigt hold." }, { status: 400 });
    }

    const existingUsername = await prisma.user.findFirst({
      where: {
        leagueId: appLeagueId,
        username,
      },
      select: { id: true },
    });

    if (existingUsername) {
      return NextResponse.json(
        { message: "Brugernavn er allerede i brug." },
        { status: 409 }
      );
    }

    const status =
      role === TeamRole.LEADER ? ApprovalStatus.PENDING_ADMIN : ApprovalStatus.PENDING_LEADER;

    const passwordHash = await hashPassword(password);

    await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        leagueId: team.leagueId,
        teamId: team.id,
        memberships: {
          create: {
            teamId,
            role,
            status,
          },
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/signup failed", err);

    // Guard against race conditions: even if we pre-check, the DB unique index can still win.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as any).code === "P2002"
    ) {
      return NextResponse.json(
        { message: "Brugernavn er allerede i brug." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        message:
          "Kunne ikke oprette bruger (serverfejl). Tjek DATABASE_URL og at Prisma migrations matcher databasen.",
      },
      { status: 500 }
    );
  }
}
