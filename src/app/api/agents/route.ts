import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { AgentInput } from "@/lib/schemas";

export const GET = route(async () =>
  prisma.agent.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { leads: true } } } }),
);

export const POST = route(async (req) => {
  const data = AgentInput.parse(await body(req));
  if (data.isDefault) await prisma.agent.updateMany({ data: { isDefault: false } });
  return prisma.agent.create({ data });
});
