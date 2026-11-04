// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): The home page: the last minute, the gauges, the cards, anomalies and the month forecast. */
import { minutes, WEEKDAYS_PLURAL } from './shared';

export const homeTexts = {
  now: {
    channel: (channel: number) => `canal ${channel + 1}`,
    power: 'Potência',
    minuteAt: (time: string) => `média do minuto das ${time}`,
    noReadings: 'Ainda sem medições.',
    neverSeen: 'Este Shelly ainda não enviou dados.',
    stale: (count: number) => `Sem dados há ${minutes(count)}.`,
    voltage: 'Tensão',
    voltageRange: (min: string, max: string) => `no último minuto, de ${min} a ${max}`,
    vsUsual: (pct: number, days: number, weekday: number) =>
      `${
        Math.abs(pct) < 5
          ? 'Como o habitual'
          : `${Math.abs(pct)} % ${pct > 0 ? 'acima' : 'abaixo'} do habitual`
      } a esta hora (média de ${days} ${WEEKDAYS_PLURAL[weekday]} anteriores; o traço marca-a).`,
    today: 'Energia hoje',
    todayMinutes: (count: number) => `desde as 0h · ${minutes(count)} com dados`,
    peak: 'Pico de hoje',
    peakHint: 'maior valor de um segundo',
    nothing: '—',
    cost: 'Custo hoje',
    costParts: { energy: 'Energia', power: 'Potência', taxes: 'Taxas' },
    costNote:
      'Estimativa: a energia de hoje pelos preços do teu tarifário, mais a parte de um dia da potência contratada e das taxas.',
    noTariff: 'Para veres quanto custa, indica o teu tarifário em Definições.',
    databaseNear: (used: number, limit: number) =>
      `A base de dados está a ${used} MB de ${limit} MB. É preciso libertar espaço em breve.`,
  },
  gauges: {
    powerLabel: (power: string, contracted: string, peak: string | null) =>
      `Potência ${power}, com ${contracted} contratados${peak ? `; pico de hoje ${peak}` : ''}.`,
    powerInfo: (k: number) =>
      `O arco vai até 1,5 vezes a potência contratada (o número no arco). A amarelo, acima dela mas até ${String(k).replace('.', ',')} vezes: o contador tolera. A vermelho, o contador corta ao fim de algum tempo, tanto mais curto quanto maior a potência. O traço marca o pico de hoje.`,
    voltageLabel: (voltage: string, low: string, high: string) =>
      `Tensão ${voltage}; a norma pede entre ${low} e ${high}.`,
    curveLabel: (energy: string) => `Consumo de hoje por quarto de hora, ${energy} até agora.`,
    peakMark: (power: string) => `pico ${power}`,
    usualMark: (energy: string) => `habitual ${energy}`,
  },
  home: {
    vatNote: 'Valores em euros com IVA, com o teu tarifário.',
    /** Home without a Shelly: the last day imported from E-Redes, or how to start. */

    eredes: {
      title: 'Consumos da E-Redes',
      lastDay: 'Último dia importado',
      on: (date: string) => `em ${date}`,
      cost: (amount: string) => `${amount} com o teu tarifário`,
      partial: (quarters: number) => `Dia incompleto no ficheiro: ${quarters} quartos de hora.`,
      importNewer: 'Importar consumos mais recentes',
      shellyAdds:
        'Com um Shelly no quadro elétrico vês também o consumo do momento, a potência certa a contratar, os aparelhos e a tensão.',
      addShelly: 'Adicionar um Shelly',
      empty: 'Ainda não há consumos desta casa. Começa por uma das duas:',
      importFile: 'Importar o ficheiro da E-Redes (até 12 meses de histórico)',
      orShelly: 'Ligar um Shelly no quadro elétrico (o consumo minuto a minuto)',
    },
    status: 'Em construção',
    intro:
      'O Wattómetro vai ler o consumo do teu quadro elétrico (Shelly) e os dados da E-Redes para te dizer, em euros, onde podes poupar.',
    actions: {
      title: 'Onde podes poupar',
      noTariff: 'Indica o teu tarifário para veres, em euros, onde podes poupar.',
      toSettings: 'Indicar o tarifário',
      perYear: (amount: string) => `${amount}/ano`,
      saves: 'poupa',
      costs: 'custa',
      ok: 'Já está',
      powerLower: (power: string) => `Baixar a potência para ${power}`,
      powerHint: (current: string) =>
        `Hoje tens ${current}; nos últimos 90 dias nunca precisaste de mais.`,
      powerRight: 'A potência contratada está certa',
      powerRightHint: 'Pelos picos ao segundo dos últimos 90 dias.',
      tariffBetter: (supplier: string) => `Mudar de tarifário (${supplier})`,
      tariffHint: 'A oferta mais barata da ERSE para o teu consumo do último ano.',
      tariffBest: 'Já tens o tarifário mais barato',
      tariffBestHint: 'Comparado com todas as ofertas da ERSE, para o teu consumo.',
      baseload: (power: string) => `Consumo base: ${power}`,
      baseloadHint:
        'O consumo fantasma: o que a casa gasta de noite sem nada a uso (frigorífico, router, aparelhos em espera).',
    },
  },
  anomalies: {
    title: 'Dias fora do habitual',
    intro: (days: number) =>
      `Dias dos últimos ${days} em que a casa gastou muito mais (ou muito menos) do que é costume para esse tipo de dia.`,
    none: (days: number) => `Nos últimos ${days} dias nenhum dia se afastou do habitual.`,
    yesterdayTitle: 'Ontem, fora do habitual',
    yesterday: 'Ontem',
    sentence: (when: string, direction: 1 | -1, pct: number, actual: string, usual: string) =>
      `${when}: ${pct} % ${direction > 0 ? 'mais' : 'menos'} do que o habitual (${actual} em vez de ${usual}).`,
    span: (from: number, to: number) =>
      `${from === 0 ? 'da meia-noite' : `das ${from} h`} ${to === 24 ? 'à meia-noite' : `às ${to} h`}`,
    mostly: (span: string) => `Sobretudo ${span}.`,
    wholeDay: 'Ao longo do dia inteiro, não numa altura em especial.',
    cost: (more: boolean, euros: string) =>
      more ? `Custou cerca de ${euros} a mais.` : `Poupaste cerca de ${euros}.`,
    more: 'Ver os dias fora do habitual',
    showMore: (count: number) =>
      `Ver ${count === 1 ? 'mais 1 dia' : `mais ${count} dias`} fora do habitual`,
    showLess: 'Mostrar só o mais recente',
    method: (days: number) =>
      `Cada dia é comparado com os ${days} dias mais recentes do mesmo tipo (dia útil, sábado, ou domingo e feriado), pela mediana e pelo desvio típico entre eles: só aparece quando se afasta claramente, não por uns poucos por cento. O custo é o da energia, com IEC e IVA, com o teu tarifário.`,
    temperature:
      'Como a tua casa aquece ou arrefece com eletricidade, cada dia é comparado só com dias de temperatura parecida (até 3 °C de diferença).',
  },
  forecast: {
    title: (month: string) => `Fatura prevista de ${month}`,
    titleShort: 'Fatura prevista do mês',
    intro:
      'Quanto vai custar a eletricidade deste mês: o que já gastaste mais uma previsão dos dias que faltam, com o teu tarifário.',
    range: (low: string, high: string) => `Provavelmente entre ${low} e ${high}.`,
    spent: (days: number) => `Já gasto (${days} ${days === 1 ? 'dia' : 'dias'})`,
    energy: 'Energia prevista no mês',
    spentSoFar: (amount: string, days: number) =>
      `Já gastaste ${amount} em ${days} ${days === 1 ? 'dia' : 'dias'}.`,
    notEnough:
      'Ainda não há dados suficientes para prever a fatura: são precisas pelo menos 7 dias de consumo nas últimas 4 semanas.',
    methodTemperature:
      'Previsão a partir do teu consumo dos últimos 12 meses, do dia da semana, dos feriados e da temperatura, ajustada ao nível das últimas 4 semanas.',
    methodType:
      'Previsão a partir do teu consumo dos últimos 12 meses, do dia da semana e dos feriados, ajustada ao nível das últimas 4 semanas.',
    methodNaive:
      'Previsão pela média diária das últimas 4 semanas: foi o método que menos errou nos meses anteriores desta casa.',
    methodFewData: 'Ainda há poucos dados: a previsão é a média diária das últimas 4 semanas.',
    temperatureNotNeeded:
      'O teu aquecimento não é elétrico e não tens ar condicionado (Definições → A tua instalação), por isso a previsão não usa a temperatura.',
    temperatureLeftOut:
      'A temperatura não melhorou as previsões dos meses anteriores (o consumo desta casa quase não depende dela), por isso fica de fora.',
    late: (from: string, to: string) =>
      from === to
        ? `O dia ${from} ainda não chegou da E-Redes: está previsto.`
        : `Os dias de ${from} a ${to} ainda não chegaram da E-Redes: estão previstos.`,
    temperature: (place: string, mean: string) =>
      `Temperatura em ${place} nos próximos dias: ${mean} em média (previsão a 16 dias; depois, a média habitual dessa altura do ano).`,
    noLocation: 'Sem localidade, a previsão não tem em conta a temperatura.',
    toSettings: 'Definições',
    weatherFailed: 'Não foi possível obter a temperatura agora: a previsão não a tem em conta.',
    backtest: (
      count: number,
      temperature: string | null,
      dayType: string | null,
      naive: string | null,
    ) =>
      `Erro médio nos meses anteriores (${count} previsões feitas aos dias 5, 10, 15, 20 e 25): ${[
        temperature && `com a temperatura ${temperature} %`,
        dayType && `só com o dia da semana ${dayType} %`,
        naive && `média das últimas 4 semanas ${naive} %`,
      ]
        .filter(Boolean)
        .join('; ')}. A app usa o que menos errou.`,
    noRange: 'Ainda não há meses anteriores suficientes para indicar a margem de erro.',
    costNote:
      'Inclui potência, taxas e IVA, com o tarifário em vigor no fim do mês. Uma estimativa, não a fatura.',
    noTariff: 'Para saberes o valor em euros, indica o teu tarifário.',
    attribution: 'Dados meteorológicos:',
    budget: {
      set: 'Definir um orçamento mensal',
      change: (amount: string) => `Orçamento mensal: ${amount}`,
      label: 'Orçamento mensal (€, com IVA)',
      save: 'Guardar',
      remove: 'Remover',
      saved: 'Orçamento guardado.',
      removed: 'Orçamento removido.',
      invalid: 'Escreve um valor em euros, por exemplo 80.',
      tooLow: 'Esse valor não chega para a potência, as taxas e o IVA do mês.',
      over: (budget: string) => `Acima do teu orçamento de ${budget}.`,
      within: (budget: string) => `Dentro do teu orçamento de ${budget}.`,
      hint: 'Com o aviso "O mês vai passar o orçamento" ligado (Definições › Avisos), o telemóvel avisa-te quando o ritmo do mês o passar.',
    },
  },
} as const;
