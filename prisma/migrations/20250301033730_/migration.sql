/*
  Warnings:

  - The values [STUDENT,PREMIUM] on the enum `PlanType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PlanType_new" AS ENUM ('FREE', 'PRO_DAILY', 'PRO_WEEKLY', 'PRO_MONTHLY', 'PRO_MONTHLY_SUBSCRIPTION');
ALTER TABLE "User" ALTER COLUMN "planType" DROP DEFAULT;
ALTER TABLE "Subscription" ALTER COLUMN "planType" TYPE "PlanType_new" USING ("planType"::text::"PlanType_new");
ALTER TABLE "User" ALTER COLUMN "planType" TYPE "PlanType_new" USING ("planType"::text::"PlanType_new");
ALTER TYPE "PlanType" RENAME TO "PlanType_old";
ALTER TYPE "PlanType_new" RENAME TO "PlanType";
DROP TYPE "PlanType_old";
ALTER TABLE "User" ALTER COLUMN "planType" SET DEFAULT 'FREE';
COMMIT;
