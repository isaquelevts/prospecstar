import { prisma } from "./db";

export const SETTING_KEYS = {
  OPENAI_API_KEY: "Chave da API da OpenAI",
  APIFY_TOKEN: "Token da Apify",
  GOOGLE_PLACES_KEY: "Chave da Google Places API (opcional)",
  WAHA_URL: "URL do WAHA (dentro do Docker: http://waha:3000)",
  WAHA_API_KEY: "API key do WAHA",
  WAHA_SESSION: "Sessão padrão do WAHA (no WAHA Core gratuito só existe 'default')",
  PUBLIC_URL: "URL que o WAHA usa para chamar este sistema (dentro do Docker: http://app:3000)",
  PAUSE_AI_ON_HUMAN: "Pausar a IA do lead quando você responder pelo celular (true/false)",
  OPT_OUT_KEYWORDS: "Palavras de descadastro (separadas por vírgula)",
} as const;

export type SettingKey = keyof typeof SETTING_KEYS;
export const SECRET_KEYS: SettingKey[] = ["OPENAI_API_KEY", "APIFY_TOKEN", "GOOGLE_PLACES_KEY", "WAHA_API_KEY"];

const DEFAULTS: Partial<Record<SettingKey, string>> = {
  WAHA_URL: "http://waha:3000",
  WAHA_SESSION: "default",
  PUBLIC_URL: "http://app:3000",
  PAUSE_AI_ON_HUMAN: "true",
  OPT_OUT_KEYWORDS: "sair,parar,pare,descadastrar,remover meu número,não me mande",
};

let cache: { at: number; values: Record<string, string> } | null = null;

export function invalidateSettings() {
  cache = null;
}

export async function getSettings(): Promise<Record<SettingKey, string>> {
  if (!cache || Date.now() - cache.at > 10_000) {
    const rows = await prisma.setting.findMany();
    cache = { at: Date.now(), values: Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  }
  const out = {} as Record<SettingKey, string>;
  for (const key of Object.keys(SETTING_KEYS) as SettingKey[]) {
    out[key] = cache.values[key] || process.env[key] || DEFAULTS[key] || "";
  }
  return out;
}

export async function getSetting(key: SettingKey) {
  return (await getSettings())[key];
}

export async function setSettings(values: Partial<Record<string, string>>) {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in SETTING_KEYS) || value === undefined) continue;
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  invalidateSettings();
}
