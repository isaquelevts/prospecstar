import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const data = z
    .object({ name: z.string().optional(), color: z.string().optional(), isWon: z.boolean().optional(), isLost: z.boolean().optional() })
    .parse(await body(req));
  return prisma.stage.update({ where: { id }, data });
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const count = await prisma.lead.count({ where: { stageId: id } });
  if (count > 0) throw new Error(`Mova os ${count} leads desta etapa antes de excluí-la.`);
  await prisma.stage.delete({ where: { id } });
  return { ok: true };
});
