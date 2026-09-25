import { body, route } from "@/lib/api";
import { SECRET_KEYS, SETTING_KEYS, getSettings, setSettings, type SettingKey } from "@/lib/settings";

const MASK = "••••••••";

export const GET = route(async () => {
  const values = await getSettings();
  return (Object.keys(SETTING_KEYS) as SettingKey[]).map((key) => ({
    key,
    label: SETTING_KEYS[key],
    secret: SECRET_KEYS.includes(key),
    value: SECRET_KEYS.includes(key) ? (values[key] ? MASK + values[key].slice(-4) : "") : values[key],
  }));
});

export const PUT = route(async (req) => {
  const input = await body<Record<string, string>>(req);
  // campos secretos que voltaram mascarados ou vazios não são alterados
  const clean = Object.fromEntries(
    Object.entries(input).filter(
      ([k, v]) => typeof v === "string" && !v.startsWith(MASK) && !(SECRET_KEYS.includes(k as SettingKey) && v.trim() === ""),
    ),
  );
  await setSettings(clean);
  return { ok: true };
});
