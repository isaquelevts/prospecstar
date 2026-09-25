import { z } from "zod";
import { body, route } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { waha } from "@/lib/waha";

export const GET = route(async () => {
  const s = await getSettings();
  const session = s.WAHA_SESSION || "default";
  try {
    const sessions = await waha.listSessions();
    const current = sessions.find((x) => x.name === session) ?? null;
    let qr: string | null = null;
    if (current?.status === "SCAN_QR_CODE") {
      const img = await waha.qr(session).catch(() => null);
      if (img?.data) qr = `data:${img.mimetype};base64,${img.data}`;
    }
    return { reachable: true, session, status: current?.status ?? "NOT_CREATED", me: current?.me ?? null, qr };
  } catch (e) {
    return { reachable: false, session, status: "UNREACHABLE", error: String(e instanceof Error ? e.message : e) };
  }
});

export const POST = route(async (req) => {
  const { action } = z.object({ action: z.enum(["connect", "stop", "logout"]) }).parse(await body(req));
  const s = await getSettings();
  const session = s.WAHA_SESSION || "default";
  if (action === "connect") {
    if (!process.env.WEBHOOK_SECRET) throw new Error("WEBHOOK_SECRET não configurado no .env");
    const base = s.PUBLIC_URL.replace(/\/$/, "");
    await waha.upsertSession(session, `${base}/api/webhooks/waha?token=${process.env.WEBHOOK_SECRET}`);
  } else if (action === "stop") await waha.stopSession(session);
  else await waha.logoutSession(session);
  return { ok: true };
});
