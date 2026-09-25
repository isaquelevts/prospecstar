import type { Lead } from "@prisma/client";
import { prisma } from "./db";
import { phoneToChatId } from "./phone";
import { defaultSession, extractMessageId, sendHumanized, waha } from "./waha";

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
  const chatId = await resolveChatId(lead, session);
  if (!chatId) throw new Error("Número não tem WhatsApp.");

  const msg = await prisma.message.create({
    data: { leadId, direction: "OUT", body: text, author, status: "pending" },
  });
  try {
    const wahaId =
      opts.humanize === false
        ? extractMessageId(await waha.sendText(session, chatId, text))
        : await sendHumanized(session, chatId, text);
    const now = new Date();
    await prisma.message.update({
      where: { id: msg.id },
      data: { status: "sent", wahaId: typeof wahaId === "string" ? wahaId : null },
    });
    await prisma.lead.update({ where: { id: leadId }, data: { lastOutboundAt: now, lastMessageAt: now } });
    return msg.id;
  } catch (e) {
    await prisma.message.update({ where: { id: msg.id }, data: { status: "failed", error: String(e).slice(0, 500) } });
    throw e;
  }
}
