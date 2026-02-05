-- Allow multiple users with the same email within a league.
-- Username remains unique per league.

DROP INDEX IF EXISTS "User_leagueId_email_key";
