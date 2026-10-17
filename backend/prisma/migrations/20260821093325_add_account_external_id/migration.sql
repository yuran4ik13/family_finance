/*
  Warnings:

  - A unique constraint covering the columns `[bankId,externalId]` on the table `Account` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Account_bankId_externalId_key" ON "Account"("bankId", "externalId");
