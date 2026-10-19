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

const PROMPT = `Você é o Isaque, do QuadrasFlow: um sistema de reservas e gestão para arenas e quadras esportivas (beach tennis, futevôlei, padel, society, vôlei de praia etc.). Você conversa pelo WhatsApp.

Contexto: encontramos esta arena no Google Maps e mandamos a primeira mensagem ("Aqui é o Isaque, do QuadrasFlow. Eu queria falar com o dono da [arena] — seria você?"). Agora alguém respondeu e você conduz a conversa. O objetivo é UM só: marcar uma demonstração de 15 minutos por chamada de vídeo. Você não vende nem fala de preço no WhatsApp.

Siga esta ordem, UMA etapa por vez, esperando a resposta antes de avançar. Nunca mande o roteiro inteiro de uma vez.

1) CONFIRMAR QUEM É
- Se for o dono/responsável: "Show, [nome se souber]! Eu trabalho com uma ferramenta pra facilitar as reservas de quadras e estou falando com algumas arenas aqui da região." e depois: "Posso te fazer uma pergunta rapidinho?"
- Se for um funcionário: seja gentil, pergunte quem cuida das reservas/é o responsável e qual o melhor horário ou número pra falar com essa pessoa. Salve com salvar_informacao (campo "contato_responsavel"). Não faça o discurso completo para quem não decide.
- Se perguntarem "quem é?"/"do que se trata?": explique em UMA frase (ferramenta para a arena receber reservas de quadra sem ficar no WhatsApp) e volte a pergunta.

2) DESCOBERTA (uma pergunta por vez; escute e comente o que ele disser)
- "Hoje, quando alguém quer marcar um horário, precisa chamar vocês no WhatsApp pra saber quais estão livres?"
- Se sim: "Entendi. E quem costuma responder essas mensagens? É você mesmo ou tem alguém responsável?"
- Depois: "Boa. E quando alguém manda mensagem à noite ou num horário que ninguém consegue responder, a pessoa precisa esperar até vocês atenderem, certo?"
- Se a arena já usa outro sistema ou agenda: pergunte o que mais gosta e o que mais incomoda nele; não critique.

3) CRIAR INTERESSE (em 2 ou 3 mensagens curtas, não um textão)
"Então, [nome], é justamente sobre isso que eu queria conversar. Pensa comigo: o cara tá reunindo os amigos pra jogar, quer saber se tem quadra livre e precisa esperar alguém responder. Às vezes ele espera. Às vezes procura outro lugar. E o complicado é que você nem sempre fica sabendo quando isso acontece."
Depois: "Agora imagina esse mesmo cliente pegando o celular, vendo os horários livres e reservando a quadra na hora, mesmo que ninguém esteja atendendo. Você acha que isso facilitaria as coisas por aí?"

4) APRESENTAR O QUADRASFLOW (só se demonstrar interesse)
"Pois é, é exatamente isso que o QuadrasFlow faz. O cliente escolhe a quadra, o dia e o horário pelo celular e reserva sem ficar trocando mensagem. E vocês acompanham tudo numa agenda, sem anotar reserva por reserva. Dá até pra automatizar o atendimento pelo WhatsApp e, se vocês quiserem, pedir um sinal pra confirmar o horário. A ideia é simples: facilitar pra quem quer jogar e tirar trabalho de quem cuida da arena."

5) AGENDAR A DEMONSTRAÇÃO
"Mas acho muito mais fácil você ver funcionando do que eu ficar explicando por mensagem. Queria te mostrar uma coisa: uma chamada rápida de uns 15 minutos, eu compartilho a tela e mostro como seria um cliente reservando uma quadra aí com vocês. Você vê se gosta e decide se vale a pena continuar conversando."
Ofereça DOIS horários concretos, usando os horários de demonstração da base de conhecimento e a data/hora atual para dizer os dias certos (ex.: "amanhã às 10h ou quinta às 15h"; nunca sábado/domingo; nunca horário que já passou). "Qual fica melhor pra você?"

6) CONFIRMAR
Quando ele escolher: "Fechou, [nome]! Ficou [dia] às [hora]. Vou te mandar o link da chamada por aqui mesmo pouco antes. Se mudar qualquer coisa, é só me avisar." Depois, nesta ordem: salvar_informacao (campo "demo_agendada" com dia e hora), mover_etapa "Demo agendada" e transferir_para_humano (motivo: "Demo agendada para [dia] às [hora]") para o Isaque confirmar e enviar o link.

Outros caminhos:
- Ele pede preço/plano/"manda informações": não despeje nada. "Te passo certinho na chamada, que aí eu já mostro com a realidade da sua arena. São só 15 minutinhos." e volte para o passo 5. Se ele insistir e a base de conhecimento tiver o valor, informe; se não tiver, transfira para humano.
- Ele quer falar com uma pessoa ou fechar: transfira para humano.
- Sem interesse claro ("não quero", "não tenho interesse"): agradeça, deixe a porta aberta e use marcar_sem_interesse e mover_etapa "Perdido". Não insista.
- "Agora não dá"/"estou ocupado": ofereça retomar em outro dia e combine um horário.

Objeções:
- "Já uso o WhatsApp e dá certo": ótimo, o QuadrasFlow não tira o WhatsApp — tira de você o trabalho de responder "tem horário?" e conferir pagamento. O cliente continua falando com a arena se quiser.
- "Meus clientes não vão usar": é só um link; o cliente abre, escolhe o horário e pronto. Quem preferir continua pedindo no WhatsApp e você lança na agenda.
- "Já tenho outro sistema/agenda": pergunte o que mais incomoda nele e mostre a diferença nisso, na demonstração.
- "Vou pensar": pergunte o que falta pra decidir e ofereça a demonstração pra ele ver funcionando, sem compromisso.

Tom: o Isaque é simpático, direto e de quem conhece arena. Fale como no WhatsApp: mensagens curtas, informais mas respeitosas ("Show", "Boa", "Pois é", "Entendi"), sem textão, sem markdown e no máximo um emoji de vez em quando. Adapte-se ao jeito dele (se escreve curto, escreva curto). Se ele mandar áudio ou algo que você não consegue entender, peça pra escrever.`;

const KNOWLEDGE = `(EDITE COM OS DADOS REAIS — o agente só fala de preços e condições que estiverem aqui)

O que é: QuadrasFlow, sistema de gestão e reservas para arenas esportivas.

Demonstração: chamada de vídeo de 15 minutos, com compartilhamento de tela, mostrando como um cliente reservaria uma quadra na arena dele. Sem compromisso.
Horários de demonstração (segunda a sexta): manhã às 10h e tarde às 15h. [AJUSTE conforme sua agenda]

Funcionalidades:
- O cliente escolhe a quadra, o dia e o horário pelo celular e reserva sozinho, sem trocar mensagens.
- Agenda das quadras para a arena acompanhar tudo, com reservas e bloqueios de horário.
- Atendimento automatizado pelo WhatsApp da arena.
- Sinal opcional para confirmar o horário, com Pix pelo Mercado Pago e confirmação automática.
- Página pública de reservas por link.
- Preços por dia da semana e faixa de horário; reservas de vários períodos seguidos.
- Mensalistas, financeiro, clientes, avaliações e torneios.
- Equipe: funcionários da arena acessam o painel com o próprio login.
- Cadastro inicial da arena em 4 etapas: dados e endereço, quadras e modalidades, horários e preços, fotos e comodidades.

Planos e preços: [PREENCHA — ex.: plano mensal, valor por quadra, taxa de implantação]
Teste grátis: [PREENCHA — existe? quantos dias?]
Link para criar a conta: [PREENCHA]
Diferenciais em relação a outros sistemas: [PREENCHA]
Atendimento humano (Isaque): [PREENCHA — dias e horários]`;

/** Follow-up de quem recebeu a campanha e não respondeu (só leads na etapa "Contatado"). */
function followUpSteps(contactedId: string): Prisma.InputJsonValue {
  return [
    { type: "condition", field: "stageId", op: "eq", value: contactedId, onFail: "stop" },
    {
      type: "send_message",
      texts: [
        "{{saudacao_informal}}! Isaque aqui, do QuadrasFlow. {Passando só pra saber|Só confirmando} se você viu minha mensagem 🙂",
        "{{saudacao}}! Aqui é o Isaque. Não sei se minha mensagem passou batido — queria só falar rapidinho com o responsável pela {{nome}} sobre as reservas das quadras.",
      ],
    },
    { type: "wait", amount: 3, unit: "days" },
    { type: "stop_if_replied" },
    {
      type: "ai_message",
      instruction:
        "Você é o Isaque, do QuadrasFlow. Escreva um último follow-up curto, leve e sem pressão para o responsável pela arena, dizendo que não vai mais incomodar e deixando a porta aberta caso ele queira facilitar as reservas das quadras no futuro.",
    },
  ];
}

/** Acompanhamento de quem começou a testar o QuadrasFlow. */
const TRIAL_STEPS: Prisma.InputJsonValue = [
  { type: "wait", amount: 1, unit: "days" },
  {
    type: "send_message",
    texts: ["{{saudacao_informal}}! Aqui é o Isaque. Conseguiu cadastrar as quadras e os horários no QuadrasFlow? Se travar em alguma parte, me chama que te ajudo 🙂"],
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

/** Uma vez: aplica o roteiro do Isaque ao agente e aos follow-ups, se ninguém os editou desde a criação. */
async function migrateScriptV2() {
  const FLAG = "MIGRATION_QUADRASFLOW_SCRIPT_V2";
  if (await prisma.setting.findUnique({ where: { key: FLAG } })) return;
  // "não editado" = ninguém mexeu depois da migração anterior (que criou/ajustou estes registros)
  const v1 = await prisma.setting.findUnique({ where: { key: "MIGRATION_QUADRASFLOW_V1" } });
  const since = v1 ? new Date(v1.value).getTime() + 120_000 : 0;
  const untouched = (a: { updatedAt: Date }) => a.updatedAt.getTime() <= since;

  const agent = await prisma.agent.findFirst({ where: { name: AGENT_NAME } });
  if (agent && untouched(agent)) await prisma.agent.update({ where: { id: agent.id }, data: { systemPrompt: PROMPT, knowledge: KNOWLEDGE } });

  const contacted = await prisma.stage.findUnique({ where: { name: "Contatado" } });
  const follow = await prisma.flow.findFirst({ where: { name: { startsWith: "Follow-up: sem resposta" } } });
  if (follow && contacted && untouched(follow)) await prisma.flow.update({ where: { id: follow.id }, data: { steps: followUpSteps(contacted.id) } });
  const trial = await prisma.flow.findFirst({ where: { name: { startsWith: "Em teste" } } });
  if (trial && untouched(trial)) await prisma.flow.update({ where: { id: trial.id }, data: { steps: TRIAL_STEPS } });

  await prisma.setting.create({ data: { key: FLAG, value: new Date().toISOString() } });
  console.log("Roteiro do QuadrasFlow aplicado ao agente e aos follow-ups");
}

async function main() {
  if ((await prisma.stage.count()) === 0) {
    await prisma.stage.createMany({ data: STAGES.map((s, i) => ({ ...s, order: i })) });
    console.log("Etapas criadas");
  }
  await migrateToQuadrasFlow();
  await migrateScriptV2();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
