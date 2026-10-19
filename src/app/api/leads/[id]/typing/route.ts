import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { ensurePresence } from "@/lib/messaging";
import { redis } from "@/lib/queue";
import { defaultSession } from "@/lib/waha";

/** O lead está digitando agora? Ao consultar, também passa a acompanhar a presença do chat. */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  const lead = await prisma.lead.findUnique({ where: { id }, select: { chatId: true } });
  if (lead?.chatId) await ensurePresence(await defaultSession(), lead.chatId);
  return { typing: (await redis().exists(`typing:${id}`)) === 1 };
});
