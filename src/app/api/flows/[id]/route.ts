import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { FlowInput } from "@/lib/schemas";
import { validateGraph } from "@/lib/flow-graph";
import type { FlowStep, TriggerConfig } from "@/lib/flow-types";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const flow = await prisma.flow.findUniqueOrThrow({ where: { id } });
  const runs = await prisma.flowRun.findMany({
    where: { flowId: id },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { lead: { select: { id: true, name: true } } },
  });
  return { flow, runs };
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const data = FlowInput.partial().parse(await body(req));
  const current = await prisma.flow.findUniqueOrThrow({ where: { id } });
  const steps = (data.steps ?? current.steps) as FlowStep[];
  const config = (data.triggerConfig ?? current.triggerConfig) as TriggerConfig;
  validateGraph(steps, config);
  if (data.steps || data.triggerConfig) {
    const running = await prisma.flowRun.count({ where: { flowId: id, status: { in: ["RUNNING", "WAITING"] } } });
    if (running && (JSON.stringify(data.steps ?? current.steps) !== JSON.stringify(current.steps) || JSON.stringify(data.triggerConfig ?? current.triggerConfig) !== JSON.stringify(current.triggerConfig))) {
      return Response.json({ error: "Há execuções em andamento. Pare todas antes de alterar os passos ou o gatilho." }, { status: 409 });
    }
  }
  return prisma.flow.update({
    where: { id },
    data: {
      ...data,
      ...(data.triggerConfig ? { triggerConfig: data.triggerConfig as object } : {}),
      ...(data.steps ? { steps: data.steps as object[] } : {}),
    },
  });
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  await prisma.flow.delete({ where: { id } });
  return { ok: true };
});

/** Para todas as execuções em andamento deste fluxo. */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const r = await prisma.flowRun.updateMany({ where: { flowId: id, status: { in: ["RUNNING", "WAITING"] } }, data: { status: "STOPPED" } });
  return { stopped: r.count };
});
