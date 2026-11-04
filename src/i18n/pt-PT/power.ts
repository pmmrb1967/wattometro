// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): Potência contratada. */

export const powerTexts = {
  power: {
    day: {
      title: 'Potência ao longo do dia',
      label:
        'Gráfico da potência mais alta de cada minuto do dia, com a potência contratada, o consumo base da noite, o pico do dia e as horas de vazio.',
      dayLabel: 'Dia',
      today: 'Hoje (até agora)',
      contracted: (power: string) => `Potência contratada ${power}`,
      base: (power: string) => `Consumo base ${power}`,
      peak: (power: string, time: string) => `Pico ${power} às ${time}`,
      offPeak: 'Vazio',
      caption:
        'Cada ponto é a potência mais alta nesse bocado do dia, medida a cada segundo (potência aparente, a que o contador compara com a contratada). A escala aperta os valores altos para o consumo base ainda se ver.',
      zoomHint: 'Arrasta sobre o gráfico para ver um intervalo de perto, até ao segundo.',
      range: (from: string, to: string) => `Das ${from} às ${to}`,
      wholeDay: 'Ver o dia todo',
      none: 'Não há valores ao segundo deste dia.',
      error: 'Não foi possível ler os valores ao segundo deste dia. Tenta mais tarde.',
    },
    title: 'Potência contratada',
    intro:
      'A potência contratada mais baixa que não teria cortado a luz no último ano. A app simula o contador da E-Redes com os dados do teu Shelly: segundo a segundo nos últimos 90 dias e, antes disso, com o pico de cada minuto.',
    meter: 'Contador',
    margin: 'Margem de segurança (%)',
    marginHint:
      'Baixa cada escalão nesta percentagem antes de simular, para cobrir cargas que ainda não apareceram e contadores configurados de outra forma.',
    current: (kva: string) => `Potência atual: ${kva}`,
    noTariff:
      'Indica o teu tarifário em Definições para comparar com a potência atual e calcular a poupança.',
    computing: 'A simular…',
    peakLine: (kva: string, kw: string) =>
      `O teu maior pico num segundo: ${kva} de potência aparente; a potência ativa chegou a ${kw}.`,
    peakInfo:
      'O contador compara com a potência contratada a potência aparente (kVA): o que os aparelhos pedem à rede. Os que têm motor ou transformador pedem mais do que a energia que gastam (a diferença é a potência não ativa), por isso o pico em kVA é maior do que em kW. Na fatura, a energia conta em kWh; a potência contratada escolhe-se pelo pico em kVA.',
    recommended: 'Escalão recomendado',
    verdictLower: (current: string, recommended: string) =>
      `Podes baixar de ${current} para ${recommended}`,
    verdictLowerWhy: 'No último ano medido pelo Shelly, o contador nunca teria cortado.',
    verdictSame: (current: string) => `Os teus ${current} estão certos`,
    verdictSameWhy:
      'É o escalão mais baixo que não teria cortado no último ano medido pelo Shelly.',
    verdictHigher: (current: string, recommended: string) =>
      `Considera subir de ${current} para ${recommended}`,
    verdictHigherWhy: (current: string) =>
      `Com ${current}, o contador teria cortado (ou já cortou) no último ano medido pelo Shelly.`,
    adjustMargin: (pct: number) => `Ajustar a margem de segurança (${pct} %)`,
    otherPrice: 'Usar outro preço',
    tooHigh: 'Os picos ultrapassam o escalão mais alto em baixa tensão normal (41,4 kVA).',
    saving: (euros: string) => `${euros}/ano`,
    savingHint: 'Só o termo de potência, com IVA, durante 365 dias.',
    priceFrom: (offer: string, supplier: string) =>
      `Preço a usar no escalão recomendado tirado da oferta “${offer}” (${supplier}) do simulador da ERSE, que tem o mesmo termo de potência que o teu contrato.`,
    priceLabel: (kva: string) => `Termo de potência a ${kva} (€/dia, sem IVA)`,
    priceMissing:
      'Não encontrei nas ofertas da ERSE o teu preço atual. Escreve o preço do escalão recomendado (vê no site do teu comercializador) para calcular a poupança.',
    vatNote:
      'Ao passar a 6,9 kVA ou menos, os primeiros 200 kWh por mês (300 em família numerosa) passam a ter IVA a 6 %: uma poupança extra, não incluída.',
    tiersTitle: 'Escalões simulados',
    tierColumns: { tier: 'Escalão', perYear: 'Por ano', result: 'Resultado' },
    tierCurrent: 'o teu',
    tierSaves: (euros: string) => `poupa ${euros}`,
    tierCosts: (euros: string) => `custa mais ${euros}`,
    tierNoPrice: '—',
    perYearHint:
      'Por ano: a diferença no termo de potência, com IVA, ao preço da oferta da ERSE com o mesmo termo de potência que o teu contrato.',
    change: {
      title: 'Como mudar de potência',
      steps: [
        'Pede a mudança ao teu comercializador. É gratuita e não há limite de mudanças: se o contador começar a cortar, podes voltar a subir.',
        'Com contador inteligente, a mudança é feita à distância, sem visita; o comercializador diz-te se é o teu caso.',
        'Se for preciso um técnico da E-Redes, ele tem de chegar ao quadro elétrico: a visita é marcada numa janela de até 2 h 30 min e a mudança demora cerca de 10 minutos. Se não estiveres, pagas uma compensação.',
        'A potência contratada não pode passar a potência requisitada, que está na ficha eletrotécnica da instalação.',
        'Algumas ofertas só existem em certos escalões: fora deles, é preciso um contrato novo.',
      ],
      source: 'Fonte: ERSE, simulador de potência contratada (perguntas frequentes).',
    },
    tripRule: {
      title: 'Quando o contador corta',
      intro: (k: string, q: string) =>
        `O contador inteligente da E-Redes compara a potência aparente (kVA) com a contratada. Até ${k} × a contratada nunca corta, dure o tempo que durar. Acima disso, conta o tempo e corta tanto mais depressa quanto maior o excesso: ao fim de ${q} ÷ (potência pedida ÷ contratada − ${k}) segundos.`,
      forContract: (kva: string) => `Com os teus ${kva} contratados:`,
      example: (kva: string) => `Por exemplo, com ${kva} contratados:`,
      columns: { power: 'Potência pedida', time: 'Corta ao fim de' },
      never: 'nunca corta',
      times: (power: string, ratio: string) => `${power} (${ratio} ×)`,
      threePhase:
        'Em instalações trifásicas o limite é 1,3 × e o contador controla também cada fase.',
      source:
        'Fonte: E-Redes, especificação funcional do contador inteligente (DEF-C44-506/N, edição 3, 2020, anexo B1), com os valores de fábrica. Não é um prazo fixado na lei: é como o contador funciona. A E-Redes pode configurar outros valores em cada contador; a margem de segurança cobre essa diferença. Contadores antigos, não inteligentes, têm um disjuntor com outra curva.',
    },
    clear: 'nunca chega ao limite de corte',
    safe: (pct: number, when: string) =>
      `passa o limite mas não corta (no máximo ${pct} % do tempo de corte, em ${when})`,
    trips: (count: number, when: string, kva: string) =>
      `cortaria ${count} ${count === 1 ? 'vez' : 'vezes'} (a 1.ª em ${when}, a ${kva})`,
    unknown: 'demasiados minutos acima do limite para verificar',
    estimated: (count: number) =>
      `${count} ${count === 1 ? 'minuto sem' : 'minutos sem'} valores ao segundo (os de há mais de 90 dias já não os têm): contado com o pico do minuto durante o minuto inteiro, por prudência.`,
    season: (month: string, kw: string, pct: number, measured: string) =>
      `Atenção: em ${month}, antes do Shelly, a maior média de um quarto de hora (E-Redes) foi ${kw}, mais ${pct} % do que nos meses que o Shelly mediu (${measured}). Os picos desse mês foram provavelmente maiores do que os simulados: confirma em "O último ano" antes de baixar.`,
    year: {
      title: 'O último ano',
      intro:
        'O pico mais alto de cada mês. Com o Shelly, é o maior segundo, em kVA (o que o contador compara). Sem ele, só há a maior média de um quarto de hora da E-Redes: o pico verdadeiro foi maior, por isso serve para comparar meses, não para escolher a potência.',
      columns: { month: 'Mês', shelly: 'Pico do Shelly (1 s)', eredes: 'Maior média de 15 min' },
      none: '—',
      estimatedMark: '*',
      estimated:
        '* alguns minutos chegaram sem valores ao segundo: o pico desses minutos é a potência ativa (W); a aparente é igual ou maior.',
      limit: (kva: string, threshold: string) =>
        `Com os teus ${kva}, o contador só começa a contar acima de ${threshold}.`,
    },
    nearTrip: {
      title: 'Perto do corte',
      intro: (threshold: string, contract: string) =>
        `Vezes em que a potência passou ${threshold} (1,2 × os ${contract} contratados) e o contador começou a contar para cortar. Mostra as que chegaram a metade do tempo de corte ou mais.`,
      noTariff: 'Indica o teu tarifário em Definições para veres quando estiveste perto do corte.',
      computing: 'A procurar…',
      none: 'Nos últimos 90 dias o contador nunca começou a contar: estiveste sempre longe do corte.',
      closest: (count: number, pct: number, when: string) =>
        `O contador começou a contar ${count} ${count === 1 ? 'vez' : 'vezes'}, sempre longe do corte: no máximo ${pct} % do tempo de corte, a ${when}.`,
      tooMany: 'Há demasiados minutos acima do limite para os analisar aqui.',
      columns: { when: 'Início', duration: 'Duração', peak: 'Pico', progress: 'Do tempo de corte' },
      tripped: 'Terá cortado',
      duration: (seconds: number) => {
        if (seconds < 120) return `${seconds} s`;
        const minutes = Math.floor(seconds / 60);
        const rest = seconds % 60;
        return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
      },
    },
    topTitle: 'Momentos com maior potência',
    topColumns: { when: 'Quarto de hora', peak: 'Pico de 1\u00a0s', share: 'Da potência atual' },
    topEstimatedMark: '*',
    topEstimated:
      '* potência ativa (W): esse minuto chegou sem valores ao segundo; a aparente é igual ou maior.',
    noShelly: 'Ainda não há dados do Shelly neste período.',
    eredesOnly: (kw: string) =>
      `Só há dados da E-Redes: médias de 15 minutos, que escondem os picos curtos que fazem o contador cortar. A maior média foi ${kw}. Não é possível recomendar uma potência só com estes dados.`,
    eredesShelly:
      'Um Shelly no quadro elétrico mede a potência segundo a segundo: com umas semanas de dados, esta página diz-te a potência mais baixa que não corta a luz.',
    caveats: [
      'Curva de corte da especificação do contador inteligente da E-Redes (DEF-C44-506/N, anexo B1), com os valores por omissão: só corta acima de 1,2 × a potência contratada, e mais depressa quanto maior o excesso. A E-Redes pode configurar outros valores; a margem cobre essa diferença.',
      'Monofásico. Em instalações trifásicas o contador usa 1,3 × e controla também cada fase: ainda não é simulado.',
      'Só vê o que o Shelly mediu no último ano: um aparelho novo pode pedir mais potência. Nos meses sem Shelly, a média de 15 minutos da E-Redes só serve de aviso.',
    ],
  },
} as const;
