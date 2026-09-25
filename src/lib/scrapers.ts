import { getSetting } from "./settings";
import type { LeadInput } from "./leads";

const APIFY = "https://api.apify.com/v2";

// Actor oficial de Google Maps mais usado na Apify. Pode ser trocado na tela do scraper.
export const APIFY_MAPS_ACTOR = "compass~crawler-google-places";

async function apifyToken() {
  const token = await getSetting("APIFY_TOKEN");
  if (!token) throw new Error("Token da Apify não configurado (Configurações).");
  return token;
}

async function apify<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await apifyToken();
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${APIFY}${path}${sep}token=${token}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Apify ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

type ApifyRun = { id: string; status: string; defaultDatasetId: string; statusMessage?: string };

export async function apifyStartRun(actorId: string, input: unknown) {
  const { data } = await apify<{ data: ApifyRun }>(`/acts/${actorId.replace("/", "~")}/runs`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data;
}

export async function apifyGetRun(runId: string) {
  return (await apify<{ data: ApifyRun }>(`/actor-runs/${runId}`)).data;
}

export async function apifyGetItems(datasetId: string, offset: number, limit: number) {
  return apify<Record<string, unknown>[]>(`/datasets/${datasetId}/items?clean=true&format=json&offset=${offset}&limit=${limit}`);
}

export function buildMapsInput(opts: { query: string; location: string; max: number; skipClosed?: boolean }) {
  return {
    searchStringsArray: opts.query.split(/\n|;/).map((s) => s.trim()).filter(Boolean),
    locationQuery: opts.location,
    maxCrawledPlacesPerSearch: opts.max,
    language: "pt-BR",
    skipClosedPlaces: opts.skipClosed ?? true,
    scrapePlaceDetailPage: false,
    maxImages: 0,
    maxReviews: 0,
  };
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === "number" && !Number.isNaN(v) ? v : undefined);

/** Converte um item da Apify (Google Maps ou actor genérico) para lead. Campos comuns são detectados por nome. */
export function mapApifyItem(item: Record<string, unknown>): LeadInput | null {
  const name = str(item.title) ?? str(item.name) ?? str(item.companyName) ?? str(item.businessName);
  if (!name) return null;
  const phones = item.phones as unknown[] | undefined;
  const emails = item.emails as unknown[] | undefined;
  return {
    name,
    phone: str(item.phoneUnformatted) ?? str(item.phone) ?? str(phones?.[0]) ?? str(item.phoneNumber),
    email: str(item.email) ?? str(emails?.[0]),
    website: str(item.website) ?? str(item.url && !String(item.url).includes("google.") ? item.url : undefined),
    address: str(item.address) ?? str(item.street),
    city: str(item.city),
    state: str(item.state),
    category: str(item.categoryName) ?? str(item.category) ?? str((item.categories as unknown[])?.[0]),
    rating: num(item.totalScore) ?? num(item.rating),
    reviewsCount: num(item.reviewsCount) ?? num(item.reviews),
    mapsUrl: str(item.url)?.includes("google.") ? str(item.url) : undefined,
    externalId: str(item.placeId) ?? str(item.cid) ?? undefined,
    permanentlyClosed: item.permanentlyClosed === true || item.temporarilyClosed === true,
  };
}

/** Google Places API (New) — Text Search. Retorna até `max` resultados. */
export async function googlePlacesSearch(query: string, max: number): Promise<LeadInput[]> {
  const key = await getSetting("GOOGLE_PLACES_KEY");
  if (!key) throw new Error("Chave da Google Places API não configurada.");
  const out: LeadInput[] = [];
  let pageToken: string | undefined;
  do {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.formattedAddress,places.addressComponents,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.googleMapsUri,places.businessStatus,nextPageToken",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "pt-BR", regionCode: "BR", pageSize: 20, pageToken }),
    });
    if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      places?: Array<Record<string, any>>;
      nextPageToken?: string;
    };
    for (const p of data.places ?? []) {
      const city = (p.addressComponents as Array<{ types: string[]; longText: string }> | undefined)?.find((c) =>
        c.types.includes("administrative_area_level_2"),
      )?.longText;
      out.push({
        name: p.displayName?.text ?? "Sem nome",
        phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber,
        website: p.websiteUri,
        address: p.formattedAddress,
        city,
        category: p.primaryTypeDisplayName?.text,
        rating: p.rating,
        reviewsCount: p.userRatingCount,
        mapsUrl: p.googleMapsUri,
        externalId: p.id,
        permanentlyClosed: p.businessStatus && p.businessStatus !== "OPERATIONAL",
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken && out.length < max);
  return out.slice(0, max);
}
