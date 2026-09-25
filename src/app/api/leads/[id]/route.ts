import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { addActivity, changeStage } from "@/lib/leads";
import { normalizePhone } from "@/lib/phone";
import { queue } from "@/lib/queue";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id },
    include: {
      stage: true,
      agent: { select: { id: true, name: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
      flowRuns: { orderBy: { createdAt: "desc" }, take: 20, include: { flow: { select: { name: true } } } },
      campaignTargets: { include: { campaign: { select: { name: true } } } },
    },
  });
  return lead;
});

const Patch = z.object({
  name: z.string().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  stageId: z.string().optional(),
  aiEnabled: z.boolean().optional(),
  agentId: z.string().nullable().optional(),
  optOut: z.boolean().optional(),
  unread: z.number().optional(),
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const { stageId, phone, website, ...data } = Patch.parse(await body(req));
  const before = await prisma.lead.findUniqueOrThrow({ where: { id } });
  const lead = await prisma.lead.update({
    where: { id },
    data: {
      ...data,
      ...(data.tags ? { tags: data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean) } : {}),
      ...(phone !== undefined ? { phone: normalizePhone(phone), chatId: null, waExists: null } : {}),
      ...(website !== undefined ? { website } : {}),
    },
  });
  if (stageId) await changeStage(id, stageId);
  if (website !== undefined && website !== before.website) await queue("enrich").add("enrich", { leadId: id });
  if (data.aiEnabled !== undefined && data.aiEnabled !== before.aiEnabled)
    await addActivity(id, "system", `IA ${data.aiEnabled ? "ligada" : "desligada"} manualmente`);
  return lead;
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  await prisma.lead.delete({ where: { id } });
  return { ok: true };
});
