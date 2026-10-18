import { z } from "zod";
import { body, route } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { WEBHOOK_EVENTS, waha } from "@/lib/waha";
import { normalizePhone } from "@/lib/phone";

function webhookUrl(publicUrl: string) {
  return `${publicUrl.replace(/\/$/, "")}/api/webhooks/waha?token=${process.env.WEBHOOK_SECRET}`;
}

export const GET = route(async (req) => {
  const s = await getSettings();
  const session = s.WAHA_SESSION || "default";
  const withPicture = new URL(req.url).searchParams.get("picture") === "1";
  const diagnostics = {
    wahaUrl: s.WAHA_URL,
    publicUrl: s.PUBLIC_URL,
    webhookSecret: !!process.env.WEBHOOK_SECRET,
    apiKey: !!s.WAHA_API_KEY,
  };
  try {
    const sessions = await waha.listSessions();
    const current = sessions.find((x) => x.name === session) ?? null;
    let qr: string | null = null;
    if (current?.status === "SCAN_QR_CODE") {
      const img = await waha.qr(session).catch(() => null);
      if (img?.data) qr = `data:${img.mimetype};base64,${img.data}`;
    }
    let picture: string | null = null;
    if (withPicture && current?.status === "WORKING" && current.me?.id) {
      picture = (await waha.profilePicture(session, current.me.id))?.profilePictureURL ?? null;
    }
    // o webhook está apontando para este sistema e com todos os eventos?
    const hook = current?.config?.webhooks?.find((w) => w.url.includes("/api/webhooks/waha"));
    const webhookOk = !!hook && WEBHOOK_EVENTS.every((e) => hook.events?.includes(e));
    return {
      reachable: true,
      session,
      status: current?.status ?? "NOT_CREATED",
      me: current?.me ?? null,
      engine: current?.engine?.engine ?? null,
      qr,
      picture,
      webhookOk: current ? webhookOk : null,
      diagnostics,
    };
  } catch (e) {
    return { reachable: false, session, status: "UNREACHABLE", error: String(e instanceof Error ? e.message : e), diagnostics };
  }
});

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect") }),
  z.object({ action: z.literal("restart") }),
  z.object({ action: z.literal("stop") }),
  z.object({ action: z.literal("logout") }),
  z.object({ action: z.literal("pair"), phone: z.string().min(8) }),
]);

export const POST = route(async (req) => {
  const input = Action.parse(await body(req));
  const s = await getSettings();
  const session = s.WAHA_SESSION || "default";
  switch (input.action) {
    case "connect":
      if (!process.env.WEBHOOK_SECRET) throw new Error("WEBHOOK_SECRET não configurado no .env — sem ele o sistema não recebe as mensagens.");
      await waha.upsertSession(session, webhookUrl(s.PUBLIC_URL));
      return { ok: true };
    case "restart":
      await waha.restartSession(session);
      return { ok: true };
    case "stop":
      await waha.stopSession(session);
      return { ok: true };
    case "logout":
      await waha.logoutSession(session);
      return { ok: true };
    case "pair": {
      const phone = normalizePhone(input.phone);
      if (!phone) throw new Error("Telefone inválido. Use DDD + número, ex: 11 99999-8888.");
      const { code } = await waha.requestCode(session, phone);
      return { code };
    }
  }
});
