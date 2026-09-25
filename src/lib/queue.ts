import { Queue } from "bullmq";
import IORedis from "ioredis";

export const QUEUES = {
  scrape: "scrape", // polling de runs do Apify / Google Places
  enrich: "enrich", // análise de site dos leads
  campaign: "campaign", // disparos
  ai: "ai", // respostas automáticas (com debounce)
  flow: "flow", // execução de passos de fluxos
  cron: "cron", // tarefas periódicas (gatilho NO_REPLY)
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const g = globalThis as unknown as { redis?: IORedis; queues?: Record<string, Queue> };

export function redis() {
  if (!g.redis) {
    g.redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return g.redis;
}

export function queue(name: QueueName) {
  g.queues ??= {};
  g.queues[name] ??= new Queue(name, {
    connection: redis(),
    defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
  });
  return g.queues[name];
}

/** Agenda (ou reagenda) um job com id fixo — usado para o debounce das respostas da IA. */
export async function debounceJob(name: QueueName, jobId: string, data: object, delayMs: number) {
  const q = queue(name);
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "delayed") {
      await existing.changeDelay(delayMs);
      return;
    }
    if (state === "active") {
      // já está processando; agenda outro na sequência com id diferente
      await q.add(name, data, { jobId: `${jobId}-${Date.now()}`, delay: delayMs });
      return;
    }
    await existing.remove().catch(() => null);
  }
  await q.add(name, data, { jobId, delay: delayMs });
}
