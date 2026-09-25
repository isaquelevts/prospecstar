import { z } from "zod";

// Sem .default(): no zod 4 os padrões seriam aplicados também no .partial() das edições,
// sobrescrevendo campos que não vieram na requisição. Os padrões ficam no schema do Prisma.

export const CampaignInput = z.object({
  name: z.string().min(1),
  templates: z.array(z.string()).min(1),
  filter: z.record(z.string(), z.any()).optional(),
  minDelaySec: z.number().int().min(10).optional(),
  maxDelaySec: z.number().int().min(10).optional(),
  dailyLimit: z.number().int().min(1).max(1000).optional(),
  windowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  windowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  agentId: z.string().nullable().optional(),
  moveToStageId: z.string().nullable().optional(),
  session: z.string().optional(),
});

export const AgentInput = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  model: z.string().min(1).optional(),
  effort: z.enum(["minimal", "low", "medium", "high"]).optional(),
  systemPrompt: z.string().min(1),
  knowledge: z.string().optional(),
  debounceSec: z.number().int().min(0).max(600).optional(),
  historyLimit: z.number().int().min(4).max(200).optional(),
  splitMessages: z.boolean().optional(),
  canMoveStage: z.boolean().optional(),
  canTag: z.boolean().optional(),
  canHandoff: z.boolean().optional(),
  canSaveInfo: z.boolean().optional(),
  handoffWebhook: z.string().nullable().optional(),
});

export const FlowInput = z.object({
  name: z.string().min(1),
  active: z.boolean().optional(),
  trigger: z.enum(["LEAD_CREATED", "MESSAGE_RECEIVED", "STAGE_CHANGED", "TAG_ADDED", "NO_REPLY", "MANUAL"]),
  triggerConfig: z.record(z.string(), z.any()).optional(),
  steps: z.array(z.record(z.string(), z.any())).optional(),
  stopOnReply: z.boolean().optional(),
});
