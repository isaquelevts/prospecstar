import { z } from "zod";
import { body, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { createLeadIfNew, findLeadByPhone } from "@/lib/leads";
import { sendToLead } from "@/lib/messaging";
import { normalizePhone, formatPhone } from "@/lib/phone";

const Send = z.object({
  phone: z.string().min(8),
  text: z.string().trim().min(1, "Escreva a mensagem"),
  name: z.string().trim().optional(),
});

/** Inicia uma conversa com qualquer número: usa o lead existente ou cria um novo. */
export const POST = route(async (req) => {
  const { phone: raw, text, name } = Send.parse(await body(req));
  const phone = normalizePhone(raw);
  if (!phone) throw new Error("Telefone inválido. Use DDD + número, ex: 11 99999-8888.");

  let lead = await findLeadByPhone(phone);
  let created = false;
  if (!lead) {
    const res = await createLeadIfNew({ name: name || formatPhone(phone), phone }, { source: "manual", fireLeadCreated: false });
    lead = res.lead ?? null;
    created = res.created;
  }
  if (!lead) throw new Error("Não foi possível criar o contato.");
  try {
    await sendToLead(lead.id, text, "human", { humanize: false });
  } catch (e) {
    // número sem WhatsApp: não deixa um lead vazio criado só para esta tentativa
    if (created && String(e).includes("não tem WhatsApp")) await prisma.lead.delete({ where: { id: lead.id } }).catch(() => null);
    throw e;
  }
  return { leadId: lead.id, created };
});
