import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { normalizePhone, phoneVariants } from "./phone";
import { queue } from "./queue";
import { fireTrigger } from "./flows";

export type LeadInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  category?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  mapsUrl?: string | null;
  externalId?: string | null;
  tags?: string[];
  notes?: string | null;
  permanentlyClosed?: boolean;
};

export async function defaultStageId() {
  const s = await prisma.stage.findFirst({ orderBy: { order: "asc" } });
  return s?.id ?? null;
}

export async function findLeadByPhone(phone: string) {
  return prisma.lead.findFirst({ where: { phone: { in: phoneVariants(phone) } } });
}

/** Cria o lead se ainda não existir (deduplica por externalId e telefone). */
export async function createLeadIfNew(input: LeadInput, opts: { source: string; scrapeJobId?: string; requirePhone?: boolean }) {
  if (input.permanentlyClosed) return { created: false as const, reason: "fechado" };
  const phone = normalizePhone(input.phone);
  if (opts.requirePhone && !phone) return { created: false as const, reason: "sem telefone" };

  if (input.externalId) {
    const byExt = await prisma.lead.findUnique({ where: { externalId: input.externalId } });
    if (byExt) return { created: false as const, reason: "duplicado", lead: byExt };
  }
  if (phone) {
    const byPhone = await findLeadByPhone(phone);
    if (byPhone) return { created: false as const, reason: "duplicado", lead: byPhone };
  }

  const lead = await prisma.lead.create({
    data: {
      name: input.name.slice(0, 200),
      phone,
      email: input.email || null,
      website: input.website || null,
      websiteStatus: input.website ? null : "NONE",
      address: input.address || null,
      city: input.city || null,
      state: input.state || null,
      category: input.category || null,
      rating: input.rating ?? null,
      reviewsCount: input.reviewsCount ?? null,
      mapsUrl: input.mapsUrl || null,
      externalId: input.externalId || null,
      tags: input.tags ?? [],
      notes: input.notes || null,
      source: opts.source,
      scrapeJobId: opts.scrapeJobId,
      stageId: await defaultStageId(),
    },
  });
  await queue("enrich").add("enrich", { leadId: lead.id });
  await fireTrigger("LEAD_CREATED", lead.id);
  return { created: true as const, lead };
}

export async function addActivity(leadId: string, type: string, content: string) {
  return prisma.activity.create({ data: { leadId, type, content } });
}

export async function changeStage(leadId: string, stageId: string, by = "usuário") {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { stageId: true } });
  if (!lead || lead.stageId === stageId) return;
  const stage = await prisma.stage.findUnique({ where: { id: stageId } });
  if (!stage) return;
  await prisma.lead.update({ where: { id: leadId }, data: { stageId } });
  await addActivity(leadId, "stage", `Movido para "${stage.name}" por ${by}`);
  await fireTrigger("STAGE_CHANGED", leadId, { stageId });
}

export async function addTags(leadId: string, tags: string[], by = "usuário") {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { tags: true } });
  if (!lead) return;
  const fresh = tags.map((t) => t.trim().toLowerCase()).filter((t) => t && !lead.tags.includes(t));
  if (!fresh.length) return;
  await prisma.lead.update({ where: { id: leadId }, data: { tags: [...lead.tags, ...fresh] } });
  await addActivity(leadId, "tag", `Tags adicionadas por ${by}: ${fresh.join(", ")}`);
  for (const tag of fresh) await fireTrigger("TAG_ADDED", leadId, { tag });
}

export async function removeTags(leadId: string, tags: string[]) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { tags: true } });
  if (!lead) return;
  const drop = new Set(tags.map((t) => t.trim().toLowerCase()));
  await prisma.lead.update({ where: { id: leadId }, data: { tags: lead.tags.filter((t) => !drop.has(t)) } });
}

/** Monta o filtro de leads usado em listagens e campanhas. */
export type LeadFilter = {
  q?: string;
  stageId?: string;
  tag?: string;
  websiteStatus?: string[];
  city?: string;
  category?: string;
  minScore?: number;
  hasPhone?: boolean;
  neverContacted?: boolean;
  scrapeJobId?: string;
};

export function buildLeadWhere(f: LeadFilter): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  const and: Prisma.LeadWhereInput[] = [];
  if (f.q) {
    and.push({
      OR: [
        { name: { contains: f.q, mode: "insensitive" } },
        { phone: { contains: f.q.replace(/\D/g, "") || f.q } },
        { city: { contains: f.q, mode: "insensitive" } },
        { category: { contains: f.q, mode: "insensitive" } },
      ],
    });
  }
  if (f.stageId) where.stageId = f.stageId;
  if (f.tag) where.tags = { has: f.tag.toLowerCase() };
  if (f.websiteStatus?.length) where.websiteStatus = { in: f.websiteStatus };
  if (f.city) where.city = { contains: f.city, mode: "insensitive" };
  if (f.category) where.category = { contains: f.category, mode: "insensitive" };
  if (f.minScore) where.score = { gte: f.minScore };
  if (f.hasPhone) where.phone = { not: null };
  if (f.neverContacted) where.lastOutboundAt = null;
  if (f.scrapeJobId) where.scrapeJobId = f.scrapeJobId;
  if (and.length) where.AND = and;
  return where;
}

export function parseLeadFilter(sp: URLSearchParams): LeadFilter {
  return {
    q: sp.get("q") || undefined,
    stageId: sp.get("stageId") || undefined,
    tag: sp.get("tag") || undefined,
    websiteStatus: sp.get("websiteStatus")?.split(",").filter(Boolean),
    city: sp.get("city") || undefined,
    category: sp.get("category") || undefined,
    minScore: sp.get("minScore") ? Number(sp.get("minScore")) : undefined,
    hasPhone: sp.get("hasPhone") === "1" || undefined,
    neverContacted: sp.get("neverContacted") === "1" || undefined,
    scrapeJobId: sp.get("scrapeJobId") || undefined,
  };
}

