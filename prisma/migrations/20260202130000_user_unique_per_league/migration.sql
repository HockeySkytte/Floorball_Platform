-- Make email/username unique per league instead of globally.
-- This allows the same credentials to exist in multiple apps sharing the same DB,
-- as long as each app uses a distinct leagueId.

-- Drop old global unique constraints (names are Prisma defaults; IF EXISTS keeps it safe).
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_email_key";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_username_key";

-- Create new composite uniques.
CREATE UNIQUE INDEX IF NOT EXISTS "User_leagueId_email_key" ON "User"("leagueId", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_leagueId_username_key" ON "User"("leagueId", "username");
