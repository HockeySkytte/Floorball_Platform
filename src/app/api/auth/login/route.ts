import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getOrCreateAppLeagueId } from "@/lib/league";

async function ensureBootstrapAdmin() {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
  if (!adminEmail || !adminPassword) return;

  const leagueId = await getOrCreateAppLeagueId();

  const passwordHash = await hashPassword(adminPassword);
  const desiredUsername = "admin";

  const existingByUsername = await prisma.user.findFirst({
    where: { leagueId, username: desiredUsername },
  });

  if (!existingByUsername) {
    await prisma.user.create({
      data: {
        globalRole: "ADMIN",
        email: adminEmail,
        username: desiredUsername,
        passwordHash,
        leagueId,
      },
    });
  } else {
    const emailOwner = await prisma.user.findFirst({
      where: { leagueId, email: adminEmail },
      select: { id: true },
    });

    const canSetEmail = !emailOwner || emailOwner.id === existingByUsername.id;

    await prisma.user.update({
      where: { id: existingByUsername.id },
      data: {
        globalRole: "ADMIN",
        passwordHash,
        leagueId,
        ...(canSetEmail ? { email: adminEmail } : {}),
      },
    });
  }

  const existingTeams = await prisma.team.count({ where: { leagueId } });
  if (existingTeams === 0) {
    const teams = ["U19 herrelandsholdet", "U17 herrelandsholdet"];
    for (const name of teams) {
      await prisma.team.create({
        data: {
          name,
          themePrimary: "RED",
          themeSecondary: "WHITE",
          leagueId,
        },
      });
    }
  }
}

function isLikelyMissingMigrations(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /does not exist/i.test(message) ||
    /relation .* does not exist/i.test(message) ||
    /table .* does not exist/i.test(message) ||
    /P2021/i.test(message) ||
    /P2022/i.test(message)
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const emailOrUsername = String(body?.emailOrUsername ?? "").trim();
    const password = String(body?.password ?? "");

    if (!emailOrUsername || !password) {
      return NextResponse.json(
        { message: "Udfyld venligst alle felter." },
        { status: 400 }
      );
    }

    // If DB is empty on first deploy (no seed), allow bootstrapping admin + default teams.
    const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD ?? "";
    const isAdminAttempt =
      !!adminEmail &&
      !!adminPassword &&
      password === adminPassword &&
      (emailOrUsername.toLowerCase() === adminEmail || emailOrUsername === "admin");

    if (isAdminAttempt) {
      await ensureBootstrapAdmin();
    }

    const leagueId = await getOrCreateAppLeagueId();

    const user = await prisma.user.findFirst({
      where: {
        leagueId,
        OR: [
          { email: emailOrUsername.toLowerCase() },
          { username: emailOrUsername },
        ],
      },
    });

    if (!user) {
      return NextResponse.json({ message: "Forkert login." }, { status: 401 });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ message: "Forkert login." }, { status: 401 });
    }

    const session = await getSession();
    session.userId = user.id;
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("/api/auth/login failed", error);

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("SESSION_PASSWORD")) {
      return NextResponse.json(
        { message: "Server-konfiguration fejl (SESSION_PASSWORD)." },
        { status: 500 }
      );
    }

    if (isLikelyMissingMigrations(error)) {
      return NextResponse.json(
        { message: "Database er ikke initialiseret endnu." },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Serverfejl." }, { status: 500 });
  }
}
