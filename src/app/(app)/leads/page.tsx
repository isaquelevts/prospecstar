"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import { Suspense, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Heat,
  Input,
  Modal,
  PageHeader,
  Select,
  SiteBadge,
  api,
  formatPhone,
  timeAgo,
  useAction,
  useApi,
} from "@/components/ui";
import { WEBSITE_STATUS_LABEL } from "@/lib/website";

type Lead = {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  category: string | null;
  rating: number | null;
  reviewsCount: number | null;
  website: string | null;
  websiteStatus: string | null;
  score: number;
  tags: string[];
  aiEnabled: boolean;
  optOut: boolean;
  waExists: boolean | null;
  lastOutboundAt: string | null;
  lastInboundAt: string | null;
  stage: { id: string; name: string; color: string } | null;
};
type Stage = { id: string; name: string; color: string };

const FILTER_KEYS = ["q", "stageId", "tag", "websiteStatus", "city", "category", "minScore", "hasPhone", "neverContacted", "scrapeJobId"];

function LeadsInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { run, busy } = useAction();

  const filter = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) ?? ""]).filter(([, v]) => v)), [sp]);
  const qs = new URLSearchParams({ ...filter, page: String(page), pageSize: "50" }).toString();
  const { data, mutate } = useApi<{ items: Lead[]; total: number }>(`/api/leads?${qs}`);
  const { data: stages } = useApi<Stage[]>("/api/stages");
  const { data: campaigns } = useApi<Array<{ id: string; name: string; status: string }>>("/api/campaigns");
  const { data: flows } = useApi<Array<{ id: string; name: string }>>("/api/flows");
  const { data: agents } = useApi<Array<{ id: string; name: string }>>("/api/agents");

  const setF = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v);
    else n.delete(k);
    setPage(1);
    setSelected(new Set());
    setAllMatching(false);
    router.replace(`/leads?${n.toString()}`);
  };

  const items = data?.items ?? [];
  const allOnPage = items.length > 0 && items.every((l) => selected.has(l.id));
  const count = allMatching ? data?.total ?? 0 : selected.size;

  async function bulk(action: string, value?: string) {
    if (!count) return;
    if (action === "delete" && !confirm(`Excluir ${count} leads? Isso não pode ser desfeito.`)) return;
    const payload = allMatching ? { filter: { ...filter, websiteStatus: filter.websiteStatus?.split(","), minScore: filter.minScore ? Number(filter.minScore) : undefined, hasPhone: !!filter.hasPhone, neverContacted: !!filter.neverContacted } } : { ids: [...selected] };
    await run(() => api<{ affected: number }>("/api/leads/bulk", { body: { ...payload, action, value } }), (r) => `${r.affected} leads atualizados`);
    setSelected(new Set());
    setAllMatching(false);
    mutate();
  }

  return (
    <>
      <PageHeader
        title="Leads"
        sub={data ? `${data.total.toLocaleString("pt-BR")} leads encontrados` : "Carregando…"}
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              Importar CSV
            </Button>
            <Button onClick={() => setNewOpen(true)}>Novo lead</Button>
          </>
        }
      />

      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Input placeholder="Buscar nome, telefone, cidade…" defaultValue={filter.q} onKeyDown={(e) => e.key === "Enter" && setF("q", e.currentTarget.value)} onBlur={(e) => e.target.value !== (filter.q ?? "") && setF("q", e.target.value)} className="lg:col-span-2" />
        <Select value={filter.stageId ?? ""} onChange={(e) => setF("stageId", e.target.value)} aria-label="Etapa">
          <option value="">Todas as etapas</option>
          {stages?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select value={filter.websiteStatus ?? ""} onChange={(e) => setF("websiteStatus", e.target.value)} aria-label="Situação do site">
          <option value="">Qualquer situação de site</option>
          <option value="NONE,SOCIAL_ONLY,OFFLINE">Precisa de site (quentes)</option>
          {Object.entries(WEBSITE_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Input placeholder="Tag" defaultValue={filter.tag} onKeyDown={(e) => e.key === "Enter" && setF("tag", e.currentTarget.value)} onBlur={(e) => e.target.value !== (filter.tag ?? "") && setF("tag", e.target.value)} />
        <Select value={filter.neverContacted ? "never" : filter.hasPhone ? "phone" : ""} onChange={(e) => {
          const n = new URLSearchParams(sp.toString());
          n.delete("neverContacted");
          n.delete("hasPhone");
          if (e.target.value === "never") { n.set("neverContacted", "1"); n.set("hasPhone", "1"); }
          if (e.target.value === "phone") n.set("hasPhone", "1");
          setPage(1);
          router.replace(`/leads?${n.toString()}`);
        }} aria-label="Contato">
          <option value="">Todos</option>
          <option value="phone">Com telefone</option>
          <option value="never">Nunca contatados</option>
        </Select>
      </Card>

      {count > 0 && (
        <div className="sticky top-2 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg">
          <span className="mr-2 font-medium">{count.toLocaleString("pt-BR")} selecionados</span>
          {!allMatching && allOnPage && (data?.total ?? 0) > items.length && (
            <button className="underline" onClick={() => setAllMatching(true)}>
              Selecionar todos os {data?.total}
            </button>
          )}
          <BulkSelect label="Mover para etapa" options={stages} onPick={(v) => bulk("stage", v)} />
          <BulkSelect label="Adicionar à campanha" options={campaigns?.filter((c) => c.status !== "DONE")} onPick={(v) => bulk("campaign", v)} />
          <BulkSelect label="Iniciar automação" options={flows} onPick={(v) => bulk("flow", v)} />
          <BulkSelect label="Ligar IA com agente" options={agents} onPick={(v) => bulk("ai_on", v)} />
          <button disabled={busy} className="rounded-md px-2 py-1 hover:bg-white/10" onClick={() => { const t = prompt("Tag para adicionar:"); if (t) bulk("tag", t); }}>
            + Tag
          </button>
          <button disabled={busy} className="rounded-md px-2 py-1 hover:bg-white/10" onClick={() => bulk("enrich")}>
            Reanalisar sites
          </button>
          <button disabled={busy} className="rounded-md px-2 py-1 hover:bg-white/10" onClick={() => bulk("ai_off")}>
            Pausar IA
          </button>
          <button disabled={busy} className="ml-auto rounded-md px-2 py-1 text-[#ffb4a8] hover:bg-white/10" onClick={() => bulk("delete")}>
            Excluir
          </button>
        </div>
      )}

      {data && items.length === 0 ? (
        <Empty title="Nenhum lead por aqui">
          Use a <Link href="/scraper" className="text-cobalt underline">Captação</Link> para buscar empresas no Google Maps, ou importe uma planilha CSV.
        </Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-mute">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Selecionar página"
                    checked={allOnPage}
                    onChange={() => {
                      setAllMatching(false);
                      setSelected(allOnPage ? new Set() : new Set(items.map((l) => l.id)));
                    }}
                  />
                </th>
                <th className="px-2 py-3 font-medium">Empresa</th>
                <th className="px-2 py-3 font-medium">Temperatura</th>
                <th className="px-2 py-3 font-medium">Site</th>
                <th className="px-2 py-3 font-medium">WhatsApp</th>
                <th className="px-2 py-3 font-medium">Etapa</th>
                <th className="px-2 py-3 font-medium">Último contato</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} className="border-b border-line last:border-0 hover:bg-paper/70">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${l.name}`}
                      checked={allMatching || selected.has(l.id)}
                      onChange={() => {
                        setAllMatching(false);
                        const n = new Set(selected);
                        if (n.has(l.id)) n.delete(l.id);
                        else n.add(l.id);
                        setSelected(n);
                      }}
                    />
                  </td>
                  <td className="max-w-[280px] px-2 py-2.5">
                    <Link href={`/leads/${l.id}`} className="block truncate font-medium hover:text-cobalt">
                      {l.name}
                    </Link>
                    <span className="block truncate text-xs text-mute">
                      {[l.category, l.city, l.reviewsCount != null ? `★ ${l.rating != null ? l.rating.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " · " : ""}${l.reviewsCount.toLocaleString("pt-BR")} avaliações` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {l.tags.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {l.tags.slice(0, 3).map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <Heat score={l.score} />
                  </td>
                  <td className="px-2 py-2.5">
                    <SiteBadge status={l.websiteStatus} />
                  </td>
                  <td className="px-2 py-2.5 font-mono text-xs">
                    {l.phone ? formatPhone(l.phone) : <span className="text-mute">—</span>}
                    {l.waExists === false && <span className="ml-1 text-bad" title="Número sem WhatsApp">✕</span>}
                    {l.optOut && <Badge className="ml-1 bg-bad-soft text-bad">opt-out</Badge>}
                    {l.aiEnabled && <span className="ml-1 rounded bg-cobalt-soft px-1 text-[10px] font-semibold text-cobalt">IA</span>}
                  </td>
                  <td className="px-2 py-2.5">{l.stage && <Badge color={l.stage.color}>{l.stage.name}</Badge>}</td>
                  <td className="px-2 py-2.5 text-xs text-mute">
                    {l.lastInboundAt ? `respondeu há ${timeAgo(l.lastInboundAt)}` : l.lastOutboundAt ? `enviado há ${timeAgo(l.lastOutboundAt)}` : "nunca"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.total > 50 && (
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
              <span className="text-mute">
                Página {page} de {Math.ceil(data.total / 50)}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button size="sm" variant="outline" disabled={page * 50 >= data.total} onClick={() => setPage(page + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <NewLeadModal open={newOpen} onClose={() => setNewOpen(false)} onDone={() => mutate()} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={() => mutate()} />
    </>
  );
}

function BulkSelect({ label, options, onPick }: { label: string; options?: Array<{ id: string; name: string }>; onPick: (v: string) => void }) {
  return (
    <select
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value)}
      className="h-8 rounded-md border border-white/20 bg-transparent px-2 text-sm text-white"
      aria-label={label}
    >
      <option value="" className="text-ink">
        {label}…
      </option>
      {options?.map((o) => (
        <option key={o.id} value={o.id} className="text-ink">
          {o.name}
        </option>
      ))}
    </select>
  );
}

function NewLeadModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", phone: "", website: "", city: "", category: "" });
  const { run, busy } = useAction();
  return (
    <Modal open={open} onClose={onClose} title="Novo lead">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => api("/api/leads", { body: f }), "Lead criado");
          if (r) {
            setF({ name: "", phone: "", website: "", city: "", category: "" });
            onDone();
            onClose();
          }
        }}
      >
        <Field label="Nome da empresa">
          <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp" hint="Com DDD. O 55 é adicionado sozinho.">
            <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="(11) 99999-8888" />
          </Field>
          <Field label="Site ou Instagram">
            <Input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
          </Field>
          <Field label="Cidade">
            <Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
          </Field>
          <Field label="Segmento">
            <Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button disabled={busy}>Criar lead</Button>
        </div>
      </form>
    </Modal>
  );
}

const CSV_FIELDS: Record<string, string[]> = {
  name: ["name", "nome", "empresa", "title", "razao social", "nome fantasia"],
  phone: ["phone", "telefone", "whatsapp", "celular", "fone", "phoneunformatted"],
  email: ["email", "e-mail"],
  website: ["website", "site", "url"],
  city: ["city", "cidade", "municipio"],
  state: ["state", "estado", "uf"],
  category: ["category", "categoria", "segmento", "categoryname", "ramo"],
  address: ["address", "endereco", "endereço"],
};

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [tags, setTags] = useState("");
  const { run, busy } = useAction();

  function load(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => {
        const h = r.meta.fields ?? [];
        setHeaders(h);
        setRows(r.data);
        const auto: Record<string, string> = {};
        for (const [field, aliases] of Object.entries(CSV_FIELDS)) {
          const hit = h.find((x) => aliases.includes(x.trim().toLowerCase()));
          if (hit) auto[field] = hit;
        }
        setMap(auto);
      },
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Importar planilha CSV" wide>
      <div className="space-y-4">
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} className="text-sm" />
        {headers.length > 0 && (
          <>
            <p className="text-sm text-mute">{rows.length} linhas encontradas. Confira qual coluna corresponde a cada campo:</p>
            <div className="grid gap-3 sm:grid-cols-4">
              {Object.keys(CSV_FIELDS).map((field) => (
                <Field key={field} label={{ name: "Nome*", phone: "Telefone", email: "E-mail", website: "Site", city: "Cidade", state: "UF", category: "Segmento", address: "Endereço" }[field]!}>
                  <Select value={map[field] ?? ""} onChange={(e) => setMap({ ...map, [field]: e.target.value })}>
                    <option value="">—</option>
                    {headers.map((h) => (
                      <option key={h}>{h}</option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <Field label="Tags para os leads importados" hint="Separadas por vírgula">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ex: lista-dentistas" />
            </Field>
            <div className="flex justify-end">
              <Button
                disabled={busy || !map.name}
                onClick={async () => {
                  const mapped = rows.map((r) => Object.fromEntries(Object.entries(map).filter(([, col]) => col).map(([field, col]) => [field, r[col]])));
                  const res = await run(
                    () => api<{ imported: number; skipped: number }>("/api/leads/import", { body: { rows: mapped, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) } }),
                    (r) => `${r.imported} importados, ${r.skipped} ignorados (duplicados ou inválidos)`,
                  );
                  if (res) {
                    onDone();
                    onClose();
                    setRows([]);
                    setHeaders([]);
                  }
                }}
              >
                {busy ? "Importando…" : `Importar ${rows.length} linhas`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsInner />
    </Suspense>
  );
}
