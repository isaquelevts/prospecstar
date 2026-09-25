import type { Lead } from "@prisma/client";

export const TZ = process.env.TZ || "America/Sao_Paulo";

export function leadVariables(lead: Partial<Lead>): Record<string, string> {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(new Date()));
  const name = lead.name ?? "";
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
  };
}

export const TEMPLATE_VARIABLES = ["nome", "primeiro_nome", "cidade", "categoria", "site", "avaliacao", "avaliacoes", "saudacao"];

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
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomBetween(min: number, max: number) {
  return Math.round(min + Math.random() * Math.max(0, max - min));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
