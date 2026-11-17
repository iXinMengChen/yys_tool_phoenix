-- CreateTable
CREATE TABLE "AccountSnapshot" (
    "channel" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "orderSn" TEXT NOT NULL,
    "accountPayload" JSONB NOT NULL,
    "relicVersion" TEXT NOT NULL,
    "relicPayload" JSONB NOT NULL,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountSnapshot_pkey" PRIMARY KEY ("channel","serverId","orderSn")
);

-- CreateIndex
CREATE INDEX "AccountSnapshot_expiresAt_idx" ON "AccountSnapshot"("expiresAt");
