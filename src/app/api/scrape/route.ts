import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { queue } from "@/lib/queue";
import { APIFY_MAPS_ACTOR, buildMapsInput } from "@/lib/scrapers";

export const GET = route(async () => prisma.scrapeJob.findMany({ orderBy: { createdAt: "desc" }, take: 100 }));

const NewJob = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("apify_maps"),
    query: z.string().min(2),
    location: z.string().min(2),
    max: z.number().int().min(1).max(5000).default(100),
    requirePhone: z.boolean().default(true),
    tags: z.array(z.string()).default([]),
    actorId: z.string().default(APIFY_MAPS_ACTOR),
  }),
  z.object({
    provider: z.literal("apify_custom"),
    actorId: z.string().min(3),
    actorInput: z.record(z.string(), z.any()),
    requirePhone: z.boolean().default(true),
    tags: z.array(z.string()).default([]),
  }),
  z.object({
    provider: z.literal("google_places"),
    query: z.string().min(2),
    max: z.number().int().min(1).max(60).default(60),
    requirePhone: z.boolean().default(true),
    tags: z.array(z.string()).default([]),
  }),
]);

export const POST = route(async (req) => {
  const data = NewJob.parse(await body(req));
  let query: string;
  let input: Record<string, unknown>;
  if (data.provider === "apify_maps") {
    query = `${data.query} — ${data.location}`;
    input = {
      actorId: data.actorId,
      actorInput: buildMapsInput({ query: data.query, location: data.location, max: data.max }),
      requirePhone: data.requirePhone,
    };
  } else if (data.provider === "apify_custom") {
    query = data.actorId;
    input = { actorId: data.actorId, actorInput: data.actorInput, requirePhone: data.requirePhone };
  } else {
    query = data.query;
    input = { max: data.max, requirePhone: data.requirePhone };
  }
  const job = await prisma.scrapeJob.create({
    data: {
      provider: data.provider === "apify_custom" ? "apify_custom" : data.provider,
      query,
      input: input as object,
      tags: data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
    },
  });
  await queue("scrape").add("start", { scrapeJobId: job.id });
  return job;
});
