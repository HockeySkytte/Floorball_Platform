-- Add new JsonDocumentKind value used for player clip assignments.
-- This avoids running `prisma migrate dev` (shadow DB) in environments where it fails.

ALTER TYPE "JsonDocumentKind" ADD VALUE IF NOT EXISTS 'PLAYER_VIDEO_CLIPS';
