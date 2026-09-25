import { getSettings } from "./settings";
import { sleep } from "./template";

async function cfg() {
  const s = await getSettings();
  return { url: s.WAHA_URL.replace(/\/$/, ""), key: s.WAHA_API_KEY, session: s.WAHA_SESSION || "default" };
}

async function call<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = await cfg();
  const res = await fetch(url + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(key ? { "X-Api-Key": key } : {}),
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WAHA ${res.status} ${path}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export async function defaultSession() {
  return (await cfg()).session;
}

export type WahaSession = { name: string; status: string; me?: { id: string; pushName?: string } | null };

export const waha = {
  listSessions: () => call<WahaSession[]>("/api/sessions?all=true"),

  /** Cria (ou atualiza) a sessão com o webhook apontando para este sistema e inicia. */
  async upsertSession(name: string, webhookUrl: string) {
    const config = {
      webhooks: [
        {
          url: webhookUrl,
          events: ["message.any", "session.status"],
          retries: { policy: "constant", delaySeconds: 3, attempts: 5 },
        },
      ],
    };
    const exists = await call<WahaSession>(`/api/sessions/${name}`).catch(() => null);
    if (exists) {
      await call(`/api/sessions/${name}`, { method: "PUT", body: JSON.stringify({ name, config }) });
      if (exists.status === "STOPPED" || exists.status === "FAILED")
        await call(`/api/sessions/${name}/start`, { method: "POST" });
    } else {
      await call("/api/sessions", { method: "POST", body: JSON.stringify({ name, config, start: true }) });
    }
  },
  stopSession: (name: string) => call(`/api/sessions/${name}/stop`, { method: "POST" }),
  logoutSession: (name: string) => call(`/api/sessions/${name}/logout`, { method: "POST" }),
  qr: (name: string) => call<{ mimetype: string; data: string }>(`/api/${name}/auth/qr?format=image`),

  checkExists: (session: string, phone: string) =>
    call<{ numberExists: boolean; chatId?: string; pn?: string }>(
      `/api/contacts/check-exists?phone=${phone}&session=${encodeURIComponent(session)}`,
    ),
  resolveLid: (session: string, lid: string) =>
    call<{ lid: string; pn: string | null }>(`/api/${session}/lids/${encodeURIComponent(lid)}`).catch(() => null),

  sendText: (session: string, chatId: string, text: string) =>
    call<unknown>("/api/sendText", { method: "POST", body: JSON.stringify({ session, chatId, text }) }),
  startTyping: (session: string, chatId: string) =>
    call("/api/startTyping", { method: "POST", body: JSON.stringify({ session, chatId }) }).catch(() => null),
  stopTyping: (session: string, chatId: string) =>
    call("/api/stopTyping", { method: "POST", body: JSON.stringify({ session, chatId }) }).catch(() => null),
  sendSeen: (session: string, chatId: string) =>
    call("/api/sendSeen", { method: "POST", body: JSON.stringify({ session, chatId }) }).catch(() => null),
};

export function extractMessageId(res: unknown): string | null {
  const r = res as { id?: unknown; key?: { id?: string } } | null;
  if (!r || typeof r !== "object") return null;
  if (typeof r.id === "string") return r.id;
  if (r.id && typeof r.id === "object" && "_serialized" in r.id) return String((r.id as { _serialized: string })._serialized);
  return r.key?.id ?? null;
}

/** Envia texto simulando digitação (tempo proporcional ao tamanho da mensagem). */
export async function sendHumanized(session: string, chatId: string, text: string) {
  await waha.startTyping(session, chatId);
  await sleep(Math.min(8000, 1200 + text.length * 35));
  await waha.stopTyping(session, chatId);
  return extractMessageId(await waha.sendText(session, chatId, text));
}
