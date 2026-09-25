import { NextResponse } from "next/server";
import { SESSION_COOKIE, createSessionToken, safeEqual } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const okEmail = safeEqual((email ?? "").trim().toLowerCase(), (process.env.ADMIN_EMAIL ?? "").toLowerCase());
  const okPass = safeEqual(password ?? "", process.env.ADMIN_PASSWORD ?? "");
  if (!process.env.ADMIN_PASSWORD || !okEmail || !okPass) {
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "E-mail ou senha inválidos" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(email!), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
