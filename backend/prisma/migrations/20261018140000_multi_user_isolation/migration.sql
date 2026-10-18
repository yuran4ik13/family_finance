-- =========================
-- MULTI-USER ISOLATION
-- Every personal record gets an owner (userId).
-- Existing data is assigned to the first OWNER account, so nothing is lost.
-- =========================

-- ---------- 0. Safety check BEFORE changing anything ----------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "User" WHERE "role" = 'OWNER')
       AND (EXISTS (SELECT 1 FROM "FamilyMember")
         OR EXISTS (SELECT 1 FROM "Account")
         OR EXISTS (SELECT 1 FROM "Transaction")
         OR EXISTS (SELECT 1 FROM "Category"))
    THEN
        RAISE EXCEPTION 'The database has data but no OWNER account. Create one first: npm run create-user -- you@example.com';
    END IF;
END $$;

-- ---------- 1. UserRole: add USER ----------
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'USER', 'DEMO');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
DROP TYPE "UserRole_old";

-- ---------- 2. New User columns ----------
ALTER TABLE "User" ADD COLUMN "monobankTokenEnc" TEXT;
ALTER TABLE "User" ADD COLUMN "transferMarkers" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "familyIncomeMarkers" TEXT NOT NULL DEFAULT '';

-- ---------- 3. userId columns (nullable for now) ----------
ALTER TABLE "FamilyMember" ADD COLUMN "userId" INTEGER;
ALTER TABLE "Account" ADD COLUMN "userId" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "userId" INTEGER;
ALTER TABLE "Category" ADD COLUMN "userId" INTEGER;

-- ---------- 4. MerchantRule (replaces the old raw merchant_rules table) ----------
CREATE TABLE "MerchantRule" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "merchant" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantRule_pkey" PRIMARY KEY ("id")
);

-- ---------- 5. AuditLog ----------
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "event" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- ---------- 6. Give existing data to the first OWNER ----------
DO $$
DECLARE
    owner_id INTEGER;
BEGIN
    SELECT "id" INTO owner_id FROM "User" WHERE "role" = 'OWNER' ORDER BY "id" LIMIT 1;

    UPDATE "FamilyMember" SET "userId" = owner_id WHERE "userId" IS NULL;
    UPDATE "Account" SET "userId" = owner_id WHERE "userId" IS NULL;
    UPDATE "Transaction" SET "userId" = owner_id WHERE "userId" IS NULL;
    UPDATE "Category" SET "userId" = owner_id WHERE "userId" IS NULL;

    -- Move rules from the old table that the app used to create by itself
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'merchant_rules'
    ) THEN
        IF owner_id IS NOT NULL THEN
            INSERT INTO "MerchantRule" ("userId", "merchant", "merchantKey", "categoryId", "createdAt", "updatedAt")
            SELECT DISTINCT ON (LOWER(TRIM(r.merchant)))
                   owner_id, TRIM(r.merchant), LOWER(TRIM(r.merchant)), r.category_id, r.created_at, r.updated_at
            FROM merchant_rules r
            WHERE r.category_id IN (SELECT "id" FROM "Category")
              AND TRIM(r.merchant) <> ''
            ORDER BY LOWER(TRIM(r.merchant)), r.updated_at DESC;
        END IF;

        DROP TABLE merchant_rules;
    END IF;
END $$;

-- ---------- 7. userId is required from now on ----------
ALTER TABLE "FamilyMember" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Account" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Transaction" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Category" ALTER COLUMN "userId" SET NOT NULL;

-- ---------- 8. Unique keys are now per user ----------
DROP INDEX "Category_name_key";
CREATE UNIQUE INDEX "Category_userId_name_key" ON "Category"("userId", "name");

DROP INDEX "Account_bankId_externalId_key";
CREATE UNIQUE INDEX "Account_userId_bankId_externalId_key" ON "Account"("userId", "bankId", "externalId");

CREATE UNIQUE INDEX "MerchantRule_userId_merchantKey_key" ON "MerchantRule"("userId", "merchantKey");

-- ---------- 9. Indexes for fast per-user queries ----------
CREATE INDEX "FamilyMember_userId_idx" ON "FamilyMember"("userId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- ---------- 10. Foreign keys: deleting a user deletes all their data ----------
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" DROP CONSTRAINT "Account_familyMemberId_fkey";
ALTER TABLE "Account" ADD CONSTRAINT "Account_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_accountId_fkey";
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
