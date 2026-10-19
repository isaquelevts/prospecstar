import { bookingSignals } from "./arena";

export const WEBSITE_STATUS_LABEL: Record<string, string> = {
  NONE: "Sem site",
  SOCIAL_ONLY: "Só rede social",
  OFFLINE: "Site fora do ar",
  NO_HTTPS: "Sem HTTPS",
  NOT_MOBILE: "Não responsivo",
  OUTDATED: "Site desatualizado",
  OK: "Site OK",
};

const SOCIAL = /(instagram\.com|facebook\.com|fb\.com|linktr\.ee|wa\.me|whatsapp\.com|tiktok\.com|linkedin\.com|youtube\.com|ifood\.com|beacons\.ai|bio\.link|linkbio|goo\.gl|g\.page|business\.site|negocio\.site|sites\.google\.com|wixsite\.com)/i;

export type WebsiteCheck = { status: string; info: Record<string, unknown> };

/** Analisa o site do lead: situação técnica e sinais de como a arena faz as reservas (WhatsApp, concorrente…). */
export async function checkWebsite(url?: string | null, competitors: string[] = []): Promise<WebsiteCheck> {
  if (!url) return { status: "NONE", info: {} };
  let target = url.trim();
  if (!/^https?:\/\//i.test(target)) target = "https://" + target;
  if (SOCIAL.test(target)) return { status: "SOCIAL_ONLY", info: { url: target } };

  const started = Date.now();
  let res: Response | null = null;
  try {
    res = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SiteCheck/1.0)" },
    });
  } catch {
    try {
      res = await fetch(target.replace(/^https:/i, "http:"), { redirect: "follow", signal: AbortSignal.timeout(15_000) });
    } catch {
      return { status: "OFFLINE", info: { url: target, error: "sem resposta" } };
    }
  }
  const ms = Date.now() - started;
  if (!res.ok) return { status: "OFFLINE", info: { url: target, httpStatus: res.status } };

  const finalUrl = res.url || target;
  if (SOCIAL.test(finalUrl)) return { status: "SOCIAL_ONLY", info: { url: finalUrl } };
  const html = (await res.text()).slice(0, 400_000);
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const https = finalUrl.startsWith("https://");
  const years = [...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(20\d{2})/gi)].map((m) => Number(m[1]));
  const copyrightYear = years.length ? Math.max(...years) : undefined;
  const generator = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1];
  const booking = bookingSignals(html, competitors);
  const info = { url: finalUrl, title, https, hasViewport, loadMs: ms, copyrightYear, generator, sizeKb: Math.round(html.length / 1024), booking };

  if (!https) return { status: "NO_HTTPS", info };
  if (!hasViewport) return { status: "NOT_MOBILE", info };
  if (copyrightYear && copyrightYear < new Date().getFullYear() - 3) return { status: "OUTDATED", info };
  return { status: "OK", info };
}
