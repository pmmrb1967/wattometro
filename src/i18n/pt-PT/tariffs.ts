// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): Tarifários. */
export const tariffsTexts = {
  tariffs: {
    title: 'Tarifários',
    intro:
      'O teu consumo real dos últimos 12 meses com os preços de todas as ofertas da ERSE para a tua potência, comparado com o que pagas hoje.',
    noTariff: 'Para comparar, indica primeiro o teu tarifário atual.',
    noData: 'Ainda não há consumos: importa o ficheiro da E-Redes ou instala o Shelly.',
    toSettings: 'Ir para Definições',
    usageTitle: 'O teu consumo',
    meter: 'Consumos de',
    eredesMeter: (house: string) => `${house} (E-Redes)`,
    houseMeter: (house: string) => `${house} (E-Redes + Shelly)`,
    shellyMeter: (shelly: string) => `${shelly} (Shelly)`,
    tooLittle: 'Há menos de 30 dias de consumos: pouco para estimar um ano.',
    perYear: (kwh: string) => `${kwh} por ano`,
    fullYear: (meter: string) => `Os últimos 12 meses medidos (${meter}).`,
    extrapolated: (days: number) =>
      `Estimado a partir de ${days} dias: o inverno e o verão podem pesar de outra forma num ano inteiro.`,
    split: (empty: number, full: number, peak: number) =>
      `No ciclo diário: ${empty} % em vazio, ${full} % em cheias, ${peak} % em ponta.`,
    noOffers: 'Não consegui obter as ofertas da ERSE. Tenta mais tarde.',
    currentTitle: 'O teu contrato atual',
    verdictBetter: (saving: string, offer: string, supplier: string) =>
      `Podes poupar até ${saving} por ano com «${offer}» (${supplier}).`,
    verdictBest: 'Já tens o tarifário mais barato para o teu consumo.',
    perYearUnit: '/ano',
    yourContract: 'O teu contrato',
    currentHint:
      'Estimativa para um ano com o teu consumo dos últimos 12 meses, com IVA e taxas. Preços sem IVA, como na fatura.',
    saving: (euros: string) => `Poupas ${euros} por ano`,
    dearer: (euros: string) => `Mais cara ${euros} por ano`,
    sheet: 'Página da oferta',
    offersTitle: 'Ofertas mais baratas para ti',
    option: 'Opção horária',
    allOptions: 'Todas',
    noLoyalty: 'Sem fidelização',
    noServices: 'Sem serviços obrigatórios',
    count: (count: number) =>
      `${count.toLocaleString('pt-PT')} ofertas comparáveis, da mais barata para a mais cara:`,
    offersSource: (date: string) =>
      `Fonte: ERSE, simulador de preços, versão de ${date} (a mais recente que a app tem). A app procura uma versão nova todas as semanas.`,
    showMore: (count: number) => `Ver mais ${count} ${count === 1 ? 'oferta' : 'ofertas'}`,
    showLess: (count: number) => `Mostrar só as ${count} primeiras`,
    prices: {
      toggle: 'Ver as contas do ano',
      item: (label: string, price: string) => `${label}: ${price}`,
      power: 'Potência',
      energy: 'Energia',
      taxes: 'Taxas e impostos',
      services: 'Serviços obrigatórios',
      perYear: (euros: string) => `${euros} no ano`,
      energyLine: (period: string | null, price: string, kwh: string) =>
        `${period ? `${period}: ` : ''}${price} × ${kwh}`,
      note: 'Preços sem IVA, como os publica a ERSE; os valores do ano têm IVA, para o teu consumo.',
      adjusted: 'Energia com o ajuste ao teu horário (preço à hora).',
      currentNote:
        'Preços sem IVA, como na fatura; os valores do ano têm IVA e o desconto na energia, se tiveres.',
    },
    tags: {
      dual: 'Com gás',
      alsoGas: 'Também com gás',
      loyalty: 'Fidelização',
      services: 'Serviços obrigatórios',
      indexed: 'Preço indexado',
      dynamic: 'Preço à hora, ajustado ao teu consumo',
      average: 'Indexado à média do mês',
    },
    market: {
      tomorrowTitle: 'Amanhã no mercado',
      todayTitle: 'Hoje no mercado',
      cheapest: (hours: number, from: string, to: string, price: string) =>
        `As ${hours} horas mais baratas: das ${from} às ${to}, em média ${price}.`,
      dearest: (from: string, to: string, price: string) =>
        `As mais caras: das ${from} às ${to}, em média ${price}.`,
      notYet: 'Os preços de amanhã saem por volta das 12:00.',
      whoFor:
        'Preços do mercado grossista (OMIE), sem IVA nem redes. Só mudam a fatura num tarifário com preço à hora.',
      alertLink: 'Receber no telemóvel',
    },
    indexed: {
      title: 'Tarifários indexados',
      dearer: (weighted: string, pct: number, average: string) =>
        `Consomes mais nas horas caras: no mercado grossista (OMIE), a tua energia custou em média ${weighted}, ${pct} % acima da média de todas as horas (${average}). Nas ofertas com preço à hora, pagas mais do que a estimativa da ERSE.`,
      cheaper: (weighted: string, pct: number, average: string) =>
        `Consomes mais nas horas baratas: no mercado grossista (OMIE), a tua energia custou em média ${weighted}, ${pct} % abaixo da média de todas as horas (${average}). Nas ofertas com preço à hora, pagas menos do que a estimativa da ERSE.`,
      same: (weighted: string, average: string) =>
        `No mercado grossista (OMIE), a tua energia custou em média ${weighted}, quase o mesmo que a média de todas as horas (${average}): o teu horário não muda o preço das ofertas indexadas.`,
      months: (low: string, lowMonth: string, high: string, highMonth: string) =>
        `O risco: o preço do mercado muda todos os meses. No período medido, a média foi de ${low} em ${lowMonth} a ${high} em ${highMonth}, e nas ofertas indexadas a fatura acompanha-o.`,
      how: 'A app junta o preço do mercado de cada quarto de hora ao teu consumo desse quarto de hora. A diferença entre o preço que pagarias e a média é somada ao preço estimado pela ERSE de cada período.',
      dynamic: (suppliers: string) =>
        `Ofertas com preço à hora (ajustadas ao teu consumo): ${suppliers}.`,
      others:
        'Nas ofertas indexadas à média do mês e nas que não dizem a fórmula, o horário não conta e fica o preço estimado pela ERSE.',
      losses:
        'Não inclui as perdas na rede, que os comercializadores somam ao preço do mercado: com elas, a diferença seria cerca de 15 % maior.',
      source: 'Preços do mercado diário para Portugal: OMIE (omie.es), sem IVA.',
    },
    car: {
      title: 'Carro elétrico',
      intro:
        'Quanto custaria carregar um carro em casa com o teu consumo real, e que tarifário fica mais barato com ele. Usa os teus números: os quilómetros por ano e o consumo que o carro indica.',
      km: 'Quilómetros por ano',
      consumption: 'Consumo do carro (kWh por 100 km)',
      consumptionHint: 'O que o computador de bordo ou a ficha do carro indicam, por exemplo 16,5.',
      charger: 'Carregador em kW (opcional)',
      chargerHint: 'Para saber quantas horas carrega por noite.',
      invalid: 'Escreve um número com uma casa decimal no máximo, por exemplo 16,5.',
      perYear: (kwh: string, share: number) =>
        `O carro gastaria cerca de ${kwh} por ano: mais ${share} % do que a casa gasta hoje.`,
      sameAnyHour: (amount: string, per100: string) =>
        `Com o teu tarifário simples, o preço é o mesmo a qualquer hora: cerca de ${amount} por ano (${per100} por 100 km).`,
      emptyVsAnytime: (empty: string, per100: string, anytime: string) =>
        `Com o teu tarifário: carregar no vazio custa cerca de ${empty} por ano (${per100} por 100 km); a qualquer hora, ${anytime}.`,
      best: (name: string, supplier: string, option: string, amount: string, saving: string) =>
        `Com o carro a carregar no vazio, o mais barato é ${name} (${supplier}, ${option}): ${amount} por ano, menos ${saving} do que o teu tarifário com o carro.`,
      keep: 'Com o carro a carregar no vazio, o teu tarifário continua a ser o mais barato.',
      hours: (hours: string, kw: string) =>
        `Em média, cerca de ${hours} h de carga por noite com um carregador de ${kw} kW.`,
      overPower: (contracted: string) =>
        `Só o carregador já chega à tua potência contratada (${contracted}): a carregar com outros aparelhos ligados, o contador pode cortar. Vê a página Potência antes de o instalar.`,
      losses:
        'Não conta as perdas do carregamento (a energia que se perde entre a tomada e a bateria), que a app não conhece: o custo real é um pouco maior. Valores com IVA, nos preços das ofertas da ERSE.',
    },
    solar: {
      title: 'Painéis solares',
      intro:
        'Quanto produziriam painéis em tua casa, quanto disso gastarias no momento e quanto pouparias na fatura, com o teu consumo real dos últimos 365 dias. A produção é a do PVGIS (Comissão Europeia) para a tua localidade.',
      kwp: 'Potência dos painéis (kWp)',
      kwpHint: 'A soma da potência dos painéis, por exemplo 2,2 para 5 painéis de 440 W.',
      angle: 'Inclinação (graus)',
      angleHint: '0 é deitado; num telhado comum, a inclinação do telhado.',
      aspect: 'Orientação',
      aspects: {
        '-90': 'Este',
        '-45': 'Sudeste',
        '0': 'Sul',
        '45': 'Sudoeste',
        '90': 'Oeste',
      } as Record<string, string>,
      loss: 'Perdas do sistema (%)',
      lossHint: 'Cabos, inversor e sujidade. O PVGIS sugere 14 %.',
      surplusPrice: 'Excedente, €/kWh (opcional)',
      surplusPriceHint: 'O que o comercializador te pagaria pela energia que vai para a rede.',
      install: 'Custo da instalação, € (opcional)',
      installHint: 'Para saber em quantos anos se paga.',
      invalid:
        'Verifica os valores: a potência com uma casa decimal no máximo, a inclinação de 0 a 90, as perdas de 0 a 50.',
      calculate: 'Calcular',
      calculating: 'A pedir a produção ao PVGIS…',
      privacy:
        'Ao calcular, o servidor da app pede ao PVGIS a produção para o centro da tua localidade, com a inclinação, a orientação e as perdas. Não envia consumos nem nada que identifique a casa.',
      demo: 'Na demonstração, a produção é sempre a de painéis em Lisboa a 35° virados a sul.',
      noLocation: 'Indica primeiro a localidade da casa em Definições › Casa.',
      failed: 'O PVGIS não respondeu. Tenta outra vez mais tarde.',
      production: (kwh: string, self: string, selfPct: number) =>
        `Produziriam cerca de ${kwh} por ano. A casa gastaria ${self} no momento (${selfPct} % da produção).`,
      covered: (pct: number) => `Isso cobre ${pct} % do que a casa gasta num ano.`,
      saving: (amount: string) =>
        `Com o teu tarifário, a fatura baixaria cerca de ${amount} por ano.`,
      surplus: (kwh: string) => `Sobrariam ${kwh} por ano, que iriam para a rede.`,
      surplusValue: (kwh: string, amount: string) =>
        `Sobrariam ${kwh} por ano, que iriam para a rede: ${amount} ao preço que indicaste.`,
      payback: (years: string) => `A instalação pagar-se-ia em cerca de ${years} anos.`,
      noPayback: 'Com estes valores, a instalação não se pagaria.',
      best: (name: string, supplier: string, option: string, amount: string, saving: string) =>
        `Com os painéis, o mais barato é ${name} (${supplier}, ${option}): ${amount} por ano, menos ${saving} do que o teu tarifário com os painéis.`,
      keep: 'Com os painéis, o teu tarifário continua a ser o mais barato.',
      bestWithBattery: (
        name: string,
        supplier: string,
        option: string,
        amount: string,
        saving: string,
      ) =>
        `Com os painéis e a bateria, o mais barato é ${name} (${supplier}, ${option}): ${amount} por ano, menos ${saving} do que o teu tarifário com os painéis e a bateria.`,
      keepWithBattery: 'Com os painéis e a bateria, o teu tarifário continua a ser o mais barato.',
      battery: {
        title: 'Bateria (opcional)',
        intro:
          'O que uma bateria acrescentaria: guarda o que sobra dos painéis e dá-o à casa quando eles não chegam. Os valores estão na ficha técnica da bateria.',
        capacity: 'Capacidade útil (kWh)',
        capacityHint: 'A que se pode mesmo usar, não a nominal.',
        efficiency: 'Eficiência de ida e volta (%)',
        efficiencyHint: 'Quanto volta de cada 100 kWh guardados.',
        power: 'Potência máxima (kW, opcional)',
        powerHint: 'A mais alta a que carrega ou descarrega. Sem ela, não há limite.',
        cost: 'Custo da bateria, € (opcional)',
        invalid:
          'Verifica a bateria: a capacidade e a potência com uma casa decimal no máximo, a eficiência de 1 a 100.',
        used: (self: string, pct: number, fromBattery: string) =>
          `Com a bateria, a casa gastaria ${self} dos painéis (${pct} % da produção), dos quais ${fromBattery} vindos da bateria.`,
        saving: (amount: string) =>
          `A fatura baixaria mais ${amount} por ano do que só com os painéis.`,
        surplus: (kwh: string) => `Iriam para a rede só ${kwh} por ano.`,
        surplusValue: (kwh: string, amount: string) =>
          `Iriam para a rede só ${kwh} por ano (${amount} ao preço que indicaste): o que fica na bateria deixa de ser vendido, e isso entra nas contas.`,
        payback: (years: string) => `A bateria pagar-se-ia em cerca de ${years} anos.`,
        noPayback: 'Com estes valores, a bateria não se pagaria.',
        limits:
          'A bateria começa vazia, carrega só com o que sobra dos painéis (não da rede) e perde a eficiência ao carregar. Não entra o desgaste ao longo dos anos.',
      },
      partYear: (days: number) =>
        `Só há ${days} dias de consumo: as contas usam a produção desses mesmos dias, alargada a um ano. Como o sol muda muito com a estação, com dias de verão o resultado sai otimista e com dias de inverno sai pessimista. Fica mais certo com um ano inteiro.`,
      limits:
        'Produção de um ano real (2023), hora a hora, emparelhada com os teus dias. Dentro de cada hora a produção varia (nuvens), por isso o consumo no momento pode ser um pouco menor; sombras de prédios ou árvores não entram. Valores com IVA.',
    },
    social: {
      title: 'Tarifa social',
      intro:
        'Vê se a tua casa pode ter a tarifa social da luz e quanto pouparia com o teu consumo. As respostas ficam só neste ecrã: não são guardadas nem enviadas.',
      already:
        'O teu tarifário já tem o desconto da tarifa social (copiado da fatura em Definições).',
      powerTooHigh:
        'A tua potência contratada é maior do que 6,9 kVA: com ela não há tarifa social. Vê em Potência se podes baixar.',
      benefitsLegend: 'Alguém do agregado recebe uma destas prestações sociais?',
      benefits: {
        csi: 'Complemento solidário para idosos',
        rsi: 'Rendimento social de inserção',
        unemployment: 'Prestação de desemprego',
        family_allowance: 'Abono de família',
        invalidity:
          'Pensão social de invalidez (regime especial de proteção na invalidez ou complemento da prestação social para a inclusão)',
        old_age: 'Pensão social de velhice',
      },
      income: 'Rendimento anual do agregado, em euros (opcional)',
      incomeHint: 'Só conta se ninguém receber as prestações acima.',
      incomeError: 'Escreve um valor em euros, por exemplo 6500.',
      members: 'Pessoas do agregado sem nenhum rendimento (contigo, se for o caso)',
      membersHint: 'Cada uma aumenta o limite de rendimento em 50 %, até 10 pessoas.',
      eligibleBenefit:
        'Pelas tuas respostas, tens direito: recebes uma das prestações que dão acesso.',
      eligibleIncome: (limit: string) =>
        `Pelas tuas respostas, tens direito: o rendimento está dentro do limite para a tua casa (${limit} por ano).`,
      notEligible: (limit: string) =>
        `Pelas tuas respostas, não tens direito. Sem prestações, o limite de rendimento para a tua casa é ${limit} por ano.`,
      saving: (amount: string) =>
        `Com a tarifa social e o consumo dos últimos 12 meses, pouparias cerca de ${amount} por ano.`,
      savingParts: (discount: string, iec: string) =>
        `Desconto médio de 33,8 % na energia e na potência: ${discount}; isenção do IEC: ${iec}. Valores com IVA.`,
      conditions:
        'Condições: o contrato tem de estar em teu nome, ser só para consumo doméstico na habitação permanente e ter potência até 6,9 kVA.',
      how: 'É atribuída automaticamente pela DGEG e o teu comercializador avisa-te. Se achas que tens direito e não recebeste nada, pede um comprovativo à Segurança Social ou às Finanças e entrega-o ao comercializador. Depois, copia os descontos da fatura para o tarifário em Definições.',
      estimate:
        'Estimativa com o desconto médio publicado pela ERSE: o desconto real incide nas tarifas de acesso às redes e muda todos os anos.',
      sources: 'Critérios da ERSE (outubro de 2026). Confirma sempre junto de:',
      links: { dgeg: 'DGEG, tarifa social de energia', erse: 'Folheto da ERSE' },
    },
    shiftTitle: 'Mudar consumo para o vazio',
    shiftIntro:
      'Máquinas e termoacumulador à noite ou ao fim de semana: quanto teria de passar para o vazio para a opção ficar mais barata do que a simples mais barata para ti.',
    shiftAlready: (option: string, supplier: string) =>
      `${option}: já é mais barata do que a simples com o teu consumo atual (${supplier}).`,
    shiftNeeded: (option: string, year: string, month: string, pct: number, supplier: string) =>
      `${option}: compensa se passares ${year} por ano para o vazio (cerca de ${month} por mês, ${pct} % do que gastas fora do vazio), com a melhor oferta dessa opção (${supplier}).`,
    shiftNever: (option: string) => `${option}: não compensa, mesmo com todo o consumo no vazio.`,
    machinesTitle: 'Com as tuas máquinas no vazio',
    machinesIntro: (names: string, outside: string, days: number) =>
      `${names}: gastam cerca de ${outside} por ano fora do vazio (pelos últimos ${days} ${days === 1 ? 'dia medido' : 'dias medidos'} ao segundo). Se passassem a trabalhar só no vazio (à noite ou ao fim de semana):`,
    machinesLine: (
      option: string,
      supplier: string,
      year: string,
      difference: string,
      cheaper: boolean,
    ) =>
      `${option} (${supplier}): pagarias ${year} por ano, ${difference} ${cheaper ? 'a menos' : 'a mais'} do que hoje.`,
    machinesAlready: (names: string) =>
      `${names}: já trabalham quase só no vazio; não há o que mudar.`,
    machinesNone:
      'Quando a app reconhecer as tuas máquinas (máquina de lavar, de loiça, de secar) em "Ao segundo", mostra aqui quanto pagarias com elas no vazio (Consumo › Aparelhos).',
    caveats: [
      'Estimativa para um ano igual ao medido; os preços são os da ERSE de hoje, sem IVA, e a app soma o IVA, as taxas, os serviços obrigatórios e os descontos de cada oferta.',
      'A tarifa social, o seu financiamento, o IEC, a contribuição audiovisual e a taxa DGEG são os do teu tarifário e iguais em todas as ofertas.',
      'Descontos só para novos clientes e campanhas não estão incluídos. Muitas ofertas exigem débito direto ou fatura eletrónica: no nome, «DD» e «FE».',
      'Ofertas "com gás" pedem o gás no mesmo comercializador; mudar só a eletricidade pode fazer perder o desconto dual que tens hoje.',
      'Bi e tri-horário: a app escolhe o ciclo (diário ou semanal) mais barato para ti; confirma com o comercializador qual oferece.',
    ],
  },
} as const;
