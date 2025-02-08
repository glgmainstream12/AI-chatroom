-- This is an empty migration.
ALTER TABLE "Message" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'default-user-id';