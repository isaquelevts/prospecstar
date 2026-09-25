import { route } from "@/lib/api";
import { listModels } from "@/lib/ai";

/** Lista os modelos de chat disponíveis na conta da chave da OpenAI configurada. */
export const GET = route(async () => ({ models: await listModels() }));
