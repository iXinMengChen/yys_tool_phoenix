-- CreateTable
CREATE TABLE "ProductSummary" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "orderSn" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'client_upload',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSummary_expiresAt_idx" ON "ProductSummary"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSummary_channel_serverId_orderSn_key" ON "ProductSummary"("channel", "serverId", "orderSn");
