import { NextResponse } from "next/server";
import { handleWahaEvent, type WahaEvent } from "@/lib/inbound";
import { safeEqual } from "@/lib/auth";

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!process.env.WEBHOOK_SECRET || !safeEqual(token, process.env.WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "token inválido" }, { status: 401 });
  }
  const evt = (await req.json().catch(() => null)) as WahaEvent | null;
  if (!evt) return NextResponse.json({ ok: true });
  try {
    await handleWahaEvent(evt);
  } catch (e) {
    // responde 200 mesmo com erro para o WAHA não reenviar em loop; o erro fica no log
    console.error("webhook waha", e);
  }
  return NextResponse.json({ ok: true });
}
