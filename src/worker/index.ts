import { Worker, type Job } from "bullmq";
import { prisma } from "../lib/db";
import { QUEUES, queue, redis } from "../lib/queue";
import { apifyGetItems, apifyGetRun, apifyStartRun, googlePlacesSearch, mapApifyItem } from "../lib/scrapers";
import { createLeadIfNew, type LeadInput } from "../lib/leads";
import { checkWebsite, computeScore } from "../lib/website";
import { campaignTick } from "../lib/campaigns";
import { replyToLead } from "../lib/ai";
import { checkNoReplyFlows, executeRun } from "../lib/flows";

const connection = redis();
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

// ---------- scraping ----------
async function importItems(jobId: string, items: LeadInput[], tags: string[], requirePhone: boolean) {
  let imported = 0;
  let skipped = 0;
  for (const item of items) {
    const res = await createLeadIfNew({ ...item, tags }, { source: "scraper", scrapeJobId: jobId, requirePhone }).catch((e) => {
      log("erro importando item", e);
      return { created: false };
    });
    if (res.created) imported++;
    else skipped++;
  }
  await prisma.scrapeJob.update({
    where: { id: jobId },
    data: { itemsImported: { increment: imported }, itemsSkipped: { increment: skipped } },
  });
}

async function processScrape(job: Job<{ scrapeJobId: string }>) {
  const sj = await prisma.scrapeJob.findUnique({ where: { id: job.data.scrapeJobId } });
  if (!sj || sj.status === "DONE" || sj.status === "FAILED") return;
  const input = sj.input as Record<string, any>;
  const requirePhone = input.requirePhone !== false;

  try {
    if (sj.provider === "google_places") {
      await prisma.scrapeJob.update({ where: { id: sj.id }, data: { status: "RUNNING" } });
      const items = await googlePlacesSearch(sj.query, Number(input.max ?? 60));
      await prisma.scrapeJob.update({ where: { id: sj.id }, data: { status: "IMPORTING", itemsFound: items.length } });
      await importItems(sj.id, items, sj.tags, requirePhone);
      await prisma.scrapeJob.update({ where: { id: sj.id }, data: { status: "DONE", finishedAt: new Date() } });
      return;
    }

    // Apify: inicia o run, depois faz polling reagendando este mesmo job
    if (!sj.runId) {
      const run = await apifyStartRun(input.actorId, input.actorInput);
      await prisma.scrapeJob.update({
        where: { id: sj.id },
        data: { status: "RUNNING", runId: run.id, datasetId: run.defaultDatasetId },
      });
      await queue("scrape").add("poll", { scrapeJobId: sj.id }, { delay: 20_000 });
      return;
    }
    const run = await apifyGetRun(sj.runId);
    if (["READY", "RUNNING"].includes(run.status)) {
      await queue("scrape").add("poll", { scrapeJobId: sj.id }, { delay: 20_000 });
      return;
    }
    if (run.status !== "SUCCEEDED") throw new Error(`Run da Apify terminou com status ${run.status} ${run.statusMessage ?? ""}`);

    await prisma.scrapeJob.update({ where: { id: sj.id }, data: { status: "IMPORTING" } });
    let offset = 0;
    let found = 0;
    for (;;) {
      const raw = await apifyGetItems(run.defaultDatasetId, offset, 500);
      if (!raw.length) break;
      found += raw.length;
      const items = raw.map(mapApifyItem).filter((x): x is LeadInput => !!x);
      await importItems(sj.id, items, sj.tags, requirePhone);
      offset += raw.length;
      await prisma.scrapeJob.update({ where: { id: sj.id }, data: { itemsFound: found } });
    }
    await prisma.scrapeJob.update({ where: { id: sj.id }, data: { status: "DONE", finishedAt: new Date() } });
  } catch (e) {
    log("scrape falhou", e);
    await prisma.scrapeJob.update({
      where: { id: sj.id },
      data: { status: "FAILED", error: String(e instanceof Error ? e.message : e).slice(0, 1000), finishedAt: new Date() },
    });
  }
}

// ---------- enriquecimento (análise do site + score) ----------
async function processEnrich(job: Job<{ leadId: string }>) {
  const lead = await prisma.lead.findUnique({ where: { id: job.data.leadId } });
  if (!lead) return;
  const check = await checkWebsite(lead.website);
  const updated = { ...lead, websiteStatus: check.status };
  await prisma.lead.update({
    where: { id: lead.id },
    data: { websiteStatus: check.status, websiteInfo: check.info as object, score: computeScore(updated) },
  });
}

// ---------- workers ----------
function worker<T>(name: string, fn: (job: Job<T>) => Promise<unknown>, concurrency = 1) {
  const w = new Worker<T>(name, fn, { connection, concurrency });
  w.on("failed", (job, err) => log(`[${name}] job ${job?.id} falhou:`, err.message));
  return w;
}

const workers = [
  worker(QUEUES.scrape, processScrape, 2),
  worker(QUEUES.enrich, processEnrich, 8),
  // concorrência 1: os disparos de todas as campanhas saem em fila única, nunca em paralelo
  worker<{ campaignId: string; token: string }>(QUEUES.campaign, (j) => campaignTick(j.data.campaignId, j.data.token), 1),
  worker<{ leadId: string }>(QUEUES.ai, (j) => replyToLead(j.data.leadId), 4),
  worker<{ runId: string }>(QUEUES.flow, (j) => executeRun(j.data.runId), 4),
  worker(QUEUES.cron, async (j) => {
    if (j.name === "no-reply") await checkNoReplyFlows();
  }),
];

async function main() {
  await queue("cron").upsertJobScheduler("no-reply", { every: 10 * 60_000 }, { name: "no-reply" });
  log(`Worker iniciado: ${workers.length} filas`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

async function shutdown() {
  log("Encerrando worker...");
  await Promise.all(workers.map((w) => w.close()));
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
