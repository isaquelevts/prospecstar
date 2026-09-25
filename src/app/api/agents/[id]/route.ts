import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { AgentInput } from "@/lib/schemas";
import { simulateAgent } from "@/lib/ai";

export const GET = route<{ id: string }>(async (_req, { id }) => prisma.agent.findUniqueOrThrow({ where: { id } }));

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const data = AgentInput.partial().parse(await body(req));
  if (data.isDefault) await prisma.agent.updateMany({ where: { NOT: { id } }, data: { isDefault: false } });
  return prisma.agent.update({ where: { id }, data });
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  await prisma.agent.delete({ where: { id } });
  return { ok: true };
});

/** Playground: simula a resposta do agente para uma conversa de teste. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { conversation, leadId } = z
    .object({
      conversation: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1),
      leadId: z.string().optional(),
    })
    .parse(await body(req));
  return simulateAgent(id, conversation, leadId);
});
