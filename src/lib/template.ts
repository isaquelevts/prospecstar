import type { Lead } from "@prisma/client";

export const TZ = process.env.TZ || "America/Sao_Paulo";

const SMALL_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "para"]);

/**
 * Nome como uma pessoa escreveria: tira o que vem depois de " - " ou " | " (sufixos do Google)
 * e desfaz o CAIXA ALTA ("ARENA CHOPP & BOLÃO" → "Arena Chopp & Bolão"). Palavras com números ficam como estão.
 */
export function friendlyName(raw: string) {
  let name = raw.split(/\s+[-–—|•]\s+/)[0].replace(/\s*\([^)]*\)\s*$/, "").trim();
  const letters = name.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  const upper = letters.replace(/[^A-ZÀ-ÖØ-Þ]/g, "").length;
  if (letters.length >= 4 && upper / letters.length > 0.8) {
    name = name
      .split(/(\s+)/)
      .map((w, i) => {
        if (!w.trim() || /\d/.test(w)) return w;
        const lower = w.toLocaleLowerCase("pt-BR");
        return i > 0 && SMALL_WORDS.has(lower) ? lower : lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
      })
      .join("");
  }
  return name || raw.trim();
}

export function leadVariables(lead: Partial<Lead>): Record<string, string> {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(new Date()));
  const name = friendlyName(lead.name ?? "");
  return {
    nome: name,
    primeiro_nome: name.split(/\s+/)[0] ?? name,
    empresa: name,
    cidade: lead.city ?? "",
    categoria: lead.category ?? "",
    site: lead.website ?? "",
    avaliacao: lead.rating?.toString().replace(".", ",") ?? "",
    avaliacoes: lead.reviewsCount?.toString() ?? "",
    saudacao: hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite",
    saudacao_informal: pick(["Oi", "Olá", "Opa"]),
  };
}

export const TEMPLATE_VARIABLES = ["nome", "primeiro_nome", "cidade", "categoria", "site", "avaliacao", "avaliacoes", "saudacao", "saudacao_informal"];

/** Substitui {{variavel}} e resolve spintax {opção a|opção b|opção c}. */
export function renderTemplate(template: string, vars: Record<string, string>) {
  let out = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key.toLowerCase()] ?? "");
  const spin = /\{([^{}]*\|[^{}]*)\}/;
  let guard = 0;
  while (spin.test(out) && guard++ < 200) {
    out = out.replace(spin, (_, group: string) => pick(group.split("|")));
  }
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

export function pick<T>(arr: T[]): T {
  if (!arr.length) throw new Error("Nenhuma opção para escolher (lista vazia).");
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomBetween(min: number, max: number) {
  return Math.round(min + Math.random() * Math.max(0, max - min));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Meia-noite de hoje no fuso configurado (TZ), como Date em UTC. */
export function startOfToday() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsed = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsed);
}
