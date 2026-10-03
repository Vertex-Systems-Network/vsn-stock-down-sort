-- PHASE-08 external API and signed webhook integrations
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "webhookSecretCiphertext" TEXT,
    "scopes" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rateWindowStartedAt" TIMESTAMP(3),
    "rateRequestCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationCredential_tokenPrefix_key"
ON "IntegrationCredential"("tokenPrefix");

CREATE INDEX "IntegrationCredential_shop_enabled_idx"
ON "IntegrationCredential"("shop", "enabled");

CREATE TABLE "IntegrationReplayNonce" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegrationReplayNonce_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationReplayNonce_credentialId_nonceHash_key"
ON "IntegrationReplayNonce"("credentialId", "nonceHash");

CREATE INDEX "IntegrationReplayNonce_expiresAt_idx"
ON "IntegrationReplayNonce"("expiresAt");
