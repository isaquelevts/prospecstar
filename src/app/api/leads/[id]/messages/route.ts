import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { sendToLead } from "@/lib/messaging";
import { addActivity } from "@/lib/leads";
import { debounceJob } from "@/lib/queue";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const messages = await prisma.message.findMany({ where: { leadId: id }, orderBy: { createdAt: "asc" }, take: 500 });
  await prisma.lead.update({ where: { id }, data: { unread: 0 } });
  return messages;
});

const Send = z.object({ text: z.string().min(1).optional(), note: z.string().min(1).optional(), aiReplyNow: z.boolean().optional() });

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { text, note, aiReplyNow } = Send.parse(await body(req));
  if (note) {
    await addActivity(id, "note", note);
    return { ok: true };
  }
  if (aiReplyNow) {
    // força a IA a responder agora (útil para testar ou retomar após pausa)
    await prisma.lead.update({ where: { id }, data: { aiEnabled: true } });
    await debounceJob("ai", `ai-${id}`, { leadId: id }, 500);
    return { ok: true };
  }
  if (!text) throw new Error("Mensagem vazia");
  await sendToLead(id, text, "human", { humanize: false });
  return { ok: true };
});
