-- Qualificação de arenas (QuadrasFlow): modalidades e como a arena reserva hoje
ALTER TABLE "Lead" ADD COLUMN "modalities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "bookingStatus" TEXT;
