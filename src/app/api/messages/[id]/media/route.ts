import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { fetchWahaFile } from "@/lib/waha";

/** Entrega a mídia de uma mensagem: o WAHA não é público, então o app busca o arquivo com a API key. */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  const msg = await prisma.message.findUnique({ where: { id }, select: { mediaUrl: true, mediaType: true } });
  if (!msg?.mediaUrl) return new Response("Sem mídia", { status: 404 });
  const res = await fetchWahaFile(msg.mediaUrl);
  if (!res.ok || !res.body) return new Response("Arquivo indisponível", { status: 404 });
  return new Response(res.body, {
    headers: {
      "Content-Type": msg.mediaType || res.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "private, max-age=86400",
    },
  });
});
