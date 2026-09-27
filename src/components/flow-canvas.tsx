"use client";

import { useCallback, useMemo } from "react";
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { STEP_LABELS, TRIGGERS, type FlowStep, type TriggerConfig, type TriggerType } from "@/lib/flow-types";

type Graph = { steps: FlowStep[]; triggerConfig: TriggerConfig; trigger: TriggerType };
type BlockData = Record<string, unknown> & { title: string; detail: string; condition?: boolean; trigger?: boolean };

function Block({ data, selected }: NodeProps<Node<BlockData>>) {
  return (
    <div className={`relative w-56 rounded-xl border-2 bg-white px-4 py-3 shadow-sm ${selected ? "border-cobalt" : data.trigger ? "border-emerald-500" : "border-line"}`}>
      {!data.trigger && <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-cobalt" />}
      <p className="text-xs font-semibold uppercase tracking-wide text-mute">{data.trigger ? "Gatilho" : data.condition ? "Condição" : "Ação"}</p>
      <p className="mt-1 text-sm font-bold text-ink">{data.title}</p>
      <p className="mt-1 line-clamp-2 text-xs text-mute">{data.detail}</p>
      <Handle type="source" id="next" position={Position.Bottom} className="!h-3 !w-3 !bg-cobalt" style={{ left: data.condition ? "30%" : "50%" }} />
      {data.condition && <Handle type="source" id="false" position={Position.Bottom} className="!h-3 !w-3 !bg-heat" style={{ left: "70%" }} />}
      {data.condition && <div className="mt-3 flex justify-between text-[10px] font-bold text-mute"><span>SIM</span><span>NÃO</span></div>}
    </div>
  );
}

const nodeTypes = { block: Block };

export function ensureGraph(graph: Graph): Graph {
  if (graph.triggerConfig.graphVersion === 1) return graph;
  const steps = graph.steps.map((step, index) => ({
    ...step,
    id: crypto.randomUUID(),
    position: { x: 120, y: 160 + index * 160 },
  }));
  return {
    ...graph,
    steps: steps.map((step, index) => ({
      ...step,
      nextStepId: steps[index + 1]?.id ?? null,
      falseStepId: step.type === "condition" && step.onFail === "skip_next" ? steps[index + 2]?.id ?? null : null,
    })),
    triggerConfig: { ...graph.triggerConfig, graphVersion: 1, startStepId: steps[0]?.id ?? null },
  };
}

function description(step: FlowStep) {
  if (step.type === "send_message") return step.texts[0] || "Configure a mensagem";
  if (step.type === "ai_message") return step.instruction || "Configure a instrução";
  if (step.type === "wait") return `Esperar ${step.amount} ${step.unit === "days" ? "dia(s)" : step.unit === "hours" ? "hora(s)" : "minuto(s)"}`;
  if (step.type === "condition") return `${step.field} ${step.op} ${step.value}`;
  if (step.type === "add_tag" || step.type === "remove_tag") return step.tag || "Configure a tag";
  if (step.type === "webhook") return step.url || "Configure a URL";
  return "Clique para configurar";
}

export function FlowCanvas({ graph, onChange, selected, onSelect }: { graph: Graph; onChange: (graph: Graph) => void; selected: string | null; onSelect: (id: string | null) => void }) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node<BlockData>[] = [
      { id: "trigger", type: "block", position: { x: 120, y: 0 }, data: { title: TRIGGERS[graph.trigger], detail: "Início da automação", trigger: true }, deletable: false, draggable: false },
      ...graph.steps.map((step, index) => ({ id: step.id!, type: "block", position: step.position ?? { x: 120, y: 160 + index * 160 }, selected: selected === step.id, data: { title: STEP_LABELS[step.type], detail: description(step), condition: step.type === "condition" } })),
    ];
    const edges: Edge[] = [];
    const add = (source: string, target: string | null | undefined, handle = "next") => {
      if (target) edges.push({ id: `${source}:${handle}:${target}`, source, target, sourceHandle: handle, type: "smoothstep", animated: false, label: handle === "false" ? "Não" : source === "trigger" ? "Iniciar" : undefined, style: { stroke: handle === "false" ? "#f0531c" : "#2340e8", strokeWidth: 2 } });
    };
    add("trigger", graph.triggerConfig.startStepId);
    for (const step of graph.steps) {
      add(step.id!, step.nextStepId);
      if (step.type === "condition") add(step.id!, step.falseStepId, "false");
    }
    return { nodes, edges };
  }, [graph, selected]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.target === "trigger" || connection.source === connection.target) return;
    if (connection.sourceHandle === "false" && graph.steps.find((s) => s.id === connection.source)?.type !== "condition") return;
    const key = connection.sourceHandle === "false" ? "falseStepId" : "nextStepId";
    const proposed = connection.source === "trigger"
      ? { ...graph, triggerConfig: { ...graph.triggerConfig, startStepId: connection.target } }
      : { ...graph, steps: graph.steps.map((step) => step.id === connection.source ? { ...step, [key]: connection.target } : step) };
    const seen = new Set<string>();
    const visit = (id: string): boolean => {
      if (id === connection.source) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      const step = proposed.steps.find((s) => s.id === id);
      return !!step && [step.nextStepId, step.falseStepId].some((next) => next ? visit(next) : false);
    };
    if (visit(connection.target)) return;
    onChange(proposed);
  }, [graph, onChange]);

  return (
    <div className="h-[580px] overflow-hidden rounded-xl border border-line bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        onConnect={onConnect}
        onNodeClick={(_, node) => onSelect(node.id === "trigger" ? null : node.id)}
        onPaneClick={() => onSelect(null)}
        onNodeDragStop={(_, node) => {
          if (node.id !== "trigger") onChange({ ...graph, steps: graph.steps.map((s) => s.id === node.id ? { ...s, position: node.position } : s) });
        }}
        onEdgesDelete={(deleted) => {
          let config = graph.triggerConfig;
          let steps = graph.steps;
          for (const edge of deleted) {
            if (edge.source === "trigger") config = { ...config, startStepId: null };
            else steps = steps.map((step) => step.id === edge.source ? { ...step, [edge.sourceHandle === "false" ? "falseStepId" : "nextStepId"]: null } : step);
          }
          onChange({ ...graph, steps, triggerConfig: config });
        }}
        nodesConnectable
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background color="#d5dae5" />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </div>
  );
}
