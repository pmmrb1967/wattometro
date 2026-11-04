// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): Consumo and its report. */
export const consumptionTexts = {
  consumption: {
    tabs: {
      label: 'Páginas do consumo',
      overview: 'Visão geral',
      report: 'Relatório',
      appliances: 'Aparelhos',
    },
    title: 'Consumo',
    intro:
      'O que a tua casa gastou nos últimos 12 meses, a partir do ficheiro da E-Redes ou do Shelly.',
    baseload: {
      title: 'Consumo base',
      intro:
        'O que a casa gasta quando ninguém está a usar nada: frigorífico, router, aparelhos em espera. Está ligado 24 horas por dia, por isso pesa na fatura.',
      recent: (nights: number) =>
        `Valor típico das noites dos últimos 30 dias de dados (${nights} ${nights === 1 ? 'noite' : 'noites'}).`,
      cost: (euros: string, kwh: string) =>
        `Cerca de ${euros} por ano (${kwh}) com o teu tarifário.`,
      noTariff: 'Para saberes quanto custa, indica o teu tarifário.',
      noNights: 'Ainda não há noites com dados suficientes (entre as 0 h e as 6 h).',
      monthsTitle: 'Ver mês a mês',
      method:
        'Em cada noite, entre as 0 h e as 6 h, a app vê a potência média de cada quarto de hora e fica com um dos valores mais baixos: o que só 1 em cada 10 quartos de hora fica abaixo. Assim, um quarto de hora fora do normal não decide. O valor de cada mês é o das noites típicas desse mês.',
      eredesNote:
        'Com os quartos de hora da E-Redes, as pausas curtas do frigorífico ficam na média: o valor real é um pouco mais baixo. Com o Shelly fica mais exato.',
      costNote:
        'O custo é o da energia, com IEC e IVA: o que a fatura desceria sem este consumo. A potência contratada paga-se na mesma.',
    },
    alwaysOn: {
      title: 'O que está sempre ligado',
      intro:
        'Escreve o que fica ligado ou em espera dia e noite. A potência é opcional: com ela, a app diz quanto custa e quanto da base fica por explicar. Num aparelho que também trabalha a sério, como um esquentador, indica só o que gasta em espera.',
      name: 'Aparelho',
      namePlaceholder: 'Router',
      quantity: 'Quantos',
      power: 'W de cada um (opcional)',
      measuredQuestion: 'Medido com um medidor de tomada',
      add: 'Adicionar',
      save: 'Guardar',
      cancel: 'Cancelar',
      edit: 'Editar',
      remove: 'Retirar',
      confirmRemove: (label: string) => `Retirar "${label}" da lista?`,
      failed: 'Não foi possível guardar. Tenta outra vez.',
      noPower: 'Sem potência indicada',
      many: (quantity: number, label: string) => `${quantity} × ${label}`,
      times: (quantity: number, each: string, total: string) => `${quantity} × ${each} = ${total}`,
      measured: 'medido',
      estimated: 'estimado por ti',
      described: (power: string, origin: string, kwh: string, euros: string | null) =>
        `${power} (${origin}): ${kwh} por ano${euros === null ? '' : `, cerca de ${euros}`}`,
      listed: (listed: string, base: string) => `Na lista: ${listed} de ${base} de base.`,
      left: (power: string) => `Por explicar: ${power}.`,
      over: (power: string) => `A lista soma ${power} mais do que a base.`,
      withoutPower: (count: number) =>
        count === 1
          ? '1 aparelho sem potência indicada: o que gasta está dentro do valor por explicar.'
          : `${count} aparelhos sem potência indicada: o que gastam está dentro do valor por explicar.`,
      partly:
        'A base é um dos valores mais baixos da noite. O que liga e desliga sozinho, como o frigorífico, só conta em parte, por isso a comparação é aproximada e a lista pode somar mais do que a base.',
    },
    charts: {
      title: 'Ao longo do tempo',
      views: { day: 'Dia', week: 'Semana', month: 'Mês' },
      previous: 'Anterior',
      next: 'Seguinte',
      weekOf: (first: string, last: string) => `Semana de ${first} a ${last}`,
      total: (kwh: string) => `Total: ${kwh}`,
      axisPower: (unit: string) => `${unit} · potência média de cada quarto de hora`,
      axisPerDay: (unit: string) => `${unit} por dia`,
      quarterTitle: (time: string, kwh: string, power: string, period: string) =>
        `${time}: ${kwh}, ${power} em média (${period})`,
      dayTitle: (day: string, kwh: string) => `${day}: ${kwh}`,
      noData: 'sem dados',
      partialHint: 'Barras mais claras: dias sem dados ou incompletos.',
      today: 'até agora',
      shellyFrom: (date: string) =>
        `A previsão, o consumo base e os tarifários usam a E-Redes até ao último dia do ficheiro que importaste e o Shelly a partir de ${date}. Quando importares um ficheiro mais recente, esses dias passam a ser os da E-Redes.`,
      eredesSeries: 'E-Redes',
      shellySeries: 'Shelly',
      seriesTotals: (parts: string) => `Total: ${parts}`,
      seriesTitle: (when: string, parts: string) => `${when}: ${parts}`,
      difference: (direction: 1 | 0 | -1, pct: string, count: number, unit: 'quarter' | 'day') =>
        `Onde há dados dos dois (${count} ${unit === 'quarter' ? (count === 1 ? 'quarto de hora' : 'quartos de hora') : count === 1 ? 'dia completo' : 'dias completos'}), o Shelly mede ${direction === 0 ? 'o mesmo que' : `${direction > 0 ? 'mais' : 'menos'} ${pct} do que`} a E-Redes.`,
      heatmapTitle: 'Hora a hora, por dia da semana',
      heatmapIntro:
        'Quanto gastas em média em cada hora de cada dia da semana, nas últimas 12 semanas com dados. Cor mais forte é mais consumo.',
      busiest: (busiest: number, quietest: number, hours: number) =>
        `Em média, gastas mais das ${busiest} h às ${(busiest + hours) % 24} h e menos das ${quietest} h às ${(quietest + hours) % 24} h.`,
      heatmapLegend:
        'Toca ou passa o rato numa célula para ver o valor. Horas que se repetem com consumo alto mostram hábitos que podes mudar para o vazio.',
      weekdays: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
      cellTitle: (day: string, hour: number, kwh: string) =>
        `${day}, ${hour}–${hour + 1} h: ${kwh}`,
    },
    reconcile: {
      title: (shelly: string) => `${shelly} e E-Redes`,
      intro:
        'Os dois medem a mesma casa. A E-Redes é a referência da fatura; aqui vês quanto o Shelly se afasta dela nos dias que ambos mediram por inteiro.',
      result: (direction: 1 | 0 | -1, pct: string) =>
        direction === 0
          ? 'O Shelly mede o mesmo que a E-Redes.'
          : `O Shelly mede ${pct} ${direction > 0 ? 'mais' : 'menos'} do que a E-Redes.`,
      totals: (days: number, eredes: string, shelly: string) =>
        `Em ${days} ${days === 1 ? 'dia completo' : 'dias completos'}: E-Redes ${eredes}, Shelly ${shelly}.`,
      incomplete: (days: number) =>
        `${days} ${days === 1 ? 'dia em comum ficou' : 'dias em comum ficaram'} de fora porque um dos dois não tem o dia inteiro: o Shelly perdeu minutos (falha de luz, de rede ou do servidor), ou o ficheiro da E-Redes acaba a meio do dia.`,
      unusualTitle: 'Dias fora do habitual',
      unusualIntro:
        'Afastam-se mais de 3 pontos da diferença habitual: costuma ser uma falha de um dos lados (por exemplo, valores estimados pela E-Redes).',
      unusualDay: (date: string, pct: string) => `${date}: ${pct}`,
      none: (from: string) =>
        `Ainda não há dias medidos pelos dois. O Shelly mede desde ${from}: a comparação aparece quando importares um ficheiro da E-Redes que inclua dias desde então.`,
      onlyIncomplete: (days: number) =>
        `Há ${days} ${days === 1 ? 'dia' : 'dias'} com dados dos dois, mas ${days === 1 ? 'não está inteiro' : 'nenhum está inteiro'} num dos lados (o Shelly perdeu minutos, ou o ficheiro da E-Redes acaba a meio do dia): ainda não dá para comparar.`,
      rule: 'Nos totais, na previsão, no consumo base e nos tarifários conta a E-Redes até ao último dia importado e o Shelly a partir daí: os dois nunca se somam.',
      normal:
        'Uma diferença pequena e estável é normal: são aparelhos diferentes, com tolerâncias próprias.',
    },
  },
  report: {
    title: 'Relatório do mês',
    heading: (month: string) => `Relatório de ${month}`,
    household: (name: string) => `Casa: ${name}`,
    generated: (when: string) => `Gerado pelo Wattómetro em ${when}`,
    month: 'Mês',
    print: 'Imprimir ou guardar em PDF',
    usageTitle: 'Consumo',
    perDay: (kwh: string) => `Em média ${kwh} por dia.`,
    missingDays: (withData: number, days: number) =>
      `Há dados de ${withData} dos ${days} dias do mês: o total e o custo contam só esses dias.`,
    comparison: (month: string, pct: string, before: string, now: string) =>
      `Face a ${month}: ${pct} por dia (${before} → ${now}).`,
    noComparison: (month: string) => `Sem dados de ${month} para comparar.`,
    chartLabel: (month: string) => `Consumo por dia em ${month}`,
    sources: (eredesTo: string, shellyFrom: string) =>
      `Até ${eredesTo}, os dias vêm da E-Redes; a partir de ${shellyFrom}, do Shelly.`,
    costTitle: 'Custo estimado',
    costEnergy: (euros: string) => `Energia: ${euros}`,
    costPower: (euros: string) => `Potência contratada: ${euros}`,
    costTaxes: (euros: string) => `Taxas (IEC, contribuição audiovisual, DGEG): ${euros}`,
    costHint: (days: number, supplier: string) =>
      `Com IVA, para ${days} ${days === 1 ? 'dia' : 'dias'}, com o tarifário em vigor no fim do mês (${supplier}). A fatura real pode ter outro período e acertos.`,
    noTariff: 'Para estimar o custo, indica o teu tarifário.',
    baseloadTitle: 'Consumo base',
    baseloadCost: (euros: string) => `Custou cerca de ${euros} neste mês.`,
    peakTitle: 'Potência máxima',
    peakWhen: (when: string) => `Média do quarto de hora mais alto, a ${when}.`,
    peakContracted: (power: string) => `Potência contratada: ${power}.`,
    peakHint:
      'Em médias de 15 minutos os picos curtos (chaleira, forno a arrancar) não aparecem. A página Potência faz a análise completa.',
    suggestionsTitle: 'Sugestões',
    noSuggestions: 'Nada a assinalar neste mês.',
    see: (page: string) => `Ver ${page}.`,
    suggestions: {
      baseload: (pct: number, power: string, cost: string | null) =>
        `O consumo base (${power}, sempre ligado) foi ${pct} % do consumo do mês${cost ? `: ${cost}` : ''}. Vê o que fica ligado de noite: aparelhos em espera, um segundo frigorífico, bombas, desumidificadores.`,
      peak: (pct: number) =>
        `${pct} % do consumo foi na ponta, o período mais caro. Máquinas, termoacumulador e carregamentos rendem mais no vazio.`,
      offEmpty: (pct: number) =>
        `${pct} % do consumo foi fora do vazio. No bi-horário compensa passar máquinas e termoacumulador para o vazio.`,
      higherThanLastYear: (pct: number) =>
        `Gastaste mais ${pct} % por dia do que no mesmo mês do ano passado. Vê se mudou alguma coisa: aquecimento, um aparelho novo, mais pessoas em casa.`,
      lowPeak: (peak: string, contracted: string) =>
        `O quarto de hora mais alto ficou em ${peak}, menos de metade dos ${contracted} contratados: talvez possas baixar a potência.`,
      simpleTariff:
        'Tens a opção simples. Com o teu consumo real, o bi-horário ou outra oferta podem sair mais baratos.',
    },
    notesTitle: 'Notas',
    notes: {
      source: (meter: string) => `Consumos de: ${meter}.`,
      comparison:
        'As comparações são por média diária, para que meses de 30 e 31 dias ou dias sem dados não pareçam mudanças.',
      estimate:
        'O custo é uma estimativa com os preços que indicaste nas Definições, não uma fatura.',
      rules:
        'As sugestões vêm de regras fixas da app (consumo base acima de 20 %, ponta acima de 25 %, fora do vazio acima de 65 %, mais 15 % do que há um ano, pico abaixo de metade da potência contratada), não de IA.',
    },
  },
} as const;
