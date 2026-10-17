import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { sendToLead } from "@/lib/messaging";
import { addActivity } from "@/lib/leads";
import { debounceJob } from "@/lib/queue";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const messages = await prisma.message.findMany({ where: { leadId: id }, orderBy: { createdAt: "desc" }, take: 500 });
  await prisma.lead.updateMany({ where: { id, unread: { gt: 0 } }, data: { unread: 0 } });
  return messages.reverse();
});

const Send = z.object({
  text: z.string().trim().min(1).optional(),
  note: z.string().trim().min(1).optional(),
  aiReplyNow: z.boolean().optional(),
  retryId: z.string().optional(),
  markUnread: z.boolean().optional(),
});

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { text, note, aiReplyNow, retryId, markUnread } = Send.parse(await body(req));
  if (note) {
    await addActivity(id, "note", note);
    return { ok: true };
  }
  if (markUnread) {
    await prisma.lead.update({ where: { id }, data: { unread: 1 } });
    return { ok: true };
  }
  if (aiReplyNow) {
    // força a IA a responder agora (útil para testar ou retomar após pausa)
    await prisma.lead.update({ where: { id }, data: { aiEnabled: true } });
    await debounceJob("ai", `ai-${id}`, { leadId: id }, 500);
    return { ok: true };
  }
  if (retryId) {
    // reenvia uma mensagem que falhou: apaga a falha e manda de novo
    const failed = await prisma.message.findFirst({ where: { id: retryId, leadId: id, status: "failed" } });
    if (!failed) throw new Error("Mensagem não encontrada ou já enviada.");
    await prisma.message.delete({ where: { id: failed.id } });
    await sendToLead(id, failed.body, "human", { humanize: false });
    return { ok: true };
  }
  if (!text) throw new Error("Mensagem vazia");
  await sendToLead(id, text, "human", { humanize: false });
  return { ok: true };
});
