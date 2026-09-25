import { prisma } from "./db";
import { chatIdToPhone, phoneToChatId } from "./phone";
import { debounceJob } from "./queue";
import { getSettings } from "./settings";
import { waha } from "./waha";
import { addActivity, createLeadIfNew, findLeadByPhone } from "./leads";
import { fireTrigger, stopRunsForLead } from "./flows";
import { resolveAgent } from "./ai";

type WahaMessage = {
  id: string;
  from: string;
  to?: string;
  fromMe: boolean;
  body?: string;
  hasMedia?: boolean;
  source?: "app" | "api";
  timestamp?: number;
  media?: { mimetype?: string } | null;
  _data?: { notifyName?: string; pushName?: string; Info?: { PushName?: string } } & Record<string, unknown>;
};

export type WahaEvent = { event: string; session: string; payload: WahaMessage & { status?: string } };

const IGNORE = /@g\.us$|@broadcast$|@newsletter$|^status@/;

/** Encontra o lead de um chat (por chatId, telefone ou resolvendo o LID) — cria se não existir. */
async function findOrCreateLead(session: string, chatId: string, pushName?: string, create = true) {
  const byChat = await prisma.lead.findUnique({ where: { chatId } });
  if (byChat) return byChat;

  let phone = chatIdToPhone(chatId);
  if (!phone && chatId.endsWith("@lid")) {
    const r = await waha.resolveLid(session, chatId);
    if (r?.pn) phone = chatIdToPhone(r.pn);
  }
  if (phone) {
    const byPhone = await findLeadByPhone(phone);
    if (byPhone) {
      if (!byPhone.chatId) await prisma.lead.update({ where: { id: byPhone.id }, data: { chatId, waExists: true } });
      return byPhone;
    }
  }
  if (!create) return null;
  const s = await getSettings();
  const res = await createLeadIfNew(
    { name: pushName || (phone ? `+${phone}` : "Contato WhatsApp"), phone },
    { source: "whatsapp" },
  );
  if (!res.lead) return null;
  const agent = await resolveAgent(null);
  return prisma.lead.update({
    where: { id: res.lead.id },
    data: {
      chatId: chatId.endsWith("@lid") && phone ? phoneToChatId(phone) : chatId,
      waExists: true,
      aiEnabled: s.AUTO_REPLY_NEW === "true" && !!agent,
      agentId: agent?.id,
    },
  });
}

function messageText(m: WahaMessage) {
  if (m.body?.trim()) return m.body.trim();
  if (m.hasMedia) return `[mídia${m.media?.mimetype ? `: ${m.media.mimetype}` : ""}]`;
  return "[mensagem sem texto]";
}

export async function handleWahaEvent(evt: WahaEvent) {
  if (evt.event !== "message.any" && evt.event !== "message") return;
  const m = evt.payload;
  const chatId = m.fromMe ? m.to : m.from;
  if (!chatId || IGNORE.test(chatId)) return;
  if (m.id && (await prisma.message.findUnique({ where: { wahaId: m.id } }))) return; // já registrado

  const text = messageText(m);

  // ---- mensagem enviada por nós ----
  if (m.fromMe) {
    if (m.source === "api") return; // enviada por este sistema; já registrada em sendToLead
    // enviada manualmente pelo celular / WhatsApp Web
    const lead = await findOrCreateLead(evt.session, chatId, undefined, false);
    if (!lead) return;
    await prisma.message.create({ data: { leadId: lead.id, direction: "OUT", body: text, wahaId: m.id, author: "human" } });
    const s = await getSettings();
    const pause = s.PAUSE_AI_ON_HUMAN === "true" && lead.aiEnabled;
    await prisma.lead.update({
      where: { id: lead.id },
      data: { lastOutboundAt: new Date(), lastMessageAt: new Date(), ...(pause ? { aiEnabled: false } : {}) },
    });
    if (pause) await addActivity(lead.id, "system", "IA pausada: você respondeu pelo celular");
    return;
  }

  // ---- mensagem recebida do contato ----
  const pushName = m._data?.notifyName || m._data?.pushName || m._data?.Info?.PushName;
  const lead = await findOrCreateLead(evt.session, chatId, typeof pushName === "string" ? pushName : undefined);
  if (!lead) return;

  const now = new Date();
  await prisma.message.create({
    data: { leadId: lead.id, direction: "IN", body: text, wahaId: m.id, author: "contact", status: "received" },
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: { lastInboundAt: now, lastMessageAt: now, unread: { increment: 1 } },
  });
  // marca a resposta nas campanhas
  await prisma.campaignTarget.updateMany({
    where: { leadId: lead.id, status: "SENT", repliedAt: null },
    data: { repliedAt: now },
  });

  // descadastro por palavra-chave
  const s = await getSettings();
  const normalized = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const optOutWords = s.OPT_OUT_KEYWORDS.split(",").map((w) => w.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")).filter(Boolean);
  if (optOutWords.some((w) => normalized === w || (w.includes(" ") && normalized.includes(w)))) {
    await prisma.lead.update({ where: { id: lead.id }, data: { optOut: true, aiEnabled: false } });
    await stopRunsForLead(lead.id, "Lead pediu descadastro");
    await addActivity(lead.id, "system", `Opt-out automático pela mensagem: "${text.slice(0, 80)}"`);
    return;
  }

  await fireTrigger("MESSAGE_RECEIVED", lead.id, { text });

  const fresh = await prisma.lead.findUnique({ where: { id: lead.id } });
  if (fresh?.aiEnabled && !fresh.optOut) {
    const agent = await resolveAgent(fresh.agentId);
    if (agent) await debounceJob("ai", `ai-${lead.id}`, { leadId: lead.id }, agent.debounceSec * 1000);
  }
}
