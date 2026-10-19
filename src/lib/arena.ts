// Qualificação de arenas esportivas para a prospecção do QuadrasFlow.

/** Modalidades reconhecidas no nome/segmento/site da arena. A ordem define a "principal" usada em {{modalidade}}. */
export const MODALITIES: Record<string, { label: string; re: RegExp }> = {
  beach_tennis: { label: "beach tennis", re: /beach\s*t[eê]nn?is|\bbt\b|\bbt\d/i },
  padel: { label: "padel", re: /p[aá]d[ae]l/i },
  futevolei: { label: "futevôlei", re: /fute?\s*v[oô]lei/i },
  volei_praia: { label: "vôlei de praia", re: /v[oô]lei\s*(de\s*)?(praia|areia)/i },
  society: { label: "futebol society", re: /society|soçaite|\bfut\s*7\b|futebol\s*7/i },
  futsal: { label: "futsal", re: /futsal|fut\s*sal/i },
  tenis: { label: "tênis", re: /(?<!beach\s*)\bt[eê]nn?is\b/i },
  basquete: { label: "basquete", re: /basquete|basket/i },
};

export const MODALITY_LABEL: Record<string, string> = Object.fromEntries(Object.entries(MODALITIES).map(([k, v]) => [k, v.label]));

/** Como a arena faz as reservas hoje — define a abordagem e a temperatura do lead. */
export const BOOKING_STATUS_LABEL: Record<string, string> = {
  WHATSAPP: "Reserva pelo WhatsApp",
  ONLINE: "Já reserva online",
  COMPETITOR: "Usa concorrente",
  CUSTOMER: "Cliente QuadrasFlow",
  UNKNOWN: "Não identificado",
};

export const BOOKING_STATUS_COLOR: Record<string, string> = {
  WHATSAPP: "#ea580c",
  ONLINE: "#ca8a04",
  COMPETITOR: "#dc2626",
  CUSTOMER: "#059669",
  UNKNOWN: "#64748b",
};

/** Plataformas de reserva concorrentes (o resto pode ser adicionado em Configurações → QuadrasFlow). */
export const DEFAULT_COMPETITORS = ["playtomic", "aircourts"];

const ARENA_WORDS = /arena|quadra|society|beach|fute?v[oô]lei|p[aá]d[ae]l|futsal|esport|sports?\b|t[eê]nn?is|v[oô]lei|centro\s+esportivo|complexo\s+esportivo|campo\s+de\s+futebol|bol[aã]o/i;
const NOT_ARENA = /loja|artigos\s+esportivos|material\s+esportivo|suplement|academia|muscula[cç][aã]o|crossfit|pilates|escola|col[eé]gio|clube\s+de\s+tiro|restaurante|lanchonete|farm[aá]cia|uniformes?|confec[cç][aã]o/i;

/** A empresa encontrada na busca é uma arena/quadra? Descarta lojas, academias etc. */
export function looksLikeArena(name: string, category?: string | null) {
  const text = `${name} ${category ?? ""}`;
  if (ARENA_WORDS.test(name)) return true; // o nome manda: "Arena X", "Quadra Y"
  if (category && NOT_ARENA.test(category)) return false;
  return ARENA_WORDS.test(text);
}

export function detectModalities(...texts: Array<string | null | undefined>) {
  const text = texts.filter(Boolean).join(" ");
  return Object.entries(MODALITIES)
    .filter(([, m]) => m.re.test(text))
    .map(([k]) => k);
}

/** Sinais de reserva encontrados no HTML do site da arena. */
export function bookingSignals(html: string, competitors: string[]) {
  const lower = html.toLowerCase();
  const competitor = competitors.find((c) => c && lower.includes(c.toLowerCase()));
  return {
    quadrasflow: lower.includes("quadrasflow"),
    competitor: competitor ?? null,
    whatsapp: /wa\.me\/|api\.whatsapp\.com|whatsapp/i.test(html),
    onlineBooking: /(reserv|agend)[a-zçã]*\s+(online|agora|seu\s+hor[aá]rio)|hor[aá]rios\s+dispon[ií]veis/i.test(html),
  };
}

export type BookingSignals = ReturnType<typeof bookingSignals>;
type SiteInfo = { booking?: BookingSignals } | null | undefined;

/** Como a arena reserva hoje, a partir da análise do site (ou da falta dele). */
export function bookingStatusFrom(websiteStatus: string | null | undefined, info: SiteInfo) {
  const b = info?.booking;
  if (b?.quadrasflow) return "CUSTOMER";
  if (b?.competitor) return "COMPETITOR";
  if (b?.onlineBooking) return "ONLINE";
  // sem site, só Instagram/link na bio ou site sem sistema: quase sempre reserva no WhatsApp
  if (!websiteStatus || ["NONE", "SOCIAL_ONLY", "OFFLINE"].includes(websiteStatus) || b?.whatsapp) return "WHATSAPP";
  return "UNKNOWN";
}

/** 0-100: quanto a arena combina com o QuadrasFlow agora (movimento + dor de reservar no WhatsApp). */
export function computeArenaScore(lead: {
  bookingStatus?: string | null;
  modalities?: string[];
  phone?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
}) {
  if (lead.bookingStatus === "CUSTOMER") return 0;
  let score = 35;
  const reviews = lead.reviewsCount ?? 0;
  if (reviews >= 20) score += 15; // arena com movimento
  if (reviews >= 100) score += 10;
  if (reviews >= 300) score += 5;
  if ((lead.rating ?? 0) >= 4.3) score += 5;
  if (lead.phone) score += 10;
  // modalidades de alta rotatividade por hora
  if (lead.modalities?.some((m) => ["beach_tennis", "padel", "futevolei", "society"].includes(m))) score += 10;
  if (lead.bookingStatus === "WHATSAPP") score += 15;
  else if (lead.bookingStatus === "UNKNOWN") score += 5;
  else if (lead.bookingStatus === "COMPETITOR") score -= 25;
  return Math.max(0, Math.min(100, score));
}
