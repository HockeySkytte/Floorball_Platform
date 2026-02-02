-- Remove leftover global unique indexes on User.email/User.username.
-- We want uniqueness per leagueId instead (User_leagueId_email_key / User_leagueId_username_key).

-- Some setups create these as indexes, not constraints.
DROP INDEX IF EXISTS "User_email_key";
DROP INDEX IF EXISTS "User_username_key";

-- Safety: if they exist as constraints for any reason.
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_email_key";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_username_key";
