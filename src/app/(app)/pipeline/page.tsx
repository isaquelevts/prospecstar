"use client";

import Link from "next/link";
import { useState } from "react";
import { Heat, PageHeader, SiteBadge, api, timeAgo, useAction, useApi, Input } from "@/components/ui";

type Stage = { id: string; name: string; color: string; _count: { leads: number } };
type Lead = { id: string; name: string; city: string | null; category: string | null; score: number; websiteStatus: string | null; lastInboundAt: string | null; aiEnabled: boolean; unread: number };

function Column({ stage, q, onDrop }: { stage: Stage; q: string; onDrop: (leadId: string, stageId: string) => void }) {
  const { data } = useApi<{ items: Lead[]; total: number }>(`/api/leads?stageId=${stage.id}&pageSize=60&sort=recent&q=${encodeURIComponent(q)}`, {
    refreshInterval: 20_000,
  });
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const id = e.dataTransfer.getData("text/lead");
        if (id) onDrop(id, stage.id);
      }}
      className={`flex w-72 shrink-0 flex-col rounded-xl border bg-card/60 transition-colors ${over ? "border-cobalt bg-cobalt-soft/50" : "border-line"}`}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
        <span className="font-display text-sm font-bold">{stage.name}</span>
        <span className="ml-auto font-mono text-xs text-mute">{data?.total ?? stage._count.leads}</span>
      </div>
      <div className="scroll-thin flex max-h-[calc(100vh-15rem)] flex-col gap-2 overflow-y-auto px-2 pb-2">
        {data?.items.map((l) => (
          <Link
            key={l.id}
            href={`/leads/${l.id}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/lead", l.id)}
            className="block cursor-grab rounded-lg border border-line bg-card p-3 text-sm shadow-sm hover:border-ink/25 active:cursor-grabbing"
          >
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
              {l.unread > 0 && <span className="mt-1 h-2 w-2 rounded-full bg-heat" />}
            </div>
            <p className="truncate text-xs text-mute">{[l.category, l.city].filter(Boolean).join(" · ") || "—"}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Heat score={l.score} showNumber={false} />
              <SiteBadge status={l.websiteStatus} />
            </div>
            {(l.lastInboundAt || l.aiEnabled) && (
              <p className="mt-1.5 text-[11px] text-mute">
                {l.aiEnabled && <span className="mr-1 font-semibold text-cobalt">IA</span>}
                {l.lastInboundAt && `respondeu há ${timeAgo(l.lastInboundAt)}`}
              </p>
            )}
          </Link>
        ))}
        {data && data.total > data.items.length && (
          <Link href={`/leads?stageId=${stage.id}`} className="py-2 text-center text-xs text-cobalt hover:underline">
            ver todos os {data.total}
          </Link>
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { data: stages, mutate } = useApi<Stage[]>("/api/stages");
  const [q, setQ] = useState("");
  const [version, setVersion] = useState(0);
  const { run } = useAction();

  return (
    <>
      <PageHeader
        title="Funil"
        sub="Arraste os cards entre as etapas. As etapas são editadas em Configurações."
        actions={<Input placeholder="Filtrar cards…" value={q} onChange={(e) => setQ(e.target.value)} className="w-60" />}
      />
      <div className="scroll-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8" key={version}>
        {stages?.map((s) => (
          <Column
            key={s.id}
            stage={s}
            q={q}
            onDrop={async (leadId, stageId) => {
              await run(() => api(`/api/leads/${leadId}`, { method: "PATCH", body: { stageId } }));
              mutate();
              setVersion((v) => v + 1);
            }}
          />
        ))}
      </div>
    </>
  );
}
