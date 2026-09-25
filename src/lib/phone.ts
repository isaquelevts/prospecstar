/** Normaliza telefone para apenas dígitos com DDI. Assume Brasil (55) quando não houver DDI. */
export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

export function phoneToChatId(phone: string) {
  return `${phone}@c.us`;
}

export function chatIdToPhone(chatId: string) {
  if (!chatId.endsWith("@c.us") && !chatId.endsWith("@s.whatsapp.net")) return null;
  return chatId.split("@")[0].replace(/\D/g, "");
}

/** Chaves possíveis para casar um número brasileiro com/sem o nono dígito. */
export function phoneVariants(phone: string) {
  const out = new Set([phone]);
  const m = phone.match(/^55(\d{2})(\d{8,9})$/);
  if (m) {
    const [, ddd, n] = m;
    if (n.length === 9 && n.startsWith("9")) out.add(`55${ddd}${n.slice(1)}`);
    if (n.length === 8) out.add(`55${ddd}9${n}`);
  }
  return [...out];
}

export function formatPhone(phone?: string | null) {
  if (!phone) return "";
  const m = phone.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${phone}`;
}
