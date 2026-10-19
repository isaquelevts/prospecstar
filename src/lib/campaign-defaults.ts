// Sem imports de servidor: este arquivo também é usado pelas telas (cliente).

/** Mensagens padrão de uma campanha nova: variações + spintax para nenhum lead receber o mesmo texto. */
export const DEFAULT_TEMPLATES = [
  "{{saudacao}}, tudo bem? Aqui é o Isaque, do QuadrasFlow. Eu queria falar com o dono da {{nome}} — seria você?",
  "{{saudacao_informal}}! Tudo bem? Sou o Isaque, do QuadrasFlow. Falo com o responsável pela {{nome}}?",
  "{{saudacao}}! Aqui é o Isaque, do QuadrasFlow. Estou {conversando com|falando com} {algumas|várias} arenas aqui da região e queria trocar uma ideia rápida com o dono da {{nome}}. É você?",
];
