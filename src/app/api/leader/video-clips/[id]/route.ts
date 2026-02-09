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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireLeaderOrAdmin();
  const teamId = user.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const { id } = await ctx.params;
  const clipId = String(id ?? "").trim();
  if (!clipId) {
    return NextResponse.json({ message: "id mangler." }, { status: 400 });
  }

  const clip = await prisma.jsonDocument.findUnique({
    where: { id: clipId },
    select: {
      id: true,
      scope: true,
      kind: true,
      teamId: true,
      title: true,
      content: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (
    !clip ||
    clip.teamId !== teamId ||
    clip.scope !== JsonDocumentScope.TEAM ||
    clip.kind !== JsonDocumentKind.VIDEO_CLIP
  ) {
    return NextResponse.json({ message: "Ugyldigt klip." }, { status: 404 });
  }

  return NextResponse.json({ clip });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireLeaderOrAdmin();
  const teamId = user.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const { id } = await ctx.params;
  const clipId = String(id ?? "").trim();
  if (!clipId) {
    return NextResponse.json({ message: "id mangler." }, { status: 400 });
  }

  const existing = await prisma.jsonDocument.findUnique({
    where: { id: clipId },
    select: { id: true, teamId: true, scope: true, kind: true },
  });

  if (
    !existing ||
    existing.teamId !== teamId ||
    existing.scope !== JsonDocumentScope.TEAM ||
    existing.kind !== JsonDocumentKind.VIDEO_CLIP
  ) {
    return NextResponse.json({ message: "Ugyldigt klip." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const titleRaw = body?.title;
  const contentRaw = body?.content;

  const data: Record<string, any> = {};

  if (titleRaw !== undefined) {
    const title = normalizeTitle(titleRaw);
    if (!title) {
      return NextResponse.json({ message: "Titel mangler." }, { status: 400 });
    }
    data.title = title;
  }

  if (contentRaw !== undefined) {
    const content = normalizeJsonContent(contentRaw);
    if (!content.trim()) {
      return NextResponse.json({ message: "JSON content mangler." }, { status: 400 });
    }
    try {
      JSON.parse(content);
    } catch {
      return NextResponse.json({ message: "JSON er ugyldig." }, { status: 400 });
    }
    data.content = content;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "Ingen ændringer." }, { status: 400 });
  }

  const updated = await prisma.jsonDocument.update({
    where: { id: clipId },
    data,
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, clip: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireLeaderOrAdmin();
  const teamId = user.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const { id } = await ctx.params;
  const clipId = String(id ?? "").trim();
  if (!clipId) {
    return NextResponse.json({ message: "id mangler." }, { status: 400 });
  }

  const existing = await prisma.jsonDocument.findUnique({
    where: { id: clipId },
    select: { id: true, teamId: true, scope: true, kind: true },
  });

  if (
    !existing ||
    existing.teamId !== teamId ||
    existing.scope !== JsonDocumentScope.TEAM ||
    existing.kind !== JsonDocumentKind.VIDEO_CLIP
  ) {
    return NextResponse.json({ message: "Ugyldigt klip." }, { status: 404 });
  }

  await prisma.jsonDocument.delete({ where: { id: clipId } });
  return NextResponse.json({ ok: true });
}
