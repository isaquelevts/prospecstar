"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowRight, Smartphone, Trash2 } from "lucide-react";
import { Button, Card, Field, Input, PageHeader, Toggle, api, useAction, useApi } from "@/components/ui";

type Setting = { key: string; label: string; secret: boolean; value: string };
type Stage = { id: string; name: string; color: string; isWon: boolean; isLost: boolean; _count: { leads: number } };

const BOOL_KEYS = ["PAUSE_AI_ON_HUMAN"];
const GROUPS = [
  { id: "ia", title: "Inteligência artificial", sub: "Chave da OpenAI e comportamento da IA nas conversas.", keys: ["OPENAI_API_KEY", "PAUSE_AI_ON_HUMAN", "OPT_OUT_KEYWORDS"] },
  { id: "disparos", title: "Disparos", sub: "Proteção do número: teto de mensagens de campanha por dia, somando todas as campanhas.", keys: ["DAILY_SEND_LIMIT", "COMPETITORS"] },
  { id: "captacao", title: "Captação", sub: "Fontes de busca de empresas.", keys: ["APIFY_TOKEN", "GOOGLE_PLACES_KEY"] },
  { id: "waha", title: "WAHA (WhatsApp)", sub: "Servidor que mantém a conexão com o WhatsApp.", keys: ["WAHA_URL", "WAHA_API_KEY", "WAHA_SESSION", "PUBLIC_URL"] },
];

function StagesCard() {
  const { data, mutate } = useApi<Stage[]>("/api/stages");
  const [name, setName] = useState("");
  const { run } = useAction();
  const reorder = async (i: number, d: number) => {
    if (!data) return;
    const ids = data.map((s) => s.id);
    const [x] = ids.splice(i, 1);
    ids.splice(i + d, 0, x);
    await run(() => api("/api/stages", { method: "PUT", body: { ids } }));
    mutate();
  };
  return (
    <Card className="p-5">
      <h2 className="mb-1 font-semibold">Etapas do funil</h2>
      <p className="text-muted-foreground mb-4 text-sm">A primeira etapa recebe os leads novos. A etapa marcada como “perdido” recebe quem disser que não tem interesse.</p>
      <ul className="space-y-2">
        {data?.map((s, i) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2">
            <input
              type="color"
              value={s.color}
              aria-label={`Cor de ${s.name}`}
              onChange={async (e) => {
                await api(`/api/stages/${s.id}`, { method: "PATCH", body: { color: e.target.value } });
                mutate();
              }}
              className="size-9 cursor-pointer rounded-md border bg-transparent p-1"
            />
            <Input
              defaultValue={s.name}
              className="max-w-56"
              onBlur={async (e) => {
                if (e.target.value && e.target.value !== s.name) {
                  await run(() => api(`/api/stages/${s.id}`, { method: "PATCH", body: { name: e.target.value } }), "Etapa renomeada");
                  mutate();
                }
              }}
            />
            <span className="text-muted-foreground w-16 text-xs tabular-nums">{s._count.leads} leads</span>
            <Toggle
              checked={s.isWon}
              onChange={async (v) => {
                await api(`/api/stages/${s.id}`, { method: "PATCH", body: { isWon: v } });
                mutate();
              }}
              label="ganho"
            />
            <Toggle
              checked={s.isLost}
              onChange={async (v) => {
                await api(`/api/stages/${s.id}`, { method: "PATCH", body: { isLost: v } });
                mutate();
              }}
              label="perdido"
            />
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => reorder(i, -1)} aria-label="Subir">
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="sm" disabled={i === data.length - 1} onClick={() => reorder(i, 1)} aria-label="Descer">
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Excluir ${s.name}`}
                onClick={async () => {
                  await run(() => api(`/api/stages/${s.id}`, { method: "DELETE" }), "Etapa excluída");
                  mutate();
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await run(() => api("/api/stages", { body: { name } }), "Etapa criada");
          setName("");
          mutate();
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova etapa" className="max-w-56" />
        <Button variant="outline">Adicionar</Button>
      </form>
    </Card>
  );
}

export default function SettingsPage() {
  const { data, mutate } = useApi<Setting[]>("/api/settings", { revalidateOnFocus: false });
  const [values, setValues] = useState<Record<string, string>>({});
  const { run, busy } = useAction();

  useEffect(() => {
    if (data) setValues(Object.fromEntries(data.map((s) => [s.key, s.value])));
  }, [data]);

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="space-y-6">
        <Link href="/whatsapp" className="hover:bg-accent/50 flex items-center gap-4 rounded-xl border p-5 shadow-sm transition-colors">
          <span className="bg-whatsapp/15 text-whatsapp flex size-10 items-center justify-center rounded-lg">
            <Smartphone className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">WhatsApp</span>
            <span className="text-muted-foreground block text-sm">Conectar número, QR code, mensagem de teste e diagnóstico ficam na tela WhatsApp.</span>
          </span>
          <ArrowRight className="text-muted-foreground size-4" />
        </Link>

        <Card className="p-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await run(() => api("/api/settings", { method: "PUT", body: values }), "Configurações salvas");
              mutate();
            }}
            className="space-y-8"
          >
            {GROUPS.map((g) => (
              <section key={g.title} id={g.id} className="scroll-mt-6">
                <h2 className="font-semibold">{g.title}</h2>
                <p className="text-muted-foreground mb-4 text-sm">{g.sub}</p>
                <div className="grid gap-4 md:grid-cols-2">
                  {g.keys.map((key) => {
                    const s = data?.find((x) => x.key === key);
                    if (!s) return null;
                    if (BOOL_KEYS.includes(key))
                      return (
                        <div key={key} className="flex items-center md:col-span-2">
                          <Toggle checked={values[key] === "true"} onChange={(v) => setValues({ ...values, [key]: String(v) })} label={s.label.replace(/ \(true\/false\)/, "")} />
                        </div>
                      );
                    return (
                      <Field key={key} label={s.label}>
                        <Input
                          type={s.secret ? "password" : "text"}
                          autoComplete="off"
                          value={values[key] ?? ""}
                          onFocus={(e) => s.secret && e.target.value.startsWith("••") && setValues({ ...values, [key]: "" })}
                          onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                          className={s.secret ? "font-mono" : ""}
                        />
                      </Field>
                    );
                  })}
                </div>
              </section>
            ))}
            <Button disabled={busy}>Salvar configurações</Button>
          </form>
        </Card>

        <StagesCard />
      </div>
    </>
  );
}
