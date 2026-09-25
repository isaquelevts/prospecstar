import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STAGES = [
  { name: "Novo", color: "#64748b" },
  { name: "Contatado", color: "#2340e8" },
  { name: "Respondeu", color: "#7c3aed" },
  { name: "Interessado", color: "#e0711c" },
  { name: "Proposta enviada", color: "#b7791f" },
  { name: "Fechado", color: "#138a52", isWon: true },
  { name: "Perdido", color: "#c9302c", isLost: true },
];

const PROMPT = `Você é o Lucas, consultor comercial de uma agência que cria sites profissionais para pequenas e médias empresas.

Contexto: nós encontramos esta empresa no Google Maps e mandamos a primeira mensagem oferecendo um site. Agora o cliente respondeu e você continua a conversa.

Seu objetivo, nesta ordem:
1. Criar conexão: mostre que você olhou a empresa dele (segmento, cidade, avaliações no Google).
2. Entender a situação: hoje como os clientes encontram a empresa? Tem Instagram? Já teve site?
3. Mostrar o valor: um site próprio aparece no Google quando alguém busca pelo serviço na cidade, passa credibilidade e leva o cliente direto para o WhatsApp.
4. Qualificar: descobrir se quem está falando decide, o que a empresa precisa (site institucional, cardápio, catálogo, agendamento) e se há urgência.
5. Avançar: quando o cliente demonstrar interesse, ofereça enviar exemplos de sites parecidos e uma proposta. Quando ele quiser fechar, pedir proposta formal ou marcar uma conversa, transfira para humano.

Tom: simpático, direto, sem pressão e sem parecer robô. Adapte-se ao jeito do cliente (se ele escreve curto, você escreve curto).

Objeções comuns:
- "Já tenho Instagram": o Instagram é ótimo para quem já te segue; o site é o que faz um cliente novo te achar no Google.
- "Está caro" / "não tenho dinheiro agora": mostre o parcelamento e que um único cliente novo por mês já paga o site.
- "Vou pensar": pergunte o que falta para decidir e ofereça mandar exemplos para ele ver com calma.

Sempre que o lead avançar, mova-o para a etapa certa do funil. Se ele disser que não tem interesse, agradeça e encerre sem insistir.`;

const KNOWLEDGE = `(Edite com os dados reais da sua agência)

Serviços:
- Site institucional (até 5 páginas): R$ 1.200 à vista ou 6x de R$ 220. Entrega em 7 dias úteis.
- Landing page (1 página focada em conversão): R$ 700. Entrega em 4 dias úteis.
- Loja virtual: a partir de R$ 2.500. Prazo sob consulta.
- Inclui: domínio .com.br no 1º ano, hospedagem no 1º ano, botão de WhatsApp, Google Maps, otimização para aparecer no Google, layout para celular.
- Manutenção mensal opcional: R$ 79/mês (alterações de texto e fotos, backups).

Pagamento: Pix, cartão em até 6x, ou 50% na entrada e 50% na entrega.
Portfólio: (coloque aqui links de sites que você já fez)
Atendimento humano: segunda a sexta, 9h às 18h.`;

async function main() {
  if ((await prisma.stage.count()) === 0) {
    await prisma.stage.createMany({ data: STAGES.map((s, i) => ({ ...s, order: i })) });
    console.log("Etapas criadas");
  }

  let agent = await prisma.agent.findFirst();
  if (!agent) {
    agent = await prisma.agent.create({
      data: { name: "Vendedor de sites", isDefault: true, systemPrompt: PROMPT, knowledge: KNOWLEDGE },
    });
    console.log("Agente padrão criado");
  }

  if ((await prisma.flow.count()) === 0) {
    const replied = await prisma.stage.findUnique({ where: { name: "Respondeu" } });
    const contacted = await prisma.stage.findUnique({ where: { name: "Contatado" } });
    await prisma.flow.createMany({
      data: [
        {
          name: "Follow-up: sem resposta em 2 dias",
          active: false,
          trigger: "NO_REPLY",
          triggerConfig: { hours: 48 },
          stopOnReply: true,
          steps: [
            { type: "send_message", texts: ["Oi, {{primeiro_nome}}! {Passando só para saber|Só confirmando} se você viu minha mensagem 🙂", "{{saudacao}}! Conseguiu ver o que te mandei sobre o site da {{nome}}?"] },
            { type: "wait", amount: 3, unit: "days" },
            { type: "stop_if_replied" },
            { type: "ai_message", instruction: "Escreva um último follow-up curto, leve e sem pressão, dizendo que não vai mais incomodar e deixando a porta aberta caso ele queira um site no futuro." },
          ],
        },
        {
          name: "Lead respondeu → mover para Respondeu",
          active: true,
          trigger: "MESSAGE_RECEIVED",
          triggerConfig: {},
          stopOnReply: false,
          // só move quem estava em "Contatado", para não puxar de volta quem já avançou no funil
          steps:
            replied && contacted
              ? [
                  { type: "condition", field: "stageId", op: "eq", value: contacted.id, onFail: "stop" },
                  { type: "move_stage", stageId: replied.id },
                ]
              : [],
        },
      ],
    });
    console.log("Automações de exemplo criadas");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
