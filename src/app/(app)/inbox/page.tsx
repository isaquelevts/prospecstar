"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ChatPanel } from "@/components/chat";
import { Badge, Card, Input, formatPhone, timeAgo, useApi } from "@/components/ui";

type Row = {
  id: string;
  name: string;
  phone: string | null;
  unread: number;
  aiEnabled: boolean;
  lastMessageAt: string;
  stage: { name: string; color: string } | null;
  messages: { body: string; direction: string }[];
};

const FILTERS = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "Não lidas" },
  { id: "human", label: "Aguardando você" },
  { id: "ai", label: "Com IA" },
];

function Inbox() {
  const sp = useSearchParams();
  const router = useRouter();
  const selected = sp.get("lead");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const { data, mutate } = useApi<Row[]>(`/api/inbox?filter=${filter}&q=${encodeURIComponent(q)}`, { refreshInterval: 5000 });
  const inList = data?.find((r) => r.id === selected);
  // a conversa pode sair do filtro (ex: "não lidas" depois de lida) — busca direto nesse caso
  const { data: fallback, mutate: mutateFallback } = useApi<Row>(selected && data && !inList ? `/api/leads/${selected}` : null);
  const current = inList ?? fallback;
  const refresh = () => {
    mutate();
    mutateFallback();
  };

  return (
    <Card className="grid h-[calc(100vh-7rem)] overflow-hidden md:grid-cols-[340px_1fr]">
      <div className={`flex min-h-0 flex-col border-r border-line ${selected ? "hidden md:flex" : "flex"}`}>
        <div className="space-y-3 border-b border-line p-3">
          <Input placeholder="Buscar por nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-md px-2.5 py-1 text-xs ${filter === f.id ? "bg-ink text-white" : "text-mute hover:bg-ink/5"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {data?.length === 0 && <li className="p-6 text-center text-sm text-mute">Nenhuma conversa aqui.</li>}
          {data?.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => router.replace(`/inbox?lead=${r.id}`)}
                className={`block w-full border-b border-line px-4 py-3 text-left hover:bg-paper ${selected === r.id ? "bg-cobalt-soft" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
                  <span className="text-[11px] text-mute">{timeAgo(r.lastMessageAt)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-mute">
                    {r.messages[0]?.direction === "OUT" && "Você: "}
                    {r.messages[0]?.body}
                  </span>
                  {r.aiEnabled && <span className="rounded bg-cobalt-soft px-1 text-[10px] font-semibold text-cobalt">IA</span>}
                  {r.unread > 0 && <span className="rounded-full bg-heat px-1.5 font-mono text-[10px] text-white">{r.unread}</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={`min-h-0 flex-col ${selected ? "flex" : "hidden md:flex"}`}>
        {current ? (
          <>
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <button className="text-sm text-mute md:hidden" onClick={() => router.replace("/inbox")}>
                ← Voltar
              </button>
              <div className="min-w-0 flex-1">
                <Link href={`/leads/${current.id}`} className="font-display font-bold hover:text-cobalt">
                  {current.name}
                </Link>
                <p className="font-mono text-xs text-mute">{formatPhone(current.phone)}</p>
              </div>
              {current.stage && <Badge color={current.stage.color}>{current.stage.name}</Badge>}
            </div>
            <div className="min-h-0 flex-1">
              <ChatPanel leadId={current.id} aiEnabled={current.aiEnabled} onChange={refresh} />
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-sm text-mute">Escolha uma conversa à esquerda.</div>
        )}
      </div>
    </Card>
  );
}

export default function InboxPage() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}
