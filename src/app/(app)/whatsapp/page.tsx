"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import {
  Check,
  CircleAlert,
  CircleCheck,
  Copy,
  KeyRound,
  LoaderCircle,
  MessageSquarePlus,
  Power,
  QrCode,
  RefreshCw,
  RotateCw,
  Send,
  ShieldCheck,
  Smartphone,
  Unplug,
  Webhook,
  X,
} from "lucide-react";
import { api, formatPhone, initials, useAction, useApi } from "@/components/ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type WA = {
  reachable: boolean;
  session: string;
  status: string;
  me?: { id: string; pushName?: string } | null;
  engine?: string | null;
  qr?: string | null;
  picture?: string | null;
  webhookOk?: boolean | null;
  error?: string;
  diagnostics: { wahaUrl: string; publicUrl: string; webhookSecret: boolean; apiKey: boolean };
};

const STATUS: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  WORKING: { label: "Conectado", variant: "success" },
  SCAN_QR_CODE: { label: "Aguardando leitura", variant: "warning" },
  STARTING: { label: "Iniciando", variant: "warning" },
  STOPPED: { label: "Parado", variant: "secondary" },
  FAILED: { label: "Falhou", variant: "destructive" },
  NOT_CREATED: { label: "Não conectado", variant: "secondary" },
  UNREACHABLE: { label: "WAHA fora do ar", variant: "destructive" },
};

function Steps({ status }: { status?: string }) {
  const current = status === "WORKING" ? 3 : status === "SCAN_QR_CODE" ? 2 : status === "STARTING" ? 1.5 : 1;
  const steps = ["Iniciar sessão", "Ler o QR code", "Pronto para enviar"];
  return (
    <ol className="grid grid-cols-3 gap-2">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = current > n;
        const now = Math.ceil(current) === n && !done;
        return (
          <li key={label} className="flex flex-col gap-2">
            <span className={cn("h-1 rounded-full", done ? "bg-whatsapp" : now ? "bg-primary" : "bg-muted")} />
            <span className={cn("flex items-center gap-1.5 text-xs", done || now ? "text-foreground font-medium" : "text-muted-foreground")}>
              {done ? <CircleCheck className="text-whatsapp size-3.5" /> : <span className="tabular-nums">{n}.</span>}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ConnectedAccount({ data, onAction, busy }: { data: WA; onAction: (a: string, msg: string) => void; busy: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const number = data.me?.id.split("@")[0] ?? "";
  return (
    <>
      <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4">
        <Avatar className="size-14">
          {data.picture && <AvatarImage src={data.picture} alt="" />}
          <AvatarFallback className="text-base">{initials(data.me?.pushName || number)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{data.me?.pushName || "WhatsApp"}</p>
          <p className="text-muted-foreground font-mono text-sm">{formatPhone(number)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline">sessão {data.session}</Badge>
            {data.engine && <Badge variant="outline">{data.engine}</Badge>}
          </div>
        </div>
        <span className="bg-whatsapp/15 text-whatsapp flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
          <span className="bg-whatsapp size-2 animate-pulse rounded-full" />
          Online
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/inbox">
            <MessageSquarePlus />
            Abrir conversas
          </Link>
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => onAction("connect", "Webhook reconfigurado")}>
          <Webhook />
          Reconfigurar webhook
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => onAction("restart", "Sessão reiniciada")}>
          <RotateCw />
          Reiniciar
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => onAction("stop", "Sessão parada")}>
          <Power />
          Parar
        </Button>
        <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => setConfirm(true)}>
          <Unplug />
          Desconectar número
        </Button>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desconectar este número?</DialogTitle>
            <DialogDescription>
              O sistema para de enviar e receber mensagens deste WhatsApp. Campanhas em andamento ficam esperando até você conectar de novo. Para voltar, será
              preciso ler um novo QR code.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirm(false);
                onAction("logout", "Número desconectado");
              }}
            >
              Desconectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PairingCode() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const { run, busy } = useAction();
  return (
    <div className="space-y-4">
      <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
        <li>Digite o número do WhatsApp que você vai conectar e gere o código.</li>
        <li>
          No celular: <strong className="text-foreground">Aparelhos conectados → Conectar aparelho → Conectar com número de telefone</strong>.
        </li>
        <li>Digite o código de 8 caracteres que aparecer aqui.</li>
      </ol>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => api<{ code: string }>("/api/whatsapp", { body: { action: "pair", phone } }));
          if (r?.code) setCode(r.code);
        }}
      >
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-8888" inputMode="tel" className="max-w-56 font-mono" />
        <Button type="submit" disabled={busy || phone.replace(/\D/g, "").length < 10}>
          {busy ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
          Gerar código
        </Button>
      </form>
      {code && (
        <div className="bg-muted flex flex-wrap items-center justify-between gap-3 rounded-lg p-4">
          <span className="font-mono text-3xl font-semibold tracking-[0.3em]">{code}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(code.replace(/-/g, ""));
            }}
          >
            <Copy />
            Copiar
          </Button>
        </div>
      )}
    </div>
  );
}

function Connect({ data, onAction, busy }: { data?: WA; onAction: (a: string, msg: string) => void; busy: boolean }) {
  if (!data) return <Skeleton className="h-64 w-full" />;

  if (data.status === "WORKING") return <ConnectedAccount data={data} onAction={onAction} busy={busy} />;

  if (data.status === "STARTING")
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-14 text-center">
        <LoaderCircle className="text-muted-foreground size-8 animate-spin" />
        <p className="font-medium">Iniciando a sessão no WAHA…</p>
        <p className="text-muted-foreground text-sm">O QR code aparece aqui em alguns segundos.</p>
      </div>
    );

  if (data.status === "SCAN_QR_CODE")
    return (
      <Tabs defaultValue="qr">
        <TabsList>
          <TabsTrigger value="qr">
            <QrCode />
            QR code
          </TabsTrigger>
          <TabsTrigger value="code">
            <KeyRound />
            Código no celular
          </TabsTrigger>
        </TabsList>
        <TabsContent value="qr" className="pt-2">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="mx-auto shrink-0 rounded-xl border bg-white p-3 shadow-sm">
              {data.qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.qr} alt="QR code para conectar o WhatsApp" className="size-60" />
              ) : (
                <Skeleton className="size-60" />
              )}
            </div>
            <div className="space-y-3 text-sm">
              <p className="font-medium">Leia com o celular que vai disparar as mensagens:</p>
              <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5">
                <li>Abra o WhatsApp no celular.</li>
                <li>
                  Toque em <strong className="text-foreground">⋮ / Configurações → Aparelhos conectados</strong>.
                </li>
                <li>
                  Toque em <strong className="text-foreground">Conectar aparelho</strong> e aponte a câmera para o código.
                </li>
              </ol>
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <RefreshCw className="size-3" />O código se renova sozinho a cada poucos segundos.
              </p>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="code" className="pt-2">
          <PairingCode />
        </TabsContent>
      </Tabs>
    );

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-12 text-center">
      <span className="bg-whatsapp/15 text-whatsapp flex size-14 items-center justify-center rounded-full">
        <Smartphone className="size-7" />
      </span>
      <div>
        <p className="font-semibold">{data.status === "FAILED" ? "A sessão falhou" : data.status === "STOPPED" ? "Sessão parada" : "Nenhum número conectado"}</p>
        <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
          Ao conectar, o sistema cria a sessão no WAHA já com o webhook configurado para receber as respostas dos leads.
        </p>
      </div>
      <Button size="lg" disabled={busy || !data.reachable} onClick={() => onAction("connect", "Sessão iniciada — leia o QR code")}>
        {busy ? <LoaderCircle className="animate-spin" /> : <Power />}
        {data.status === "STOPPED" || data.status === "FAILED" ? "Iniciar de novo" : "Conectar WhatsApp"}
      </Button>
    </div>
  );
}

function TestMessage({ connected }: { connected: boolean }) {
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("Teste de envio pelo prospec. ✅");
  const [lastLead, setLastLead] = useState<string | null>(null);
  const { run, busy } = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mensagem de teste</CardTitle>
        <CardDescription>Envie para o seu próprio número e confira se chega.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="test-message"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => api<{ leadId: string }>("/api/whatsapp/send", { body: { phone, text } }), "Mensagem enviada");
            if (r) setLastLead(r.leadId);
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="test-phone">Número</Label>
            <Input id="test-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-8888" inputMode="tel" className="font-mono" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="test-text">Mensagem</Label>
            <Textarea id="test-text" value={text} onChange={(e) => setText(e.target.value)} rows={3} className="field-sizing-fixed" />
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <Button type="submit" form="test-message" disabled={busy || !connected || phone.replace(/\D/g, "").length < 10 || !text.trim()}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Send />}
          Enviar teste
        </Button>
        {lastLead && (
          <Button variant="link" asChild className="px-1">
            <Link href={`/inbox?lead=${lastLead}`}>Ver na conversa</Link>
          </Button>
        )}
        {!connected && <span className="text-muted-foreground text-xs">Conecte o WhatsApp para enviar.</span>}
      </CardFooter>
    </Card>
  );
}

function Check1({ ok, label, hint }: { ok: boolean | null | undefined; label: string; hint?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
          ok === null || ok === undefined ? "bg-muted text-muted-foreground" : ok ? "bg-whatsapp/15 text-whatsapp" : "bg-destructive/10 text-destructive",
        )}
      >
        {ok === null || ok === undefined ? <span className="size-1.5 rounded-full bg-current" /> : ok ? <Check className="size-3" /> : <X className="size-3" />}
      </span>
      <span className="min-w-0 text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-muted-foreground block text-xs break-all">{hint}</span>}
      </span>
    </li>
  );
}

function Diagnostics({ data }: { data?: WA }) {
  const d = data?.diagnostics;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Diagnóstico</CardTitle>
        <CardDescription>O que precisa estar certo para enviar e receber.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings#waha">Ajustar</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          <Check1 ok={data?.reachable} label="WAHA respondendo" hint={d?.wahaUrl} />
          <Check1 ok={d?.apiKey} label="API key do WAHA" hint={d?.apiKey ? "configurada" : "vazia — preencha em Configurações"} />
          <Check1 ok={d?.webhookSecret} label="WEBHOOK_SECRET no .env" hint={d?.webhookSecret ? "configurado" : "sem ele o sistema não recebe respostas"} />
          <Check1
            ok={data?.webhookOk}
            label="Webhook apontando para o sistema"
            hint={data?.webhookOk === false ? "clique em Reconfigurar webhook" : d ? `${d.publicUrl}/api/webhooks/waha` : undefined}
          />
        </ul>
      </CardContent>
    </Card>
  );
}

function Tips() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          Para não ser banido
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-muted-foreground list-disc space-y-1.5 pl-5 text-sm">
          <li>Use um número dedicado e “aquecido” (com conversas reais antes).</li>
          <li>Comece com 20–40 mensagens por dia e aumente aos poucos.</li>
          <li>Intervalos de 60–180 s entre envios e várias variações de texto.</li>
          <li>Respeite quem pede para sair — o opt-out é automático.</li>
        </ul>
      </CardContent>
    </Card>
  );
}

export default function WhatsAppPage() {
  const { data, mutate } = useApi<WA>("/api/whatsapp?picture=1", {
    refreshInterval: (d) => (d?.status === "WORKING" ? 30_000 : d?.status === "SCAN_QR_CODE" || d?.status === "STARTING" ? 3000 : 10_000),
  });
  const { run, busy } = useAction();
  const { mutate: globalMutate } = useSWRConfig();
  // mantém o indicador do menu lateral (que usa outra chave de cache) em sincronia com esta tela
  useEffect(() => {
    if (data?.status) globalMutate("/api/whatsapp");
  }, [data?.status, globalMutate]);
  const act = async (action: string, msg: string) => {
    await run(() => api("/api/whatsapp", { body: { action } }), msg);
    mutate();
  };
  const st = STATUS[data?.status ?? ""] ?? { label: data?.status ?? "Verificando…", variant: "secondary" as const };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
          <p className="text-muted-foreground mt-1 text-sm">Conecte o número que vai prospectar e conversar com os leads.</p>
        </div>
        <Badge variant={st.variant} className="h-7 px-3 text-sm">
          {st.label}
        </Badge>
      </div>

      {data && !data.reachable && (
        <Alert variant="destructive" className="mb-6">
          <CircleAlert />
          <AlertTitle>Não foi possível falar com o WAHA</AlertTitle>
          <AlertDescription>
            <p>{data.error}</p>
            <p>
              Confira se o container <code className="font-mono">waha</code> está rodando e se a URL e a API key em{" "}
              <Link href="/settings#waha" className="underline">
                Configurações
              </Link>{" "}
              estão corretas.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Conexão</CardTitle>
            <CardDescription>Um número por vez (WAHA Core). Para vários números, use o WAHA Plus.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="icon-sm" onClick={() => mutate()} aria-label="Atualizar status">
                <RefreshCw />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-6">
            <Steps status={data?.status} />
            <Separator />
            <Connect data={data} onAction={act} busy={busy} />
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <TestMessage connected={data?.status === "WORKING"} />
          <Diagnostics data={data} />
          <Tips />
        </div>
      </div>
    </>
  );
}
