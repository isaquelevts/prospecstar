import { z } from "zod";
import { body, route } from "@/lib/api";
import { createLeadIfNew } from "@/lib/leads";

const Row = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  category: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

/** Recebe linhas já mapeadas pelo navegador (CSV) e cria os leads. */
export const POST = route(async (req) => {
  const { rows, tags } = z.object({ rows: z.array(z.record(z.string(), z.any())), tags: z.array(z.string()).default([]) }).parse(await body(req));
  let imported = 0;
  let skipped = 0;
  for (const raw of rows.slice(0, 20_000)) {
    const parsed = Row.safeParse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v == null ? undefined : String(v)])));
    if (!parsed.success) {
      skipped++;
      continue;
    }
    const res = await createLeadIfNew({ ...parsed.data, tags }, { source: "csv" });
    if (res.created) imported++;
    else skipped++;
  }
  return { imported, skipped };
});
