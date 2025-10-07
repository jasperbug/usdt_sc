-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "orderId" TEXT NOT NULL,
    "vaultAddress" TEXT NOT NULL,
    "expectedAmount" BIGINT NOT NULL,
    "actualAmount" BIGINT,
    "feeAmount" BIGINT NOT NULL,
    "minimumRequired" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "nickname" TEXT,
    "message" TEXT,
    "depositTx" TEXT,
    "sweepTx" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "chainId" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Donation_orderId_key" ON "Donation"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_vaultAddress_key" ON "Donation"("vaultAddress");
