import type { Lead } from "@prisma/client";
import { prisma } from "./db";
import { redis } from "./queue";
import { phoneToChatId } from "./phone";
import { assertSessionReady, defaultSession, extractMessageId, sendHumanized, waha } from "./waha";

/** Assina a presença do chat (digitando…) uma vez por hora. */
export async function ensurePresence(session: string, chatId: string) {
  try {
    const first = await redis().set(`presub:${session}:${chatId}`, "1", "EX", 3600, "NX");
    if (first) await waha.subscribePresence(session, chatId);
  } catch {
    // opcional: sem isso só some o "digitando…" na inbox
  }
}

/** Garante que o lead tem WhatsApp e um chatId válido. Retorna null se o número não existir. */
export async function resolveChatId(lead: Lead, session: string): Promise<string | null> {
  if (lead.chatId && lead.waExists) return lead.chatId;
  if (!lead.phone) return null;
  const check = await waha.checkExists(session, lead.phone);
  if (!check.numberExists) {
    await prisma.lead.update({ where: { id: lead.id }, data: { waExists: false } });
    return null;
  }
  // Prefere o chatId por telefone (pn); o WAHA aceita os dois formatos para envio.
  const chatId = check.pn || check.chatId || phoneToChatId(lead.phone);
  const clash = await prisma.lead.findFirst({ where: { chatId, NOT: { id: lead.id } } });
  await prisma.lead.update({
    where: { id: lead.id },
    data: { waExists: true, chatId: clash ? lead.chatId : chatId },
  });
  return chatId;
}

/**
 * Envia uma mensagem de texto para o lead e registra no histórico.
 * `author` identifica quem enviou: human (painel), ai, campaign, flow.
 */
export async function sendToLead(
  leadId: string,
  text: string,
  author: "human" | "ai" | "campaign" | "flow",
  opts: { session?: string; humanize?: boolean } = {},
) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.optOut && author !== "human") throw new Error("Lead pediu para não receber mensagens (opt-out).");
  const session = opts.session || (await defaultSession());
  await assertSessionReady(session);
  const chatId = await resolveChatId(lead, session);
  if (!chatId) throw new Error("Número não tem WhatsApp.");
  void ensurePresence(session, chatId);

  const msg = await prisma.message.create({
    data: { leadId, direction: "OUT", body: text, author, status: "pending" },
  });
  try {
    const wahaId =
      opts.humanize === false
        ? extractMessageId(await waha.sendText(session, chatId, text))
        : await sendHumanized(session, chatId, text);
    const now = new Date();
    // o webhook pode ter chegado antes e já gravado o id / status de entrega nesta mensagem
    const current = await prisma.message.findUnique({ where: { id: msg.id }, select: { status: true, wahaId: true } });
    await prisma.message
      .update({
        where: { id: msg.id },
        data: {
          status: current && current.status !== "pending" ? current.status : "sent",
          wahaId: current?.wahaId ?? (typeof wahaId === "string" ? wahaId : null),
        },
      })
      .catch(() => prisma.message.update({ where: { id: msg.id }, data: { status: "sent" } }));
    await prisma.lead.update({ where: { id: leadId }, data: { lastOutboundAt: now, lastMessageAt: now } });
    return msg.id;
  } catch (e) {
    await prisma.message.update({ where: { id: msg.id }, data: { status: "failed", error: String(e).slice(0, 500) } });
    throw e;
  }
}
