-- PHASE-08 external API and signed webhook integrations
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "webhookSecretCiphertext" TEXT,
    "scopes" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rateWindowStartedAt" DATETIME,
    "rateRequestCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "IntegrationCredential_tokenPrefix_key"
ON "IntegrationCredential"("tokenPrefix");

CREATE INDEX "IntegrationCredential_shop_enabled_idx"
ON "IntegrationCredential"("shop", "enabled");

CREATE TABLE "IntegrationReplayNonce" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "credentialId" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "IntegrationReplayNonce_credentialId_nonceHash_key"
ON "IntegrationReplayNonce"("credentialId", "nonceHash");

CREATE INDEX "IntegrationReplayNonce_expiresAt_idx"
ON "IntegrationReplayNonce"("expiresAt");
