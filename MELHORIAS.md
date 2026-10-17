# Melhorias do prospec.

Levantamento feito lendo todo o código (API, worker, regras de negócio e telas).
✅ = feito nesta rodada · ⏳ = recomendado para a próxima rodada.

## 1. Bugs encontrados

| # | Onde | Problema | Status |
|---|---|---|---|
| 1 | `lib/campaigns.ts` | Qualquer erro antes do envio (banco, template vazio etc.) matava a corrente de "ticks": a campanha ficava como *Disparando* sem nunca mais enviar e o destinatário travava em `SENDING`. | ✅ |
| 2 | `lib/campaigns.ts` | `pick([])` quando todas as variações estavam em branco gerava `undefined` e quebrava o render. | ✅ |
| 3 | `lib/campaigns.ts` | O próximo destinatário era escolhido sem ordem (o banco decide). Agora vai do lead mais quente para o mais frio. | ✅ |
| 4 | `lib/inbound.ts` | Nas engines NOWEB/GOWS o id devolvido no envio (`3EB0…`) é diferente do id do webhook (`true_55…@c.us_3EB0…`) e o campo `source` nem sempre vem. Resultado: mensagens enviadas pelo sistema apareciam **duplicadas** e a IA era pausada achando que você respondeu pelo celular. | ✅ |
| 5 | `lib/waha.ts` / webhook | Confirmações de entrega/leitura (`message.ack`) não eram assinadas nem tratadas — não dava para ver ✓✓ nem leitura. | ✅ |
| 6 | `api/leads/bulk` | Ações `tag`, `stage`, `flow`, `campaign` sem `value` derrubavam a rota com erro 500. | ✅ |
| 7 | `api/leads/[id]` | Trocar o telefone para um número que já existe em outro lead estourava erro cru do Prisma. | ✅ |
| 8 | `lib/api.ts` | Registro não encontrado virava erro 500 com mensagem técnica; agora 404/409 com mensagem em português. | ✅ |
| 9 | `api/dashboard` | "Mensagens hoje" usava a meia-noite do servidor, não do fuso configurado (`TZ`). | ✅ |
| 10 | `lib/messaging.ts` | Enviar com o WhatsApp desconectado mostrava `WAHA 422 /api/sendText: {...}`. Agora: "WhatsApp não está conectado". | ✅ |
| 11 | Leads | O campo de busca não atualizava quando o filtro mudava pela URL (ex.: link do painel). | ✅ |
| 12 | Conversas | Não era possível iniciar conversa com um número novo — só responder quem já estava na base. | ✅ |
| 13 | Conversas | Mensagem enviada só aparecia depois do próximo polling (até 5 s) e falhas não tinham "tentar de novo". | ✅ |

## 2. WhatsApp (conectar e enviar pelo sistema)

- ✅ **Tela própria `/whatsapp`** (antes ficava escondida em Configurações), com passo a passo: conectar → ler QR → pronto.
- ✅ QR code atualizado automaticamente e **conexão por código** (digitar o código de 8 letras no celular, sem câmera).
- ✅ Conta conectada: nome, número e foto, engine, sessão.
- ✅ Ações: conectar, reiniciar, parar, desconectar número, reconfigurar webhook.
- ✅ **Mensagem de teste** para qualquer número direto da tela.
- ✅ Diagnóstico: WAHA alcançável? `WEBHOOK_SECRET` configurado? URL pública que o WAHA chama.
- ✅ Webhook agora assina `message.any`, `message.ack` e `session.status`.
- ⏳ Envio de imagem/arquivo/áudio (o WAHA Core gratuito só envia texto; exige WAHA Plus).
- ⏳ Vários números (exige WAHA Plus — o schema já tem `Campaign.session`).
- ⏳ Atualização em tempo real (SSE/WebSocket) no lugar do polling de 3–5 s.

## 3. Tela de Conversas (inbox)

- ✅ Layout de 3 colunas no padrão shadcn: lista · chat · painel do lead (recolhível).
- ✅ Abas com contadores: Todas / Não lidas / Aguardando você / Com IA.
- ✅ Avatar com iniciais, prévia da última mensagem com ✓/✓✓, horário e badge de não lidas.
- ✅ **Nova conversa**: digita o número (e nome) e envia; cria o lead se não existir.
- ✅ Chat com separador por dia, ✓ enviado / ✓✓ entregue / ✓✓ azul lido, rótulo de autor (IA, Disparo, Automação, Você).
- ✅ Envio otimista, "tentar de novo" em mensagens que falharam, Enter envia / Shift+Enter quebra linha.
- ✅ Respostas rápidas com variáveis (`{{primeiro_nome}}`, `{{saudacao}}`…).
- ✅ Aviso quando o WhatsApp está desconectado, com atalho para conectar.
- ✅ Painel do lead: etapa, IA liga/desliga, "IA responder agora", tags, temperatura, site, link para a ficha.
- ⏳ Arquivar conversa / marcar como não lida.
- ⏳ Exibir mídia recebida (imagem/áudio) baixando do WAHA.

## 4. Visual (shadcn/ui)

- ✅ Tokens do shadcn (`--background`, `--primary`, `--border`, `--ring`…) e fonte Geist.
- ✅ Componentes shadcn em `src/components/ui/` (button, input, textarea, label, card, badge, dialog, sheet, switch, tabs, avatar, separator, tooltip, dropdown-menu, skeleton, alert, sonner).
- ✅ Os atalhos antigos (`Button`, `Input`, `Card`, `Modal`, `Toggle`…) agora usam os componentes shadcn por baixo, então **todas as telas** já herdam o visual novo.
- ✅ Menu lateral novo com ícones (lucide), status do WhatsApp e menu mobile em *Sheet*.
- ✅ Toasts com Sonner.
- ✅ Refeitas por completo: Conversas, WhatsApp, Configurações, Login, Painel, menu.
- ⏳ Trocar `<select>` nativo por `Select`/`Combobox` do shadcn e a tabela de leads por `DataTable` (TanStack).
- ⏳ Modo escuro (os tokens `.dark` já estão no CSS; falta o seletor).

## 5. Outras recomendações

- ⏳ Testes automatizados para `renderTemplate`, `phoneVariants`, `flow-graph` e `campaignTick`.
- ⏳ Worker espera 10 s fixos pelas migrações — trocar por espera ativa no banco.
- ⏳ Login com mais de um usuário / limite de tentativas.
- ⏳ Fixar a versão da imagem do WAHA no `docker-compose.yml` (hoje `latest`).
