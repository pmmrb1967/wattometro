// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): The questions to the AI and its explanations. */
export const aiTexts = {
  ask: {
    title: 'Perguntar à IA',
    intro:
      'Pergunta o que quiseres sobre o consumo da tua casa. A IA vai buscar os números às contas da app e explica-os: não inventa nem calcula valores.',
    noKey:
      'Para fazer perguntas precisas de uma chave da API da Anthropic tua. Sem ela, tudo o resto da app funciona na mesma.',
    toSettings: 'Adicionar a chave em Definições',
    question: 'A tua pergunta',
    followUp: 'Outra pergunta (a IA lembra-se desta conversa)',
    placeholder: 'Escreve a tua pergunta…',
    placeholderFollowUp: 'Outra pergunta…',
    open: 'Perguntar à IA',
    close: 'Fechar a conversa',
    resize: 'Largura da conversa (arrasta, ou usa as setas)',
    /** As the AI is told (and as the prompt names the pages). */
    pages: {
      home: 'Início',
      consumption: 'Consumo',
      report: 'Relatório',
      power: 'Potência',
      tariffs: 'Tarifários',
      quality: 'Qualidade',
    },
    suggestions: {
      home: [
        'Quanto vou pagar este mês?',
        'Quanto me custa o consumo fantasma?',
        'Houve dias fora do habitual?',
      ],
      consumption: [
        'Quanto gastei em setembro?',
        'Quanto me custa o consumo fantasma?',
        'Houve dias fora do habitual este mês?',
      ],
      report: [
        'De onde vem o custo deste mês?',
        'Quanto vou pagar este mês?',
        'Houve dias fora do habitual este mês?',
      ],
      power: [
        'Que potência devo contratar?',
        'Posso baixar a potência contratada?',
        'Quanto poupo se mudar de potência?',
      ],
      tariffs: [
        'Compensa-me o bi-horário?',
        'Qual é o tarifário mais barato para mim?',
        'Quanto poupo se mudar de tarifário?',
      ],
      quality: [
        'A tensão esteve dentro dos limites?',
        'Houve cortes de energia?',
        'Tenho motivo para reclamar à E-Redes?',
      ],
    },
    ask: 'Perguntar',
    thinking: 'A pensar…',
    estimate: (cost: string, model: string) =>
      `Custo estimado: até cerca de ${cost} (${model}). Confirmas o envio?`,
    send: 'Enviar',
    cancel: 'Cancelar',
    restart: 'Nova conversa',
    used: (tools: string) => `Números da app usados: ${tools}`,
    unconfirmed: (values: string) =>
      `Atenção: estes valores não vêm das contas da app e podem estar errados: ${values}. Confirma na página indicada.`,
    cost: (cost: string) => `Custo desta resposta: cerca de ${cost}.`,
    privacyShort: 'Só seguem resumos para a Anthropic, nunca as medições.',
    privacy:
      'Só seguem para a Anthropic a tua pergunta e os resumos que a IA pede (totais, custos, médias), nunca as medições ao minuto nem dados da conta.',
    tools: {
      get_consumption_summary: 'consumo',
      get_cost_breakdown: 'relatório do mês',
      simulate_tariffs: 'comparação de tarifários',
      recommend_contracted_power: 'potência contratada',
      get_baseload: 'consumo base',
      get_anomalies: 'dias fora do habitual',
      forecast_month_bill: 'previsão da fatura',
      get_voltage_events: 'qualidade da energia',
      get_appliances: 'custo dos aparelhos',
    } as Record<string, string>,
  },
  explain: {
    button: 'Explicar com IA',
    title: 'Em palavras simples',
    actions: 'O que podes fazer:',
    estimate: (cost: string) =>
      `Custo estimado: até cerca de ${cost}. Seguem para a Anthropic só os números desta página. Confirmas?`,
    note: (cost: string) =>
      `Explicação escrita pela IA a partir dos números da app; as causas são hipóteses. Custou cerca de ${cost}.`,
  },
  ai: {
    errors: {
      no_key: 'Falta a chave da API da Anthropic (Definições → Inteligência artificial).',
      invalid_key: 'A chave da API não é válida ou foi revogada.',
      no_credit: 'A conta da Anthropic não tem crédito. Carrega-a em console.anthropic.com.',
      rate_limited: 'A Anthropic pediu para esperar um pouco. Tenta daqui a um minuto.',
      unavailable: 'A Anthropic não respondeu. Tenta mais tarde.',
      offline: 'Sem ligação à internet.',
      invalid_output: 'A resposta da IA veio incompleta. Tenta outra vez.',
      refused: 'A IA não quis responder a este pedido.',
      too_large: 'O pedido é demasiado grande para enviar.',
    },
  },
} as const;
