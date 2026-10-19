"use client";

import Link from "next/link";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bot, Check, CheckCheck, CircleAlert, Clock, LoaderCircle, Megaphone, RotateCw, SendHorizontal, Sparkles, Workflow, Zap } from "lucide-react";
import { api, useAction, useApi, useToast, Toggle } from "@/components/ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type Msg = {
  id: string;
  direction: "IN" | "OUT";
  body: string;
  author: string;
  status: string;
  error?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  createdAt: string;
};

/** Imagem, áudio ou vídeo da mensagem (o arquivo é servido pelo app em /api/messages/:id/media). */
function Media({ m }: { m: Msg }) {
  const src = `/api/messages/${m.id}/media`;
  const type = m.mediaType ?? "";
  if (type.startsWith("image/"))
    return (
      <a href={src} target="_blank" rel="noreferrer" className="-mx-1 -mt-0.5 mb-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Imagem da conversa" loading="lazy" className="max-h-72 w-full rounded-xl object-cover" />
      </a>
    );
  if (type.startsWith("audio/")) return <audio src={src} controls preload="none" className="mb-1 h-10 max-w-full" />;
  if (type.startsWith("video/")) return <video src={src} controls preload="metadata" className="mb-1 max-h-72 rounded-xl" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="mb-1 block underline">
      Abrir arquivo
    </a>
  );
}

const AUTHOR: Record<string, { label: string; icon: typeof Bot }> = {
  ai: { label: "IA", icon: Sparkles },
  campaign: { label: "Disparo", icon: Megaphone },
  flow: { label: "Automação", icon: Workflow },
};

const DEFAULT_REPLIES = [
  "{{saudacao}}, {{primeiro_nome}}! Tudo bem?",
  "Posso te mandar alguns exemplos de sites que fizemos?",
  "Qual o melhor horário para uma ligação rápida de 10 minutos?",
  "Obrigado pelo retorno! Qualquer dúvida estou por aqui.",
];
const REPLIES_KEY = "prospec.quickReplies";

function loadReplies(): string[] {
  try {
    const raw = localStorage.getItem(REPLIES_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(list) && list.every((x) => typeof x === "string") ? list : DEFAULT_REPLIES;
  } catch {
    return DEFAULT_REPLIES;
  }
}

function saveReplies(list: string[]) {
  try {
    localStorage.setItem(REPLIES_KEY, JSON.stringify(list));
  } catch {
    // armazenamento bloqueado: as respostas valem só nesta aba
  }
}

/** Mesmo conjunto básico de variáveis das campanhas, resolvido no navegador. */
function fillVars(text: string, leadName?: string) {
  const name = leadName?.trim() ?? "";
  const hour = new Date().getHours();
  const vars: Record<string, string> = {
    nome: name,
    empresa: name,
    primeiro_nome: name.split(/\s+/)[0] ?? "",
    saudacao: hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite",
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => vars[k.toLowerCase()] ?? m);
}

function dayLabel(d: Date) {
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function MessageStatus({ status, className }: { status: string; className?: string }) {
  const cls = cn("size-3.5 shrink-0", className);
  if (status === "pending") return <Clock className={cls} aria-label="enviando" />;
  if (status === "failed") return <CircleAlert className={cn(cls, "text-red-400")} aria-label="falhou" />;
  if (status === "read") return <CheckCheck className={cn(cls, "text-sky-400")} aria-label="lida" />;
  if (status === "delivered") return <CheckCheck className={cls} aria-label="entregue" />;
  if (status === "sent") return <Check className={cls} aria-label="enviada" />;
  return null;
}

function Bubble({ m, onRetry, retrying }: { m: Msg; onRetry: (id: string) => void; retrying: boolean }) {
  const out = m.direction === "OUT";
  const author = AUTHOR[m.author];
  const time = new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className="flex max-w-[80%] flex-col items-end gap-1 sm:max-w-[70%]">
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap shadow-xs",
            out ? "bg-primary text-primary-foreground rounded-br-md" : "bg-background self-start rounded-bl-md border",
            m.status === "failed" && "ring-destructive/60 ring-2",
          )}
        >
          {out && author && (
            <span className="text-primary-foreground/70 mb-0.5 flex items-center gap-1 text-[11px] font-medium">
              <author.icon className="size-3" />
              {author.label}
            </span>
          )}
          {m.mediaUrl && <Media m={m} />}
          {!(m.mediaUrl && m.body.startsWith("[mídia")) && m.body}
          <span className={cn("float-right mt-1.5 ml-3 flex translate-y-0.5 items-center gap-1 text-[10px] tabular-nums", out ? "text-primary-foreground/60" : "text-muted-foreground")}>
            {time}
            {out && <MessageStatus status={m.status} />}
          </span>
        </div>
        {m.status === "failed" && (
          <div className="text-destructive flex items-center gap-2 text-xs">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="max-w-64 cursor-help truncate">Não enviada{m.error ? `: ${m.error}` : ""}</span>
              </TooltipTrigger>
              {m.error && <TooltipContent className="max-w-sm">{m.error}</TooltipContent>}
            </Tooltip>
            {!m.id.startsWith("tmp-") && (
              <Button variant="outline" size="sm" className="h-6 px-2 text-xs" disabled={retrying} onClick={() => onRetry(m.id)}>
                <RotateCw className="size-3" />
                Tentar de novo
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatPanel({
  leadId,
  leadName,
  aiEnabled,
  onChange,
  showToolbar = true,
  connected = true,
}: {
  leadId: string;
  leadName?: string;
  aiEnabled: boolean;
  onChange?: () => void;
  showToolbar?: boolean;
  connected?: boolean;
}) {
  const { data: messages, mutate } = useApi<Msg[]>(`/api/leads/${leadId}/messages`, { refreshInterval: 3000 });
  const { data: presence } = useApi<{ typing: boolean }>(`/api/leads/${leadId}/typing`, { refreshInterval: connected === false ? 0 : 2500 });
  const [text, setText] = useState("");
  const [replies, setReplies] = useState<string[]>(DEFAULT_REPLIES);
  const [sending, setSending] = useState(false);
  const { run, busy } = useAction();
  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  useEffect(() => setReplies(loadReplies()), []);
  useEffect(() => {
    setText("");
    stick.current = true;
  }, [leadId]);

  // rola para o fim quando chega mensagem nova, mas só se o usuário já estava no fim
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, presence?.typing]);

  async function send(body = text) {
    const t = body.trim();
    if (!t || sending) return;
    setText("");
    setSending(true);
    stick.current = true;
    const temp: Msg = { id: `tmp-${Date.now()}`, direction: "OUT", body: t, author: "human", status: "pending", createdAt: new Date().toISOString() };
    await mutate(
      async (current) => {
        try {
          await api(`/api/leads/${leadId}/messages`, { body: { text: t } });
        } catch (e) {
          // mostra a falha na própria bolha; o servidor também já registrou como "failed"
          const err = e instanceof Error ? e.message : String(e);
          toast(err, "error");
          return [...(current ?? []), { ...temp, status: "failed", error: err }];
        }
        return undefined;
      },
      { optimisticData: (current) => [...(current ?? []), temp], populateCache: (r, current) => r ?? current ?? [], revalidate: true, rollbackOnError: false },
    );
    setSending(false);
    onChange?.();
    inputRef.current?.focus();
  }

  async function retry(id: string) {
    await run(() => api(`/api/leads/${leadId}/messages`, { body: { retryId: id } }), "Mensagem reenviada");
    mutate();
  }

  const list = messages ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showToolbar && (
        <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
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
            <Bot />
            IA responder agora
          </Button>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="chat-wallpaper scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6"
      >
        {!messages && (
          <div className="text-muted-foreground flex h-full items-center justify-center">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        )}
        {messages && !list.length && (
          <div className="flex h-full items-center justify-center">
            <p className="bg-background text-muted-foreground rounded-full border px-4 py-1.5 text-xs shadow-xs">Nenhuma mensagem ainda — escreva a primeira abaixo.</p>
          </div>
        )}
        <div className="space-y-1.5">
          {list.map((m, i) => {
            const d = new Date(m.createdAt);
            const prev = list[i - 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== d.toDateString();
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="flex justify-center py-2">
                    <span className="bg-background text-muted-foreground rounded-md border px-2.5 py-0.5 text-[11px] font-medium shadow-xs">{dayLabel(d)}</span>
                  </div>
                )}
                <Bubble m={m} onRetry={retry} retrying={busy} />
              </Fragment>
            );
          })}
          {presence?.typing && (
            <div className="flex justify-start">
              <span className="bg-background text-muted-foreground animate-pulse rounded-2xl rounded-bl-md border px-3 py-2 text-xs shadow-xs">digitando…</span>
            </div>
          )}
        </div>
      </div>

      {!connected && (
        <div className="flex items-center gap-2 border-t bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <CircleAlert className="size-4 shrink-0" />
          <span className="flex-1">WhatsApp desconectado — as mensagens não serão enviadas.</span>
          <Link href="/whatsapp" className="font-medium underline underline-offset-2">
            Conectar
          </Link>
        </div>
      )}

      <form
        className="bg-background flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Respostas rápidas">
                  <Zap />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Respostas rápidas</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-80">
            <DropdownMenuLabel>Respostas rápidas</DropdownMenuLabel>
            {replies.map((r) => (
              <DropdownMenuItem
                key={r}
                onSelect={() => {
                  setText(fillVars(r, leadName));
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
                className="group"
              >
                <span className="line-clamp-2 flex-1">{r}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 group-focus:opacity-100"
                  aria-label="Remover resposta rápida"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const next = replies.filter((x) => x !== r);
                    setReplies(next);
                    saveReplies(next);
                  }}
                >
                  ✕
                </button>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!text.trim() || replies.includes(text.trim())}
              onSelect={() => {
                const next = [...replies, text.trim()];
                setReplies(next);
                saveReplies(next);
              }}
            >
              Salvar o texto atual como resposta rápida
            </DropdownMenuItem>
            <p className="text-muted-foreground px-2 pt-1 pb-1.5 text-[11px]">
              Variáveis: {"{{primeiro_nome}}"}, {"{{nome}}"}, {"{{saudacao}}"}
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={connected ? "Escreva uma mensagem…" : "WhatsApp desconectado"}
          aria-label="Mensagem"
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 field-sizing-content max-h-40 min-h-9 flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
        />
        <Button type="submit" size="icon" disabled={sending || !text.trim()} aria-label="Enviar">
          {sending ? <LoaderCircle className="animate-spin" /> : <SendHorizontal />}
        </Button>
      </form>
      <p className="text-muted-foreground bg-background hidden px-4 pb-2 text-[11px] sm:block">Enter envia · Shift+Enter quebra linha</p>
    </div>
  );
}
