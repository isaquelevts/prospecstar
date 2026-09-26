import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";

const PAGE_SIZE = 100;

export const GET = route<{ id: string }>(async (req, { id }) => {
  await prisma.campaign.findUniqueOrThrow({ where: { id }, select: { id: true } });
  const rawSkip = Number(new URL(req.url).searchParams.get("skip") ?? "0");
  const skip = Number.isSafeInteger(rawSkip) ? Math.max(0, rawSkip) : 0;
  const where = { campaignId: id, status: { in: ["PENDING", "SENDING"] } };
  const [total, pending, sending, targets] = await Promise.all([
    prisma.campaignTarget.count({ where }),
    prisma.campaignTarget.count({ where: { campaignId: id, status: "PENDING" } }),
    prisma.campaignTarget.count({ where: { campaignId: id, status: "SENDING" } }),
    prisma.campaignTarget.findMany({
      where,
      orderBy: { id: "asc" },
      skip,
      take: PAGE_SIZE,
      include: { lead: { select: { id: true, name: true, phone: true, city: true } } },
    }),
  ]);
  return { total, pending, sending, skip, pageSize: PAGE_SIZE, targets };
});

export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const { targetId } = z.object({ targetId: z.string().min(1) }).parse(await body(req));
  const result = await prisma.campaignTarget.updateMany({
    where: { id: targetId, campaignId: id, status: "PENDING" },
    data: { status: "SKIPPED", error: "Removido manualmente da campanha antes do envio" },
  });
  if (result.count) return { removed: true };

  const target = await prisma.campaignTarget.findFirst({ where: { id: targetId, campaignId: id }, select: { status: true } });
  if (!target) return Response.json({ error: "Destinatário não encontrado nesta campanha" }, { status: 404 });
  return Response.json({ error: "Este destinatário já está sendo enviado ou não está mais pendente" }, { status: 409 });
});
