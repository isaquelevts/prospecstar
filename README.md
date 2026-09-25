# prospec. — prospecção automática para venda de sites

Sistema self-hosted para encontrar empresas que precisam de site, abordar pelo WhatsApp e conduzir a conversa com IA até a venda.

**Fluxo:** Captação (Google Maps via Apify / Google Places / CSV) → análise automática do site de cada empresa (temperatura do lead) → Disparos com limite e intervalos aleatórios → IA (OpenAI Agents SDK) responde, qualifica e move no funil → você assume quando o lead quer fechar.

## Módulos

| Tela | O que faz |
|---|---|
| **Captação** | Busca no Google Maps pela Apify (`compass~crawler-google-places`), Google Places API ou qualquer actor da Apify. Deduplica por telefone/placeId. |
| **Leads** | Tabela com filtros, ações em massa, importação CSV. Cada lead recebe uma **temperatura** 0–100: sem site, só Instagram ou site fora do ar = quente. |
| **Funil** | Kanban com arrastar e soltar. Etapas configuráveis. |
| **Conversas** | Inbox do WhatsApp. Liga/pausa a IA por conversa. |
| **Disparos** | Campanhas com variações de mensagem, spintax `{Oi\|Olá}`, variáveis `{{nome}}`, janela de horário, dias da semana, limite diário e intervalo aleatório. Uma mensagem por vez. |
| **Agentes IA** | Prompt, base de conhecimento, modelo e ferramentas (mover etapa, tag, salvar informação, chamar humano). Playground para testar sem enviar nada. |
| **Automações** | Gatilho (lead criado, mensagem recebida, etapa, tag, sem resposta em X horas, manual) + passos (mensagem, mensagem gerada por IA, aguardar, condição, mover etapa, tag, ligar/desligar IA, webhook). |

## Arquitetura

```
Caddy (HTTPS) → app (Next.js: interface + API + webhook do WAHA)
                 │
         Postgres ┼ Redis/BullMQ ── worker (scraping, análise de sites, disparos, IA, automações)
                 │
               WAHA (WhatsApp) ── webhook → app
```

- `src/lib/` — regras de negócio (`ai.ts` agente, `campaigns.ts` disparos, `flows.ts` automações, `inbound.ts` mensagens recebidas, `scrapers.ts`, `waha.ts`)
- `src/worker/index.ts` — processador das filas
- `src/app/api/` — rotas da API; `src/app/(app)/` — telas
- `prisma/schema.prisma` — banco

## Deploy na VPS

Requisitos: VPS com 2 GB+ de RAM (4 GB recomendado com engine WEBJS), Docker e Docker Compose, um domínio apontando (registro A) para o IP da VPS.

```bash
git clone <seu-repo> prospec && cd prospec
cp .env.example .env
# preencha o .env — gere segredos com: openssl rand -hex 32
nano .env
docker compose up -d --build
docker compose logs -f app worker
```

Acesse `https://SEU_DOMINIO` e entre com `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### Primeiros passos

1. **Configurações** → preencha a chave da OpenAI e o token da Apify (ou deixe no `.env`).
2. **Configurações → WhatsApp → Conectar** e leia o QR code com o celular (Aparelhos conectados).
3. **Agentes IA** → abra “Vendedor de sites”, escolha o **modelo** (a lista vem da sua conta OpenAI), edite a **base de conhecimento** com seus preços reais e teste no playground.
4. **Captação** → busque, por exemplo, “dentista” em “Campinas, SP”.
5. **Disparos** → nova campanha (já vem filtrando leads sem site e nunca contatados) → *Adicionar à fila* → *Iniciar disparos*.
6. **Automações** → ative o follow-up de 48h quando estiver confortável.

### Sem domínio (só IP)

Troque no `docker-compose.yml` o serviço `caddy` por uma porta no app (`ports: ["3000:3000"]`) e use `COOKIE_SECURE=false`. Não recomendado em produção.

## Sobre o WhatsApp (leia antes de disparar)

- **WAHA Core (gratuito) só permite uma sessão chamada `default`.** Para vários números, é preciso o WAHA Plus.
- WhatsApp bane números que disparam em massa para quem não os conhece. Para reduzir o risco: use um número dedicado e “aquecido”, comece com 20–40 mensagens/dia, mantenha intervalos de 60–180 s, use várias variações de texto, respeite quem pede para sair (o sistema faz opt-out automático por palavra-chave e pela IA).
- Quando você responde um lead pelo celular, a IA daquele lead é pausada automaticamente (configurável).

## IA

Usa o **OpenAI Agents SDK** (`@openai/agents`). Cada agente tem prompt, base de conhecimento e modelo próprios — a tela do agente lista os modelos disponíveis na sua chave (ou você digita o nome). O agente lê o histórico e os dados do lead, responde em mensagens curtas e pode chamar ferramentas: mover etapa, adicionar tag, salvar informação, marcar sem interesse e transferir para humano. Mensagens picadas do cliente são agrupadas (“esperar antes de responder”). Em modelos de raciocínio (gpt-5, o3, o4…) o esforço de raciocínio é ajustável. O tracing do SDK fica desligado, para as conversas dos clientes não irem para o painel de traces da OpenAI.

## Desenvolvimento local

```bash
docker run -d --name pg -e POSTGRES_PASSWORD=dev -e POSTGRES_USER=prospec -e POSTGRES_DB=prospec -p 5432:5432 postgres:16-alpine
docker run -d --name redis -p 6379:6379 redis:7-alpine
docker run -d --name waha -e WAHA_API_KEY=dev -p 3001:3000 devlikeapro/waha
# .env com DATABASE_URL=postgresql://prospec:dev@localhost:5432/prospec, REDIS_URL=redis://localhost:6379,
# WAHA_URL=http://localhost:3001, PUBLIC_URL=http://host.docker.internal:3000, COOKIE_SECURE=false
npm install
npx prisma migrate deploy && npm run db:seed
npm run dev          # interface em http://localhost:3000
npm run dev:worker   # em outro terminal
```

Mudou o `schema.prisma`? Gere uma migração com `npx prisma migrate dev --name descricao`.
