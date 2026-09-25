import { NextResponse } from "next/server";
import { ZodError } from "zod";

type Ctx<P> = { params: Promise<P> };

/** Envolve um handler de rota com tratamento de erro padrão em JSON. */
export function route<P = Record<string, string>>(fn: (req: Request, params: P) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const result = await fn(req, (await ctx?.params) as P);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof ZodError) return NextResponse.json({ error: "Dados inválidos", issues: e.issues }, { status: 400 });
      const message = e instanceof Error ? e.message : String(e);
      console.error(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

export async function body<T = any>(req: Request): Promise<T> {
  return (await req.json().catch(() => ({}))) as T;
}
