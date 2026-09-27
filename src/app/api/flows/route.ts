import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { FlowInput } from "@/lib/schemas";
import { validateGraph } from "@/lib/flow-graph";
import type { FlowStep, TriggerConfig } from "@/lib/flow-types";

export const GET = route(async () => {
  const flows = await prisma.flow.findMany({ orderBy: { createdAt: "asc" } });
  const stats = await prisma.flowRun.groupBy({ by: ["flowId", "status"], _count: true });
  return flows.map((f) => ({
    ...f,
    stats: Object.fromEntries(stats.filter((s) => s.flowId === f.id).map((s) => [s.status, s._count])),
  }));
});

export const POST = route(async (req) => {
  const data = FlowInput.parse(await body(req));
  validateGraph((data.steps ?? []) as FlowStep[], (data.triggerConfig ?? {}) as TriggerConfig);
  return prisma.flow.create({ data: { ...data, triggerConfig: data.triggerConfig as object, steps: data.steps as object[] } });
});
