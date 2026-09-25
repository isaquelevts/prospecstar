"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Textarea, Toggle, api, timeAgo, useAction, useApi } from "@/components/ui";

type Job = {
  id: string;
  provider: string;
  query: string;
  status: string;
  itemsFound: number;
  itemsImported: number;
  itemsSkipped: number;
  error: string | null;
  tags: string[];
  createdAt: string;
};

const PROVIDERS = [
  { id: "apify_maps", label: "Google Maps via Apify", note: "Melhor opção: até milhares de empresas por busca. Cobra créditos da sua conta Apify." },
  { id: "google_places", label: "Google Places API", note: "Oficial do Google, até 60 resultados por busca. Usa sua chave do Google Cloud." },
  { id: "apify_custom", label: "Outro actor da Apify", note: "Qualquer actor (Instagram, listas, diretórios). Os campos são mapeados automaticamente." },
];

const STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Na fila", color: "#6b7280" },
  RUNNING: { label: "Coletando", color: "#2340e8" },
  IMPORTING: { label: "Importando", color: "#2340e8" },
  DONE: { label: "Concluído", color: "#138a52" },
  FAILED: { label: "Falhou", color: "#c9302c" },
};

const SUGGESTIONS = ["dentista", "advogado", "clínica de estética", "pet shop", "oficina mecânica", "salão de beleza", "restaurante", "academia", "contabilidade", "imobiliária"];

export default function ScraperPage() {
  const { data: jobs, mutate } = useApi<Job[]>("/api/scrape", { refreshInterval: 5000 });
  const [provider, setProvider] = useState("apify_maps");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [max, setMax] = useState(100);
  const [tags, setTags] = useState("");
  const [requirePhone, setRequirePhone] = useState(true);
  const [actorId, setActorId] = useState("");
  const [actorInput, setActorInput] = useState('{\n  \n}');
  const { run, busy } = useAction();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const base = { provider, requirePhone, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) };
    let payload: Record<string, unknown>;
    if (provider === "apify_custom") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(actorInput);
      } catch {
        return run(async () => {
          throw new Error("O input do actor não é um JSON válido.");
        });
      }
      payload = { ...base, actorId, actorInput: parsed };
    } else payload = { ...base, query, location, max: provider === "google_places" ? Math.min(max, 60) : max };
    const r = await run(() => api("/api/scrape", { body: payload }), "Busca iniciada — os leads vão aparecendo conforme chegam");
    if (r) mutate();
  }

  return (
    <>
      <PageHeader title="Captação" sub="Busque empresas por segmento e cidade. Cada lead é analisado: quem não tem site ou tem só Instagram vira lead quente." />

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card className="h-fit p-5">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Fonte" hint={PROVIDERS.find((p) => p.id === provider)?.note}>
              <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>

            {provider === "apify_custom" ? (
              <>
                <Field label="ID do actor" hint="Ex: apify/instagram-profile-scraper">
                  <Input required value={actorId} onChange={(e) => setActorId(e.target.value)} className="font-mono" />
                </Field>
                <Field label="Input do actor (JSON)">
                  <Textarea rows={8} value={actorInput} onChange={(e) => setActorInput(e.target.value)} className="font-mono text-xs" />
                </Field>
              </>
            ) : (
              <>
                <Field label="O que buscar" hint={provider === "apify_maps" ? "Um termo por linha para buscar vários de uma vez." : undefined}>
                  {provider === "apify_maps" ? (
                    <Textarea required rows={3} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={"dentista\nclínica odontológica"} />
                  ) : (
                    <Input required value={query} onChange={(e) => setQuery(e.target.value)} placeholder="dentista em Campinas SP" />
                  )}
                </Field>
                <div className="flex flex-wrap gap-1">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setQuery(provider === "apify_maps" && query ? `${query}\n${s}` : s)}
                      className="rounded-md border border-line px-2 py-0.5 text-xs text-mute hover:border-ink/30 hover:text-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {provider === "apify_maps" && (
                  <Field label="Onde" hint="Cidade, bairro ou região. Ex: Campinas, SP, Brasil">
                    <Input required value={location} onChange={(e) => setLocation(e.target.value)} />
                  </Field>
                )}
                <Field label={provider === "apify_maps" ? "Máximo por termo" : "Máximo de resultados (até 60)"}>
                  <Input type="number" min={1} max={provider === "google_places" ? 60 : 5000} value={max} onChange={(e) => setMax(Number(e.target.value))} />
                </Field>
              </>
            )}

            <Field label="Tags para os leads" hint="Separadas por vírgula. Útil para filtrar a campanha depois.">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ex: dentistas-campinas" />
            </Field>
            <Toggle checked={requirePhone} onChange={setRequirePhone} label="Importar só empresas com telefone" />
            <Button className="w-full" disabled={busy}>
              {busy ? "Iniciando…" : "Iniciar busca"}
            </Button>
          </form>
        </Card>

        <Card>
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-display text-lg font-bold">Buscas</h2>
          </div>
          {!jobs?.length ? (
            <p className="p-8 text-center text-sm text-mute">Suas buscas aparecem aqui, com o progresso da importação.</p>
          ) : (
            <ul className="divide-y divide-line">
              {jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{j.query.replace(/\n/g, ", ")}</p>
                    <p className="text-xs text-mute">
                      {PROVIDERS.find((p) => p.id === j.provider)?.label} · {timeAgo(j.createdAt)}
                      {j.tags.length > 0 && ` · ${j.tags.join(", ")}`}
                    </p>
                    {j.error && <p className="mt-1 text-xs text-bad">{j.error}</p>}
                  </div>
                  <span className="font-mono text-xs text-mute tabular-nums">
                    {j.itemsImported} novos · {j.itemsSkipped} ignorados{j.itemsFound ? ` · ${j.itemsFound} achados` : ""}
                  </span>
                  <Badge color={STATUS[j.status]?.color}>{STATUS[j.status]?.label ?? j.status}</Badge>
                  {j.itemsImported > 0 && (
                    <Link href={`/leads?scrapeJobId=${j.id}`} className="text-xs text-cobalt hover:underline">
                      ver leads
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
