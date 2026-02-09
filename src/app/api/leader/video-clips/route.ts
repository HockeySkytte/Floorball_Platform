import { NextResponse } from "next/server";
import { requireLeaderOrAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JsonDocumentKind, JsonDocumentScope } from "@prisma/client";

function normalizeTitle(input: unknown) {
  return String(input ?? "").trim();
}

function normalizeJsonContent(input: unknown) {
  return String(input ?? "");
}

export async function GET() {
  const user = await requireLeaderOrAdmin();
  const teamId = user.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const clips = await prisma.jsonDocument.findMany({
    where: {
      scope: JsonDocumentScope.TEAM,
      kind: JsonDocumentKind.VIDEO_CLIP,
      teamId,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ teamId, clips });
}

export async function POST(req: Request) {
  const user = await requireLeaderOrAdmin();
  const teamId = user.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const title = normalizeTitle(body?.title);
  const content = normalizeJsonContent(body?.content);

  if (!title) {
    return NextResponse.json({ message: "Titel mangler." }, { status: 400 });
  }

  if (!content.trim()) {
    return NextResponse.json({ message: "JSON content mangler." }, { status: 400 });
  }

  try {
    JSON.parse(content);
  } catch {
    return NextResponse.json({ message: "JSON er ugyldig." }, { status: 400 });
  }

  const created = await prisma.jsonDocument.create({
    data: {
      scope: JsonDocumentScope.TEAM,
      kind: JsonDocumentKind.VIDEO_CLIP,
      teamId,
      title,
      content,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, clip: created });
}
