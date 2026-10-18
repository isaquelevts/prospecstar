import { getSettings } from "./settings";
import { sleep } from "./template";

async function cfg() {
  const s = await getSettings();
  return { url: s.WAHA_URL.replace(/\/$/, ""), key: s.WAHA_API_KEY, session: s.WAHA_SESSION || "default" };
}

/** Erro do WAHA com mensagem em português quando reconhecido. */
export class WahaError extends Error {
  constructor(
    message: string,
    public status: number,
    public raw: string,
  ) {
    super(message);
  }
}

function friendly(status: number, path: string, text: string) {
  if (status === 401 || status === 403) return "API key do WAHA incorreta (Configurações → WAHA).";
  if (/expected.*WORKING|not as expected|session.*(not found|does not exist)/i.test(text) || (status === 404 && /session/i.test(text)))
    return "WhatsApp não está conectado. Abra a tela WhatsApp e conecte o número.";
  return `WAHA ${status} ${path}: ${text.slice(0, 300)}`;
}

async function call<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = await cfg();
  let res: Response;
  try {
    res = await fetch(url + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(key ? { "X-Api-Key": key } : {}),
        ...(init.headers ?? {}),
      },
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new WahaError(`Não foi possível falar com o WAHA em ${url} (${e instanceof Error ? e.message : e}).`, 0, "");
  }
  const text = await res.text();
  if (!res.ok) throw new WahaError(friendly(res.status, path, text), res.status, text);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export async function defaultSession() {
  return (await cfg()).session;
}

export type WahaMe = { id: string; pushName?: string } | null;
export type WahaSession = {
  name: string;
  status: string;
  me?: WahaMe;
  engine?: { engine?: string } | null;
  config?: { webhooks?: Array<{ url: string; events: string[] }> } | null;
};

export const WEBHOOK_EVENTS = ["message.any", "message.ack", "session.status"];

export const waha = {
  listSessions: () => call<WahaSession[]>("/api/sessions?all=true"),
  getSession: (name: string) => call<WahaSession>(`/api/sessions/${encodeURIComponent(name)}`),

  /** Cria (ou atualiza) a sessão com o webhook apontando para este sistema e inicia. */
  async upsertSession(name: string, webhookUrl: string) {
    const config = {
      webhooks: [
        {
          url: webhookUrl,
          events: WEBHOOK_EVENTS,
          retries: { policy: "constant", delaySeconds: 3, attempts: 5 },
        },
      ],
    };
    const exists = await waha.getSession(name).catch(() => null);
    if (exists) {
      await call(`/api/sessions/${name}`, { method: "PUT", body: JSON.stringify({ name, config }) });
      if (exists.status === "STOPPED" || exists.status === "FAILED") await call(`/api/sessions/${name}/start`, { method: "POST" });
    } else {
      await call("/api/sessions", { method: "POST", body: JSON.stringify({ name, config, start: true }) });
    }
  },
  stopSession: (name: string) => call(`/api/sessions/${name}/stop`, { method: "POST" }),
  restartSession: (name: string) => call(`/api/sessions/${name}/restart`, { method: "POST" }),
  logoutSession: (name: string) => call(`/api/sessions/${name}/logout`, { method: "POST" }),
  qr: (name: string) => call<{ mimetype: string; data: string }>(`/api/${name}/auth/qr?format=image`),
  /** Conexão sem câmera: o WhatsApp do celular pede um código de 8 caracteres. */
  requestCode: (name: string, phoneNumber: string) =>
    call<{ code: string }>(`/api/${name}/auth/request-code`, { method: "POST", body: JSON.stringify({ phoneNumber }) }),
  profilePicture: (session: string, contactId: string) =>
    call<{ profilePictureURL?: string | null }>(
      `/api/contacts/profile-picture?contactId=${encodeURIComponent(contactId)}&session=${encodeURIComponent(session)}`,
    ).catch(() => null),

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

/**
 * Parte final do id da mensagem. O WEBJS usa `true_55119...@c.us_3EB0ABC`, o NOWEB/GOWS devolve só `3EB0ABC`
 * no envio — comparar pela parte final faz os dois formatos casarem.
 */
export function shortMessageId(id: string) {
  return id.split("_").pop() || id;
}

/** Filtro Prisma que encontra uma mensagem pelo id do WAHA em qualquer um dos formatos. */
export function wahaIdWhere(id: string) {
  const short = shortMessageId(id);
  return { OR: [{ wahaId: id }, { wahaId: short }, { wahaId: { endsWith: `_${short}` } }] };
}

/** Envia texto simulando digitação (tempo proporcional ao tamanho da mensagem). */
export async function sendHumanized(session: string, chatId: string, text: string) {
  await waha.startTyping(session, chatId);
  await sleep(Math.min(8000, 1200 + text.length * 35));
  await waha.stopTyping(session, chatId);
  return extractMessageId(await waha.sendText(session, chatId, text));
}
