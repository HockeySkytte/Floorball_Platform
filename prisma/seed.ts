import bcrypt from "bcryptjs";
import { PrismaClient, GlobalRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const leagueId = (process.env.APP_LEAGUE_ID ?? "").trim() || "floorball-platform";

  await prisma.league.upsert({
    where: { id: leagueId },
    update: { name: "Floorball Platform", updatedAt: now },
    create: { id: leagueId, name: "Floorball Platform", createdAt: now, updatedAt: now },
  });

  const teams = ["U19 herrelandsholdet", "U17 herrelandsholdet"];

  for (const name of teams) {
    await prisma.team.upsert({
      where: { leagueId_name: { leagueId, name } },
      update: {
        themePrimary: "RED",
        themeSecondary: "WHITE",
      },
      create: {
        name,
        themePrimary: "RED",
        themeSecondary: "WHITE",
        leagueId,
      },
    });
  }

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@floorball.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "SkiftMig123!";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const desiredUsername = "admin";
  const existingByUsername = await prisma.user.findFirst({
    where: { leagueId, username: desiredUsername },
  });

  if (!existingByUsername) {
    await prisma.user.create({
      data: {
        globalRole: GlobalRole.ADMIN,
        email: adminEmail,
        username: desiredUsername,
        passwordHash,
        leagueId,
      },
    });
    return;
  }

  const emailOwner = await prisma.user.findFirst({
    where: { leagueId, email: adminEmail },
    select: { id: true },
  });

  const canSetEmail = !emailOwner || emailOwner.id === existingByUsername.id;

  await prisma.user.update({
    where: { id: existingByUsername.id },
    data: {
      globalRole: GlobalRole.ADMIN,
      passwordHash,
      leagueId,
      ...(canSetEmail ? { email: adminEmail } : {}),
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
