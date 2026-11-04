// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): Qualidade: voltage, outages and the complaint letter. */
import { type Band } from './shared';

export const qualityTexts = {
  quality: {
    verdict: {
      outages: (year: number, long: number, short: number) =>
        `Em ${year}: ${long} ${long === 1 ? 'corte longo' : 'cortes longos'} e ${short} ${short === 1 ? 'curto' : 'curtos'}. Indica a tua zona (no fim da página) para os comparar com o padrão.`,
      outagesWithin: (year: number, long: number, short: number) =>
        `Em ${year}: ${long} ${long === 1 ? 'corte longo' : 'cortes longos'} e ${short} ${short === 1 ? 'curto' : 'curtos'}, dentro do padrão da tua zona.`,
      outagesOver: (year: number) =>
        `Em ${year} os cortes já passam o padrão da tua zona: podes ter direito a compensação.`,
      voltageMeets: (weeks: number) => `Tensão dentro da norma nas últimas ${weeks} semanas.`,
      voltageFails: (weeks: number, failing: number) =>
        `Tensão fora da norma em ${failing} das últimas ${weeks} semanas.`,
      complain: 'Em "Reclamar", no fim da página, tens os passos e uma carta já com estes factos.',
    },
    title: 'Qualidade da energia',
    intro:
      'Falhas de energia e tensão medidas pelo teu Shelly, comparadas com os limites do Regulamento da Qualidade de Serviço da ERSE e da norma NP EN 50160.',
    noShelly:
      'As falhas de energia e a tensão medem-se com um Shelly no quadro elétrico: o ficheiro da E-Redes só traz a energia de cada quarto de hora.',
    reportTitle: 'Registo de qualidade da energia elétrica',
    reportHousehold: (name: string) => `Instalação: ${name}`,
    reportPeriod: (from: string, to: string) => `Tensão: de ${from} a ${to}`,
    reportGenerated: (when: string) => `Gerado pelo Wattómetro em ${when}`,
    print: 'Imprimir ou guardar em PDF',
    printHint:
      'O relatório tem só factos medidos (datas, horas, valores) e as fontes dos limites, e a carta de reclamação numa página à parte quando há o que reclamar. Podes anexá-lo a uma reclamação à E-Redes.',
    zone: {
      title: 'Zona de qualidade de serviço',
      label: 'Zona',
      none: 'Escolhe a zona',
      options: {
        A: 'A — mais de 25 000 clientes',
        B: 'B — 2 500 a 25 000 clientes',
        C: 'C — outras localidades',
      },
      hint: 'A: capitais de distrito e localidades com mais de 25 000 clientes; B: localidades com 2 500 a 25 000 clientes; C: as restantes. Define o número e a duração de falhas longas que a E-Redes tem de cumprir por ano. A zona depende da localidade (RQS, art. 14.º); em caso de dúvida, pergunta à E-Redes.',
      saved: 'Zona guardada.',
      chosen: (zone: string) => `Zona ${zone}`,
    },
    outages: {
      title: (year: number) => `Falhas de energia em ${year}`,
      long: (count: number, duration: string) =>
        `Longas (mais de 3 min): ${count} ${count === 1 ? 'falha' : 'falhas'}, ${duration} no total`,
      short: (count: number) => `Breves (até 3 min): ${count}`,
      excluded: (count: number) => `Não contadas por ti: ${count}`,
      standard: (zone: string, count: number, hours: number) =>
        `Padrão individual da zona ${zone}: até ${count} falhas longas e ${hours} h por ano.`,
      overCount: 'O número de falhas longas está acima do padrão.',
      overHours: 'A duração total das falhas longas está acima do padrão.',
      within: 'Dentro do padrão até agora.',
      noZone: 'Escolhe a zona para comparar com o padrão.',
      compensation: {
        estimate: (amount: string) => `Compensação estimada até agora: cerca de ${amount}`,
        parts: (byCount: string, byHours: string | null) =>
          byHours === null
            ? `Pelo número de falhas: ${byCount}. Indica a potência contratada (Definições › Tarifário) para a contar também pela duração.`
            : `Pelo número de falhas: ${byCount}; pela duração: ${byHours}. Paga-se a mais alta.`,
        capped: (cap: string) =>
          `Limitada a ${cap}: o dobro do que a energia do ano pagou em tarifa de uso das redes.`,
        paid: 'É automática (RQS, art. 24.º): não precisas de a pedir. A E-Redes paga ao teu comercializador até 12 de março do ano seguinte e ele desconta-a na primeira fatura emitida 30 dias depois.',
        belowMinimum:
          'Abaixo de 0,50 € não é paga a cada cliente: o valor vai para as tarifas (RQS, art. 106.º).',
        how: (fc: string, kc: string, capYear: string) =>
          `Estimativa: ${fc} por falha longa acima do padrão, ou ${kc} por kVA de potência contratada e por hora acima do padrão (RQS, art. 102.º e Anexo I). A ERSE sobe estes valores todos os anos com a inflação, por isso a compensação real é um pouco maior. O limite usa o valor médio da tarifa de uso das redes de ${capYear}. Falhas por eventos excecionais não contam.`,
      },
      none: 'Nenhuma falha registada este ano.',
      columns: { start: 'Início', end: 'Fim', duration: 'Duração', kind: 'Tipo', count: 'Contar' },
      kindLong: 'longa',
      kindShort: 'breve',
      notCounted: 'não contada',
      exclude: 'Contar esta falha',
      caveats: [
        'O Shelly desliga-se durante a falha: a app vê-a quando ele volta a arrancar. Precisa do script 0.2.0 ou mais recente.',
        'O início é o fim do último minuto recebido antes da falha (precisão de cerca de 1 minuto; pode ficar mais cedo se o Shelly estava sem internet antes).',
        'A app não distingue falhas acidentais, previstas ou de eventos excecionais, nem um reinício do Shelly por atualização ou por o quadro da casa ter disparado. Desmarca as que sabes que não contam.',
        'Falhas de poucos segundos podem passar despercebidas.',
      ],
    },
    voltage: {
      title: 'Tensão',
      period: 'Período',
      weeks: (count: number) => (count === 1 ? 'Esta semana' : `Últimas ${count} semanas`),
      limits: (low: string, high: string, floor: string) =>
        `Limites em baixa tensão (230 V): ${low} a ${high} em 95 % dos valores de 10 minutos de cada semana, e nunca abaixo de ${floor} nem acima de ${high}.`,
      noData: 'Sem medições de tensão neste período.',
      weekColumns: {
        week: 'Semana de',
        evaluated: 'Valores de 10 min',
        outside: 'Fora de 230 V ± 10 %',
        result: 'Resultado',
      },
      evaluated: (count: number, expected: number) => `${count} de ${expected}`,
      excluded: (count: number) =>
        `${count} ${count === 1 ? 'excluído' : 'excluídos'} por falha de energia`,
      meets: 'cumpre',
      failsBand: 'mais de 5 % fora de 230 V ± 10 %',
      failsLimits: 'valores fora de − 15 % / + 10 %',
      episodesTitle: 'Episódios fora de 230 V ± 10 % (valores de cada minuto)',
      minMinutes: 'Duração mínima (minutos)',
      episodeColumns: {
        start: 'Início',
        duration: 'Duração',
        kind: 'Tipo',
        value: 'Valor extremo',
      },
      low: 'subtensão',
      high: 'sobretensão',
      noEpisodes: 'Nenhum episódio com esta duração mínima.',
      truncated:
        'Há demasiados minutos fora dos limites: só aparecem os primeiros. Escolhe um período mais curto.',
      caveats: [
        'O Shelly não é um analisador certificado (IEC 61000-4-30, classe A): os valores são indicativos.',
        'O valor de 10 minutos é a média dos valores médios de cada minuto. Cavas e picos com menos de cerca de 1 segundo podem não aparecer.',
        'A norma aplica-se em exploração normal; ficam de fora a exploração perturbada e os eventos excecionais.',
      ],
    },
    complaint: {
      title: 'Reclamar',
      nothing:
        'Nada a reclamar no período escolhido: a tensão cumpre a norma em todas as semanas e as falhas estão dentro do padrão da tua zona.',
      intro:
        'Os teus registos mostram valores fora dos limites. Uma reclamação tem de descrever esses factos (RQS, art. 66.º); a carta abaixo já os tem. Completa os campos entre [ ] antes de a enviar.',
      steps: [
        'Envia a carta à E-Redes, no Balcão Digital (Contacte-nos), ou ao teu comercializador, que a tem de passar à E-Redes em 3 dias úteis. Junta o PDF desta página (botão no fim).',
        'A E-Redes tem 15 dias úteis para explicar as causas e o que vai corrigir, ver os dados do teu contador inteligente ou medir no local (RQS, art. 66.º). Se falhar o prazo, tens direito a compensação (art. 61.º).',
        'Antes de medições demoradas, a E-Redes tem de te dizer quanto podem custar: se a tensão estiver dentro dos limites, os custos podem ser-te cobrados (art. 66.º, n.º 10).',
        'Sem resposta a tempo, ou com uma resposta que não te satisfaz, pede por escrito a intervenção da ERSE, com os factos e as provas (art. 124.º). Também podes usar o Livro de Reclamações ou um centro de arbitragem de conflitos de consumo (art. 125.º).',
      ],
      letterLabel: 'Carta (podes alterá-la)',
      copy: 'Copiar o texto',
      copied: 'Texto copiado.',
      copyFailed: 'Não foi possível copiar. Seleciona o texto e copia-o.',
      letterTitle: 'Carta de reclamação',
      week: (week: string, outside: number, evaluated: number, limits: number, band: Band) =>
        `semana de ${week}: ${outside} de ${evaluated} valores de 10 minutos fora de ${band.low} a ${band.high}` +
        (limits > 0 ? `, ${limits} abaixo de ${band.floor} ou acima de ${band.high}` : ''),
      letter: (facts: {
        house: string;
        band: Band;
        weeks: string[];
        low: string | null;
        high: string | null;
        outages: string | null;
      }) =>
        [
          'Assunto: Reclamação sobre a qualidade da energia elétrica — CPE [preencher]',
          '',
          'Exmos. Senhores,',
          '',
          `Sou titular do contrato de fornecimento de energia elétrica da instalação com o CPE [preencher], na morada [preencher] (${facts.house}).`,
          '',
          'Ao abrigo do artigo 66.º do Regulamento da Qualidade de Serviço (Regulamento n.º 826/2023), apresento reclamação sobre a qualidade da energia elétrica nesta instalação, com base nos factos seguintes, registados por um medidor instalado no quadro elétrico (valores indicativos, de um equipamento não certificado):',
          '',
          ...(facts.weeks.length > 0
            ? [
                `Tensão fora dos limites da NP EN 50160 (entre ${facts.band.low} e ${facts.band.high} em 95 % dos valores médios de 10 minutos de cada semana, e sempre entre ${facts.band.floor} e ${facts.band.high}):`,
                ...facts.weeks.map((line) => `- ${line};`),
                '',
              ]
            : []),
          ...(facts.low ? [`- ${facts.low}`] : []),
          ...(facts.high ? [`- ${facts.high}`] : []),
          ...(facts.low || facts.high ? [''] : []),
          ...(facts.outages ? [`- ${facts.outages}`, ''] : []),
          'Junto o registo detalhado, com datas, horas e valores.',
          '',
          'Solicito que adotem um dos procedimentos previstos no n.º 2 do artigo 66.º do Regulamento da Qualidade de Serviço (informação das causas e das ações corretivas, verificação dos dados registados pelo contador inteligente ou verificação no local) e que me respondam por escrito no prazo de 15 dias úteis previsto no n.º 4 do mesmo artigo.',
          '',
          'Com os melhores cumprimentos,',
          '[Nome]',
          '[Contacto]',
        ].join('\n'),
      low: (count: number, volts: string, when: string, band: Band) =>
        `${count} ${count === 1 ? 'episódio' : 'episódios'} com a tensão de algum minuto abaixo de ${band.low}; o valor mais baixo foi ${volts}, a ${when};`,
      high: (count: number, volts: string, when: string, band: Band) =>
        `${count} ${count === 1 ? 'episódio' : 'episódios'} com a tensão de algum minuto acima de ${band.high}; o valor mais alto foi ${volts}, a ${when};`,
      outages: (
        year: number,
        count: number,
        duration: string,
        zone: string,
        standardCount: number,
        standardHours: number,
      ) =>
        `Em ${year}, ${count} ${count === 1 ? 'interrupção longa' : 'interrupções longas'} (mais de 3 minutos), com a duração total de ${duration}, acima do padrão individual da zona ${zone} (${standardCount} interrupções e ${standardHours} horas por ano, Anexo I do Regulamento da Qualidade de Serviço).`,
    },
    sourcesTitle: 'Fontes',
    sources: [
      'ERSE, Regulamento da Qualidade de Serviço (Regulamento n.º 826/2023, versão consolidada de 2026): art. 2.º, 12.º, 14.º, 24.º, 25.º, 66.º, 102.º, 106.º e Anexo I.',
      'ERSE, Tarifas e preços para a energia elétrica em 2026, Quadro 3-29 (valor médio das tarifas de uso das redes, para o limite das compensações).',
      'NP EN 50160, características da tensão de alimentação em baixa tensão, conforme reproduzida pela ERSE (Formação ACE, 2021).',
      'Consultado em 22/10/2026 e 28/10/2026. Pormenores em docs/voltage.md no código do Wattómetro.',
    ],
  },
} as const;
