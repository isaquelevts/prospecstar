"use client";

import { useEffect, useRef, useState } from "react";
import { api, Button, Toggle, useAction, useApi } from "./ui";

type Msg = { id: string; direction: "IN" | "OUT"; body: string; author: string; status: string; error?: string | null; createdAt: string };

const AUTHOR: Record<string, string> = { ai: "IA", campaign: "Disparo", flow: "Automação", human: "Você" };

export function ChatPanel({ leadId, aiEnabled, onChange }: { leadId: string; aiEnabled: boolean; onChange?: () => void }) {
  const { data: messages, mutate } = useApi<Msg[]>(`/api/leads/${leadId}/messages`, { refreshInterval: 5000 });
  const [text, setText] = useState("");
  const { run, busy } = useAction();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText("");
    await run(() => api(`/api/leads/${leadId}/messages`, { body: { text: t } }));
    mutate();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <Toggle
          checked={aiEnabled}
          onChange={async (v) => {
            await run(() => api(`/api/leads/${leadId}`, { method: "PATCH", body: { aiEnabled: v } }), v ? "IA ligada para este lead" : "IA pausada");
            onChange?.();
          }}
          label={aiEnabled ? "IA respondendo" : "IA pausada"}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            await run(() => api(`/api/leads/${leadId}/messages`, { body: { aiReplyNow: true } }), "A IA vai responder em instantes");
            onChange?.();
          }}
        >
          IA responder agora
        </Button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto bg-paper px-4 py-4">
        {!messages?.length && <p className="py-10 text-center text-sm text-mute">Nenhuma mensagem ainda.</p>}
        {messages?.map((m) => {
          const out = m.direction === "OUT";
          return (
            <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  out ? (m.author === "ai" ? "rounded-br-sm bg-cobalt text-white" : "rounded-br-sm bg-ink text-white") : "rounded-bl-sm border border-line bg-card"
                }`}
              >
                {m.body}
                <div className={`mt-1 flex gap-2 text-[10px] ${out ? "text-white/60" : "text-mute"}`}>
                  {out && <span>{AUTHOR[m.author] ?? m.author}</span>}
                  <span>{new Date(m.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  {m.status === "failed" && <span className="font-semibold text-[#ffb4a8]" title={m.error ?? ""}>falhou</span>}
                  {m.status === "pending" && <span>enviando…</span>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form
        className="flex gap-2 border-t border-line bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Escreva uma mensagem (Enter envia, Shift+Enter quebra linha)"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-line px-3 py-2 text-sm focus:border-cobalt focus:outline-none"
        />
        <Button type="submit" disabled={busy || !text.trim()}>
          Enviar
        </Button>
      </form>
    </div>
  );
}
