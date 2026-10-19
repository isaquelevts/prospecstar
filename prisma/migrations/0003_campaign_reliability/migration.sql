-- Estado ao vivo da campanha e tentativas por destinatário
ALTER TABLE "Campaign" ADD COLUMN "waitReason" TEXT,
ADD COLUMN "nextRunAt" TIMESTAMP(3),
ADD COLUMN "lastError" TEXT,
ADD COLUMN "failStreak" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CampaignTarget" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- Leads que chegaram pelo WhatsApp ou foram criados à mão não são "empresas sem site":
-- não devem entrar nos filtros de prospecção por situação do site.
UPDATE "Lead" SET "websiteStatus" = NULL
WHERE "source" IN ('whatsapp', 'manual') AND "website" IS NULL AND "websiteStatus" = 'NONE';
