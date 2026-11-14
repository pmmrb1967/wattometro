// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): The questions to the AI and its explanations. */
export const aiTexts = {
  ask: {
    title: 'Perguntar à IA',
    intro:
      'Pergunta o que quiseres sobre o consumo da tua casa. A IA vai buscar os números às contas da app e explica-os: não inventa nem calcula valores.',
    noKey:
      'Para fazer perguntas escolhe a IA em Definições: a IA gratuita, ou uma chave tua da Anthropic ou da Google. Sem IA, tudo o resto da app funciona na mesma.',
    toSettings: 'Escolher a IA em Definições',
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
    costFree: 'Resposta da IA gratuita: sem custo para ti.',
    privacyShort: (vendor: string) => `Só seguem resumos para a ${vendor}, nunca as medições.`,
    privacy: (vendor: string) =>
      `Só seguem para a ${vendor} a tua pergunta e os resumos que a IA pede (totais, custos, médias), nunca as medições ao minuto nem dados da conta.`,
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
    estimate: (cost: string, vendor: string) =>
      `Custo estimado: até cerca de ${cost}. Seguem para a ${vendor} só os números desta página. Confirmas?`,
    note: (cost: string) =>
      `Explicação escrita pela IA a partir dos números da app; as causas são hipóteses. Custou cerca de ${cost}.`,
    noteFree:
      'Explicação escrita pela IA gratuita a partir dos números da app; as causas são hipóteses.',
  },
  ai: {
    /** Who the summaries go to, by the chosen model's vendor (src/ai/models.ts). */
    vendors: {
      anthropic: 'Anthropic',
      gemini: 'Google',
      free: 'Cloudflare (IA gratuita)',
    },
    errors: {
      no_key: 'Falta a chave da API (Definições → Inteligência artificial).',
      invalid_key: 'A chave da API não é válida ou foi revogada.',
      no_credit:
        'A conta do fornecedor da IA não tem crédito: na Anthropic, carrega-a em console.anthropic.com; na Google, ativa a faturação do projeto Google Cloud da chave.',
      rate_limited: 'O fornecedor da IA pediu para esperar um pouco. Tenta daqui a um minuto.',
      unavailable: 'A IA não respondeu. Tenta mais tarde.',
      offline: 'Sem ligação à internet.',
      invalid_output: 'A resposta da IA veio incompleta. Tenta outra vez.',
      refused: 'A IA não quis responder a este pedido.',
      too_large: 'O pedido é demasiado grande para enviar.',
      free_quota:
        'A IA gratuita já gastou o limite de hoje, que é partilhado por todos. Volta à meia-noite UTC; até lá, podes usar uma chave tua em Definições.',
      free_unavailable:
        'A IA gratuita não está disponível aqui (precisa de uma conta com sessão iniciada). Podes usar uma chave tua em Definições.',
    },
  },
} as const;
