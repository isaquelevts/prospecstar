import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// Funil de venda do QuadrasFlow (SaaS para arenas): da primeira mensagem até a assinatura.
const STAGES = [
  { name: "Novo", color: "#64748b" },
  { name: "Contatado", color: "#2340e8" },
  { name: "Respondeu", color: "#7c3aed" },
  { name: "Demo agendada", color: "#e0711c" },
  { name: "Em teste", color: "#b7791f" },
  { name: "Cliente", color: "#138a52", isWon: true },
  { name: "Perdido", color: "#c9302c", isLost: true },
];

/** Etapas do funil antigo (venda de sites) → equivalentes no funil do QuadrasFlow. Os ids são mantidos. */
const STAGE_RENAMES: Record<string, string> = {
  Interessado: "Demo agendada",
  "Proposta enviada": "Em teste",
  Fechado: "Cliente",
};

const AGENT_NAME = "Consultor QuadrasFlow";

const PROMPT = `Você é consultor comercial do QuadrasFlow, um sistema de gestão e reservas para arenas e quadras esportivas (beach tennis, futevôlei, padel, society, vôlei de praia etc.).

Contexto: encontramos esta arena no Google Maps e mandamos uma primeira mensagem perguntando como eles fazem as reservas hoje. Agora o responsável respondeu e você continua a conversa pelo WhatsApp.

Seu objetivo, nesta ordem:
1. Criar conexão: mostre que você olhou a arena (modalidades, cidade, avaliações no Google). Nada de discurso pronto.
2. Entender a operação (uma pergunta por vez, sem interrogatório):
   - Quantas quadras e quais modalidades?
   - Como as reservas são feitas hoje: WhatsApp, caderno, planilha, outro sistema? Quem responde os clientes?
   - Tem mensalistas? Como cobra (Pix, dinheiro, maquininha)? Já teve calote ou horário reservado que ninguém apareceu?
   - Quem decide sobre contratar um sistema?
3. Conectar a dor ao QuadrasFlow, usando o que ele contou:
   - "Passo o dia respondendo se tem horário" → página pública com a agenda: o cliente vê os horários livres, reserva e paga sozinho.
   - "Cliente reserva e não aparece" / "calote" → Pix na hora da reserva, com confirmação automática.
   - "Mensalista atrasa" → controle de mensalistas e financeiro no painel.
   - "Horário vago no meio da semana" → preços por faixa de horário e torneios para encher a agenda.
4. Avançar: quando houver interesse, ofereça uma demonstração rápida (10–15 minutos, por chamada de vídeo) ou o acesso de teste, conforme a base de conhecimento. Pergunte o melhor dia e horário e salve com salvar_informacao.
5. Mova o lead no funil: "Respondeu" quando ele engajar, "Demo agendada" quando marcar a demonstração, "Em teste" quando começar a testar, "Perdido" se disser que não tem interesse.

Regras:
- NUNCA invente preço, prazo, desconto ou funcionalidade. Use só o que está na base de conhecimento. Se a informação não estiver lá, diga que vai confirmar e transfira para humano.
- Quando ele quiser contratar, negociar valores ou falar com uma pessoa, transfira para humano.
- Tom: simpático, direto, de quem entende de arena. Mensagens curtas, como no WhatsApp. Adapte-se ao jeito dele (se ele escreve curto, você escreve curto).
- Se disser que não tem interesse, agradeça, deixe a porta aberta e encerre sem insistir.

Objeções comuns:
- "Já uso o WhatsApp e dá certo": ótimo, o QuadrasFlow não tira o WhatsApp — ele tira de você o trabalho de responder "tem horário?" e conferir Pix, e o cliente continua falando com a arena.
- "Meus clientes não vão usar": é só um link; o cliente abre, escolhe o horário e paga. Quem não quiser continua pedindo pelo WhatsApp e você lança no painel.
- "Já uso outro sistema": pergunte o que ele mais gosta e o que mais incomoda nele, e mostre a diferença naquilo que incomoda.
- "É caro" / "agora não": pergunte quantos horários por semana ficam vagos ou dão problema; um único horário recuperado por semana costuma pagar o sistema.
- "Vou pensar": pergunte o que falta para decidir e ofereça a demonstração para ele ver funcionando, sem compromisso.`;

const KNOWLEDGE = `(EDITE COM OS DADOS REAIS — o agente só fala de preços e condições que estiverem aqui)

O que é: QuadrasFlow, sistema de gestão e reservas para arenas esportivas.

Funcionalidades:
- Agenda das quadras, reservas e bloqueios de horário.
- Página pública de reservas por link: o cliente vê os horários livres, reserva e paga sozinho.
- Reservas também pelo WhatsApp da arena e pelo painel.
- Preços por dia da semana e faixa de horário; reservas de vários períodos seguidos.
- Pix com Mercado Pago: link de pagamento e confirmação automática.
- Mensalistas, financeiro, clientes, avaliações e torneios.
- Equipe: funcionários da arena acessam o painel com o próprio login.
- Cadastro inicial da arena em 4 etapas: dados e endereço, quadras e modalidades, horários e preços, fotos e comodidades.

Planos e preços: [PREENCHA — ex.: plano mensal, valor por quadra, taxa de implantação]
Teste grátis: [PREENCHA — existe? quantos dias?]
Link para criar a conta / agendar demonstração: [PREENCHA]
Diferenciais em relação a outros sistemas: [PREENCHA]
Atendimento humano: [PREENCHA — dias e horários]`;

/** Follow-up de quem recebeu a campanha e não respondeu (só leads na etapa "Contatado"). */
function followUpSteps(contactedId: string): Prisma.InputJsonValue {
  return [
    { type: "condition", field: "stageId", op: "eq", value: contactedId, onFail: "stop" },
    {
      type: "send_message",
      texts: [
        "{{saudacao_informal}}! {Passando só para saber|Só confirmando} se você viu minha mensagem sobre as reservas da {{nome}} 🙂",
        "{{saudacao}}! Conseguiu ver o que te mandei? Se as reservas aí ainda são pelo WhatsApp, acho que vale 5 minutos pra eu te mostrar.",
      ],
    },
    { type: "wait", amount: 3, unit: "days" },
    { type: "stop_if_replied" },
    {
      type: "ai_message",
      instruction:
        "Escreva um último follow-up curto, leve e sem pressão para o responsável pela arena, dizendo que não vai mais incomodar e deixando a porta aberta caso ele queira automatizar as reservas no futuro.",
    },
  ];
}

/** Acompanhamento de quem começou a testar o QuadrasFlow. */
const TRIAL_STEPS: Prisma.InputJsonValue = [
  { type: "wait", amount: 1, unit: "days" },
  {
    type: "send_message",
    texts: ["{{saudacao_informal}}! Conseguiu cadastrar as quadras e os horários no QuadrasFlow? Se travar em alguma parte, me chama que te ajudo 🙂"],
  },
  { type: "wait", amount: 3, unit: "days" },
  { type: "stop_if_replied" },
  {
    type: "ai_message",
    instruction:
      "Escreva uma mensagem curta perguntando como está o teste do QuadrasFlow e sugerindo um próximo passo prático: mandar o link da página de reservas para alguns clientes da arena.",
  },
];

async function setStageFlows() {
  const contacted = await prisma.stage.findUnique({ where: { name: "Contatado" } });
  const replied = await prisma.stage.findUnique({ where: { name: "Respondeu" } });
  const trial = await prisma.stage.findUnique({ where: { name: "Em teste" } });

  const follow = await prisma.flow.findFirst({ where: { name: { startsWith: "Follow-up: sem resposta" } } });
  if (contacted) {
    const data = { name: "Follow-up: sem resposta em 2 dias", active: true, trigger: "NO_REPLY", triggerConfig: { hours: 48 }, stopOnReply: true, steps: followUpSteps(contacted.id) };
    if (follow) await prisma.flow.update({ where: { id: follow.id }, data });
    else await prisma.flow.create({ data });
  }

  if (replied && contacted && !(await prisma.flow.findFirst({ where: { name: { startsWith: "Lead respondeu" } } }))) {
    await prisma.flow.create({
      data: {
        name: "Lead respondeu → mover para Respondeu",
        active: true,
        trigger: "MESSAGE_RECEIVED",
        triggerConfig: {},
        stopOnReply: false,
        // só move quem estava em "Contatado", para não puxar de volta quem já avançou no funil
        steps: [
          { type: "condition", field: "stageId", op: "eq", value: contacted.id, onFail: "stop" },
          { type: "move_stage", stageId: replied.id },
        ],
      },
    });
  }

  if (trial && !(await prisma.flow.findFirst({ where: { name: { startsWith: "Em teste" } } }))) {
    await prisma.flow.create({
      data: { name: "Em teste: acompanhamento", active: true, trigger: "STAGE_CHANGED", triggerConfig: { stageId: trial.id }, stopOnReply: true, steps: TRIAL_STEPS },
    });
  }
}

/** Uma vez: troca o sistema da venda de sites para a prospecção do QuadrasFlow, mantendo leads e conversas. */
async function migrateToQuadrasFlow() {
  const FLAG = "MIGRATION_QUADRASFLOW_V1";
  if (await prisma.setting.findUnique({ where: { key: FLAG } })) return;

  for (const [from, to] of Object.entries(STAGE_RENAMES)) {
    const old = await prisma.stage.findUnique({ where: { name: from } });
    if (old && !(await prisma.stage.findUnique({ where: { name: to } }))) await prisma.stage.update({ where: { id: old.id }, data: { name: to } });
  }

  let agent = await prisma.agent.findFirst({ where: { name: AGENT_NAME } });
  if (!agent) agent = await prisma.agent.create({ data: { name: AGENT_NAME, systemPrompt: PROMPT, knowledge: KNOWLEDGE } });
  await prisma.agent.updateMany({ where: { id: { not: agent.id } }, data: { isDefault: false } });
  await prisma.agent.update({ where: { id: agent.id }, data: { isDefault: true, enabled: true } });

  await setStageFlows();
  await prisma.setting.create({ data: { key: FLAG, value: new Date().toISOString() } });
  console.log("Sistema ajustado para a prospecção do QuadrasFlow");
}

async function main() {
  if ((await prisma.stage.count()) === 0) {
    await prisma.stage.createMany({ data: STAGES.map((s, i) => ({ ...s, order: i })) });
    console.log("Etapas criadas");
  }
  await migrateToQuadrasFlow();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
