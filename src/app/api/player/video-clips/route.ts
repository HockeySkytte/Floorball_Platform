import { NextResponse } from "next/server";
import { ApprovalStatus, JsonDocumentKind, JsonDocumentScope, TeamRole } from "@prisma/client";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { VideoClipDocV1 } from "@/components/video/types";

type PlayerVideoClipsDocV1 = {
  version: 1;
  byPlayerId: Record<string, Array<{ clipId: string; addedAt: string; addedBy: string }>>;
};

function isLeaderOrAdmin(user: { isAdmin: boolean; activeRole: TeamRole | null }) {
  return user.isAdmin || user.activeRole === TeamRole.LEADER;
}

function safeParseDoc(content: string | null | undefined): PlayerVideoClipsDocV1 {
  try {
    const parsed = JSON.parse(String(content ?? "")) as any;
    if (!parsed || parsed.version !== 1 || typeof parsed.byPlayerId !== "object" || !parsed.byPlayerId) {
      return { version: 1, byPlayerId: {} };
    }
    return {
      version: 1,
      byPlayerId: parsed.byPlayerId as PlayerVideoClipsDocV1["byPlayerId"],
    };
  } catch {
    return { version: 1, byPlayerId: {} };
  }
}

async function getApprovedPlayerIds(teamId: string) {
  const memberships = await prisma.teamMembership.findMany({
    where: { teamId, role: TeamRole.PLAYER, status: ApprovalStatus.APPROVED },
    select: { userId: true },
  });
  return memberships.map((m) => m.userId);
}

async function requireTeamVideoClip(teamId: string, clipId: string) {
  const clip = await prisma.jsonDocument.findUnique({
    where: { id: clipId },
    select: { id: true, teamId: true, scope: true, kind: true, title: true, content: true, updatedAt: true },
  });

  if (
    !clip ||
    clip.teamId !== teamId ||
    clip.scope !== JsonDocumentScope.TEAM ||
    clip.kind !== JsonDocumentKind.VIDEO_CLIP
  ) {
    return null;
  }

  return clip;
}

export async function GET(req: Request) {
  const user = await requireApprovedUser();
  const teamId = user.activeTeamId;
  if (!teamId) return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });

  const leader = isLeaderOrAdmin(user);

  const url = new URL(req.url);
  const requestedPlayerId = String(url.searchParams.get("playerId") ?? "").trim();

  let targetPlayerId = user.id;
  if (leader && requestedPlayerId) {
    // Only allow approved players on team.
    const m = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: requestedPlayerId, teamId } },
      select: { role: true, status: true },
    });
    if (m && m.role === TeamRole.PLAYER && m.status === ApprovalStatus.APPROVED) {
      targetPlayerId = requestedPlayerId;
    }
  }

  const mappingDoc = await prisma.jsonDocument.findFirst({
    where: {
      scope: JsonDocumentScope.TEAM,
      kind: JsonDocumentKind.PLAYER_VIDEO_CLIPS,
      teamId,
    },
    orderBy: [{ updatedAt: "desc" }],
    select: { id: true, content: true, updatedAt: true },
  });

  const doc = safeParseDoc(mappingDoc?.content);
  const entries = Array.isArray(doc.byPlayerId[targetPlayerId]) ? doc.byPlayerId[targetPlayerId] : [];

  const clipIds = Array.from(new Set(entries.map((e) => String(e.clipId)).filter(Boolean)));
  const clips = clipIds.length
    ? await prisma.jsonDocument.findMany({
        where: {
          id: { in: clipIds },
          teamId,
          scope: JsonDocumentScope.TEAM,
          kind: JsonDocumentKind.VIDEO_CLIP,
        },
        select: { id: true, title: true, content: true, updatedAt: true },
      })
    : [];

  const clipById = new Map(clips.map((c) => [c.id, c] as const));

  const items = entries
    .map((e) => {
      const clip = clipById.get(String(e.clipId));
      if (!clip) return null;
      let parsed: VideoClipDocV1 | null = null;
      try {
        parsed = JSON.parse(String(clip.content ?? "")) as VideoClipDocV1;
      } catch {
        parsed = null;
      }

      if (!parsed || parsed.version !== 1) return null;

      const videoUrl = String(parsed?.videoUrl ?? "").trim() || null;
      const matchTitle = String(parsed?.matchTitle ?? "").trim() || null;
      const clipName = String(parsed?.clipName ?? "").trim() || null;
      const startSec = Number(parsed?.startSec);
      const endSec = Number(parsed?.endSec);

      return {
        clipId: clip.id,
        title: clip.title,
        clipName,
        matchTitle,
        videoUrl,
        startSec: Number.isFinite(startSec) ? startSec : null,
        endSec: Number.isFinite(endSec) ? endSec : null,
        addedAt: e.addedAt,
        doc: parsed,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ ok: true, playerId: targetPlayerId, clips: items });
}

export async function DELETE(req: Request) {
  const user = await requireApprovedUser();
  const teamId = user.activeTeamId;
  if (!teamId) return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });

  const leader = isLeaderOrAdmin(user);
  if (!leader) return NextResponse.json({ message: "Ikke tilladt." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const modeRaw = String(body?.mode ?? "").trim().toLowerCase();
  const mode = modeRaw === "all" ? ("all" as const) : ("single" as const);
  const requestedPlayerId = String(body?.playerId ?? "").trim();
  const clipId = String(body?.clipId ?? "").trim();

  if (!clipId) return NextResponse.json({ message: "clipId mangler." }, { status: 400 });

  const existing = await prisma.jsonDocument.findFirst({
    where: {
      scope: JsonDocumentScope.TEAM,
      kind: JsonDocumentKind.PLAYER_VIDEO_CLIPS,
      teamId,
    },
    orderBy: [{ updatedAt: "desc" }],
    select: { id: true, content: true },
  });

  if (!existing) return NextResponse.json({ ok: true });

  const doc = safeParseDoc(existing.content);

  const targetPlayerIds =
    mode === "all"
      ? await getApprovedPlayerIds(teamId)
      : requestedPlayerId
        ? [requestedPlayerId]
        : [];

  if (mode === "single" && targetPlayerIds.length === 0) {
    return NextResponse.json({ message: "playerId mangler." }, { status: 400 });
  }

  // Validate targets are approved players.
  const allowed = new Set(await getApprovedPlayerIds(teamId));
  for (const pid of targetPlayerIds) {
    if (!allowed.has(pid)) return NextResponse.json({ message: "Ugyldig spiller." }, { status: 400 });
  }

  for (const pid of targetPlayerIds) {
    const list = Array.isArray(doc.byPlayerId[pid]) ? doc.byPlayerId[pid] : [];
    const next = list.filter((x) => String(x.clipId) !== clipId);
    doc.byPlayerId[pid] = next;
  }

  await prisma.jsonDocument.update({
    where: { id: existing.id },
    data: { title: "Player video clips", content: JSON.stringify(doc) },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const user = await requireApprovedUser();
  const teamId = user.activeTeamId;
  if (!teamId) return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });

  const leader = isLeaderOrAdmin(user);

  const body = await req.json().catch(() => null);
  const modeRaw = String(body?.mode ?? "").trim().toLowerCase();
  const mode = modeRaw === "all" ? ("all" as const) : ("single" as const);
  const requestedPlayerId = String(body?.playerId ?? "").trim();
  const clipId = String(body?.clipId ?? "").trim();

  if (!clipId) return NextResponse.json({ message: "clipId mangler." }, { status: 400 });

  const clip = await requireTeamVideoClip(teamId, clipId);
  if (!clip) return NextResponse.json({ message: "Ugyldigt klip." }, { status: 404 });

  if (mode === "all" && !leader) {
    return NextResponse.json({ message: "Ikke tilladt." }, { status: 403 });
  }

  if (mode === "single" && requestedPlayerId && !leader && requestedPlayerId !== user.id) {
    return NextResponse.json({ message: "Ikke tilladt." }, { status: 403 });
  }

  const targetPlayerIds =
    mode === "all"
      ? await getApprovedPlayerIds(teamId)
      : [leader && requestedPlayerId ? requestedPlayerId : user.id].filter(Boolean);

  if (targetPlayerIds.length === 0) {
    return NextResponse.json({ message: "Ingen spillere fundet." }, { status: 400 });
  }

  // Validate targets are approved players (leader mode).
  if (leader) {
    const allowed = new Set(await getApprovedPlayerIds(teamId));
    for (const pid of targetPlayerIds) {
      if (!allowed.has(pid)) {
        return NextResponse.json({ message: "Ugyldig spiller." }, { status: 400 });
      }
    }
  }

  const existing = await prisma.jsonDocument.findFirst({
    where: {
      scope: JsonDocumentScope.TEAM,
      kind: JsonDocumentKind.PLAYER_VIDEO_CLIPS,
      teamId,
    },
    orderBy: [{ updatedAt: "desc" }],
    select: { id: true, content: true },
  });

  const doc = safeParseDoc(existing?.content);

  const nowIso = new Date().toISOString();

  for (const pid of targetPlayerIds) {
    const list = Array.isArray(doc.byPlayerId[pid]) ? doc.byPlayerId[pid] : [];
    const without = list.filter((x) => String(x.clipId) !== clipId);
    doc.byPlayerId[pid] = [{ clipId, addedAt: nowIso, addedBy: user.id }, ...without].slice(0, 200);
  }

  const title = "Player video clips";
  const content = JSON.stringify(doc);

  if (!existing) {
    await prisma.jsonDocument.create({
      data: {
        scope: JsonDocumentScope.TEAM,
        kind: JsonDocumentKind.PLAYER_VIDEO_CLIPS,
        teamId,
        title,
        content,
      },
      select: { id: true },
    });
  } else {
    await prisma.jsonDocument.update({
      where: { id: existing.id },
      data: { title, content },
      select: { id: true },
    });
  }

  return NextResponse.json({ ok: true });
}
