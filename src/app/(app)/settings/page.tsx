"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, PageHeader, Toggle, api, useAction, useApi } from "@/components/ui";

type Setting = { key: string; label: string; secret: boolean; value: string };
type WA = { reachable: boolean; session: string; status: string; me?: { id: string; pushName?: string } | null; qr?: string | null; error?: string };
type Stage = { id: string; name: string; color: string; isWon: boolean; isLost: boolean; _count: { leads: number } };

const WA_STATUS: Record<string, string> = {
  WORKING: "Conectado",
  SCAN_QR_CODE: "Aguardando leitura do QR code",
  STARTING: "Iniciando…",
  STOPPED: "Parado",
  FAILED: "Falhou — clique em Conectar de novo",
  NOT_CREATED: "Ainda não conectado",
  UNREACHABLE: "WAHA fora do ar ou URL/API key incorreta",
};

const BOOL_KEYS = ["AUTO_REPLY_NEW", "PAUSE_AI_ON_HUMAN"];
const GROUPS = [
  { title: "Inteligência artificial", keys: ["OPENAI_API_KEY", "AUTO_REPLY_NEW", "PAUSE_AI_ON_HUMAN", "OPT_OUT_KEYWORDS"] },
  { title: "Captação", keys: ["APIFY_TOKEN", "GOOGLE_PLACES_KEY"] },
  { title: "WAHA (WhatsApp)", keys: ["WAHA_URL", "WAHA_API_KEY", "WAHA_SESSION", "PUBLIC_URL"] },
];

function WhatsAppCard() {
  const { data, mutate } = useApi<WA>("/api/whatsapp", { refreshInterval: (d) => (d?.status === "WORKING" ? 30_000 : 4000) });
  const { run, busy } = useAction();
  const act = async (action: string, msg: string) => {
    await run(() => api("/api/whatsapp", { body: { action } }), msg);
    mutate();
  };
  const ok = data?.status === "WORKING";

  return (
    <Card className="p-5" >
      <div id="whatsapp" className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold">WhatsApp</h2>
          <p className="mt-1 flex items-center gap-2 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-ok" : "bg-heat"}`} />
            {WA_STATUS[data?.status ?? ""] ?? data?.status ?? "Verificando…"}
            {ok && data?.me && <span className="text-mute">· {data.me.pushName} ({data.me.id.split("@")[0]})</span>}
          </p>
          {data?.error && <p className="mt-2 max-w-xl text-xs break-all text-bad">{data.error}</p>}
          <p className="mt-3 max-w-xl text-xs text-mute">
            Sessão <code className="font-mono">{data?.session}</code>. “Conectar” cria a sessão no WAHA já com o webhook deste sistema configurado. Depois, abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho, e leia o QR code.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => act("connect", "Sessão iniciada")}>
              {ok ? "Reconfigurar webhook" : "Conectar"}
            </Button>
            {ok && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => act("stop", "Sessão parada")}>
                  Parar
                </Button>
                <Button
                  variant="ghost"
                  className="text-bad"
                  disabled={busy}
                  onClick={() => confirm("Desconectar este número do sistema?") && act("logout", "Número desconectado")}
                >
                  Desconectar número
                </Button>
              </>
            )}
          </div>
        </div>
        {data?.qr && (
          <div className="rounded-xl border border-line bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.qr} alt="QR code para conectar o WhatsApp" className="h-56 w-56" />
          </div>
        )}
      </div>
    </Card>
  );
}

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
      <h2 className="mb-1 font-display text-lg font-bold">Etapas do funil</h2>
      <p className="mb-4 text-xs text-mute">A primeira etapa recebe os leads novos. A etapa marcada como “perdido” recebe quem disser que não tem interesse.</p>
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
              className="h-8 w-8 cursor-pointer rounded border border-line"
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
            <span className="w-16 font-mono text-xs text-mute">{s._count.leads} leads</span>
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
            <div className="ml-auto flex gap-1 text-xs">
              <button disabled={i === 0} onClick={() => reorder(i, -1)} className="rounded px-1.5 text-mute hover:bg-ink/5 disabled:opacity-30" aria-label="Subir">
                ↑
              </button>
              <button disabled={i === data.length - 1} onClick={() => reorder(i, 1)} className="rounded px-1.5 text-mute hover:bg-ink/5 disabled:opacity-30" aria-label="Descer">
                ↓
              </button>
              <button
                onClick={async () => {
                  await run(() => api(`/api/stages/${s.id}`, { method: "DELETE" }), "Etapa excluída");
                  mutate();
                }}
                className="rounded px-1.5 text-mute hover:bg-bad-soft hover:text-bad"
              >
                excluir
              </button>
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
        <WhatsAppCard />

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
              <section key={g.title}>
                <h2 className="mb-4 font-display text-lg font-bold">{g.title}</h2>
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
