import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";

export const GET = route(async () =>
  prisma.stage.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { leads: true } } } }),
);

export const POST = route(async (req) => {
  const data = z.object({ name: z.string().min(1), color: z.string().optional() }).parse(await body(req));
  const last = await prisma.stage.findFirst({ orderBy: { order: "desc" } });
  return prisma.stage.create({ data: { ...data, order: (last?.order ?? 0) + 1 } });
});

/** Reordena: recebe a lista de ids na nova ordem. */
export const PUT = route(async (req) => {
  const { ids } = z.object({ ids: z.array(z.string()) }).parse(await body(req));
  await prisma.$transaction(ids.map((id, i) => prisma.stage.update({ where: { id }, data: { order: i } })));
  return { ok: true };
});
