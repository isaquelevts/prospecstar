import { route } from "@/lib/api";
import { suggestReply } from "@/lib/ai";

/** Mostra o que a IA responderia agora, sem enviar nada nem alterar o lead. */
export const POST = route<{ id: string }>(async (_req, { id }) => suggestReply(id));
