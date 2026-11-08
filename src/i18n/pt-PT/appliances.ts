// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): Ao segundo: the day's events, the appliances and their calibration. */

export const appliancesTexts = {
  dayEvents: {
    title: 'Ao segundo: o que ligou e desligou',
    intro:
      'Com os valores ao segundo do Shelly, a app encontra cada vez que a potência sobe ou desce de repente e junta cada ligar ao seu desligar. Os ciclos de potência parecida aparecem juntos. Dá nome a cada grupo ("Dar nome") ou calibra um aparelho: a partir daí a app reconhece-o em todos os dias.',
    nameIt: 'Dar nome',
    rename: 'Mudar o nome',
    inTheDay: ' no dia',
    once: (time: string, duration: string) => `Às ${time}, durante ${duration}`,
    times: (count: number, duration: string) => `${count} vezes, cerca de ${duration} cada`,
    range: (shortest: string, longest: string) => `de ${shortest} a ${longest}`,
    showEach: (count: number) => `Ver as ${count} vezes`,
    underACentAmount: '< 0,01 €',
    underACent: (energy: string) =>
      `Custou menos de 1 cêntimo neste dia (${energy}). A app conta o dinheiro ao cêntimo: a fatura do dia com e sem este consumo dá o mesmo valor.`,
    whatIsItLabel: (power: string) => `Que aparelho é este (${power})?`,
    notThisLabel: (label: string, power: string) =>
      `Não é "${label}"? Que aparelho é este (${power})?`,
    likelyProgramme: (
      name: string,
      manualDuration: string,
      manualKwh: string,
      kwh: string,
      difference: string | null,
    ) =>
      `Parece o programa ${name}: o manual diz ${manualDuration} e ${manualKwh}; este usou ${kwh}${difference === null ? '' : `, ${difference}`}.`,
    noProgramme: (duration: string) =>
      `Programa não identificado: nenhum programa do manual dura perto de ${duration}.`,
    plateWarning: (name: string, plate: string, power: string) =>
      `A chapa de "${name}" diz ${plate}; este grupo tem ${power}. Guarda na mesma se tens a certeza.`,
    fromRegister:
      'Os equipamentos que registaste aparecem ao escrever, primeiro os que a chapa permite.',
    confusable: (label: string, other: string) =>
      `Guardado. Atenção: "${label}" e "${other}" têm ciclos quase iguais (mesma potência e duração parecida). A app fica com o mais próximo, mas pode trocá-los.`,
    close: 'Fechar',
    whichTimes: 'Quais destas vezes são este aparelho?',
    whichTimesHint:
      'Desmarca as que são outro aparelho com a mesma potência: a app separa-os pela duração.',
    leftOutFit: (count: number, label: string) =>
      `Guardado. Atenção: ${count === 1 ? 'uma das vezes que deixaste de fora tem' : `${count} das vezes que deixaste de fora têm`} a mesma potência e uma duração parecida com as que escolheste. A app não as consegue separar e pode contá-las também como "${label}".`,
    unreliable: 'pouco fiável',
    loadKinds: { resistive: 'tipo resistência', motor: 'tipo motor' },
    loadKindNote:
      'O tipo vem da potência não ativa que o aparelho junta à da casa. Tipo resistência (até 10 % da potência ativa): chaleira, forno, aquecimento das máquinas, mas também a placa de indução. Tipo motor (15 % ou mais): frigorífico, tambor da máquina, micro-ondas. Diz como o aparelho puxa a corrente, não o que é: o compressor de uma máquina de secar com bomba de calor pode parecer uma resistência. Nos aparelhos pequenos e nos programas inteiros não aparece.',
    unreliableNote:
      'Grupos de menos de 60 W ("pouco fiável") estão perto do mínimo que a app consegue ver: o consumo da casa varia mais do que isso de segundo a segundo, e alguns ligares ficam emparelhados com o desligar errado. A energia deles é um máximo, não uma medida.',
    name: 'Guardar',
    cancel: 'Cancelar',
    forget: 'Esquecer este aparelho',
    forgetHint:
      'Esquece o aparelho todo: todas as vezes dele, em todos os dias, voltam a aparecer sem nome. Para tirar só algumas vezes, desmarca-as acima e guarda com o mesmo nome.',
    named: 'Aparelhos reconhecidos neste dia',
    namedRow: (count: number, energy: string, cost: string | null) =>
      `${count === 1 ? '1 vez' : `${count} vezes`}, ${energy}${cost === null ? '' : `, ${cost}`}`,
    costNote:
      'Custo da energia com o teu tarifário, à hora de cada uso, com IEC e IVA: o que a fatura deste dia teria a menos sem o aparelho. A potência contratada paga-se na mesma.',
    noTariff: 'Para ver quanto custou cada aparelho, indica o teu tarifário.',
    fridge: (pauses: number, power: string, percent: number, energy: string, cost: string | null) =>
      `Parece o frigorífico: ${pauses} pausas regulares neste dia, ${power} acima do fundo, ligado cerca de ${percent} % do tempo. Gastou cerca de ${energy}${cost === null ? '' : ` (${cost})`}.`,
    fridgeUnmeasured: (pauses: number, power: string) =>
      `Parece o frigorífico: ${pauses} pausas regulares neste dia, ${power} acima do fundo. Ficaram muito afastadas para estimar o que gastou.`,
    explained: (percent: number, energy: string) =>
      `Os aparelhos com nome explicam ${percent} % da energia deste dia (${energy}). O resto é o consumo de fundo e o que ainda não tem nome.`,
    nameFailed: 'Não foi possível guardar o nome. Tenta outra vez.',
    tooMany: 'Já há aparelhos a mais com nome. Apaga algum em "Calibrar aparelhos".',
    day: 'Dia',
    orderBy: 'Ordenar por',
    orders: { cost: 'Custo', time: 'Hora', power: 'Potência', duration: 'Duração' },
    today: 'Hoje (até agora)',
    error: 'Não foi possível ler os valores ao segundo deste dia. Tenta mais tarde.',
    none: 'Não há valores ao segundo deste dia.',
    summary: (minutes: number, events: number, cycles: number) =>
      `${minutes} minutos com valores ao segundo: ${events} mudanças de potência, ${cycles} ciclos de ligar e desligar.`,
    pulsing: (power: string) => `${power} aos pulsos`,
    programme: (power: string, heats: number) =>
      `${power}, programa com ${heats === 1 ? '1 aquecimento' : `${heats} aquecimentos`}`,
    how: 'Cada mudança é uma subida ou descida de pelo menos 30 W entre dois momentos estáveis. Um ciclo junta uma subida à descida do mesmo tamanho que vem depois.',
    limits:
      'Um aparelho que muda de fase sem desligar (máquina de lavar: aquecimento, depois motor) aparece com as potências de cada fase (2,00 kW → 400 W). Um que liga e desliga a mesma potência a cada poucos segundos ou minutos (placa de indução, forno a manter a temperatura) aparece como um só uso, "aos pulsos", com a energia dos pulsos. Os ciclos que passam a meia-noite não entram.',
  },
  appliancesPage: {
    title: 'Aparelhos',
    intro:
      'O que cada aparelho reconhecido gasta e custa, e os valores ao segundo de um dia, onde dás nome aos aparelhos.',
    noShelly: 'Só com um Shelly no quadro: os aparelhos reconhecem-se pelos valores ao segundo.',
    equipmentLink: 'Os teus equipamentos',
  },
  calibrate: {
    uncalibratedTitle: 'Por calibrar',
    uncalibratedIntro:
      'Equipamentos que registaste e que a app ainda não reconhece. Calibra-os com o nome deles, ou liga-os na página do equipamento.',
    title: 'Calibrar aparelhos',
    open: 'Calibrar um aparelho',
    back: '← Aparelhos',
    intro:
      'Ensina a app a reconhecer os teus aparelhos: diz qual vais ligar, carrega em "Liguei" quando o ligares e em "Desliguei" quando o desligares. A app guarda os valores ao segundo desse intervalo, que de outra forma se apagam ao fim de 90 dias.',
    tip: 'Resulta melhor com o aparelho sozinho: evita ligar outros ao mesmo tempo. O frigorífico pode trabalhar à vontade.',
    noShelly: 'A calibração precisa dos valores ao segundo de um Shelly.',
    appliance: 'Aparelho',
    appliancePlaceholder: 'Ex.: chaleira, forno, máquina de lavar',
    start: 'Liguei agora',
    stop: 'Desliguei agora',
    cancel: 'Cancelar',
    running: (label: string, since: string, elapsed: string) =>
      `A registar "${label}" desde as ${since} (${elapsed}).`,
    tooLong:
      'Passaram mais de 4 horas. Se já desligaste, indica em baixo a que horas foi; se não, cancela e indica à mão só a parte que interessa.',
    forgot: 'Esqueceste-te de carregar? Indica a que horas desligaste',
    forgotHint:
      'Uma hora aproximada chega. Na dúvida, indica um pouco mais tarde: o desligar tem de ficar dentro do intervalo.',
    invalidEnd: 'Indica uma hora que já passou, até 4 horas depois de ligares.',
    waiting: (label: string) =>
      `"${label}" marcado. À espera dos valores ao segundo: o Shelly envia cada minuto depois de ele acabar.`,
    late: 'Os valores ao segundo desse intervalo ainda não chegaram. O Shelly pode estar sem ligação.',
    retry: 'Tentar outra vez',
    saved: (label: string) => `"${label}" guardado.`,
    manual: 'Já o ligaste? Indica as horas',
    manualIntro:
      'O dia e as horas a que ligou e desligou, nos últimos 90 dias (vês as horas no cartão "Ao segundo").',
    day: 'Dia',
    from: 'Ligou às',
    to: 'Desligou às',
    save: 'Guardar',
    invalidRun: 'Indica um intervalo que já acabou, com menos de 4 horas.',
    noSeconds: 'Ainda não há valores ao segundo para esse intervalo.',
    library: 'Aparelhos calibrados',
    empty: 'Ainda não calibraste nenhum aparelho.',
    loading: 'A analisar…',
    cycle: (power: string, duration: string, energy: string) =>
      `${power} durante ${duration} (${energy})`,
    noCycle: 'Nenhum ligar e desligar claro. Repete com o aparelho sozinho.',
    remove: 'Apagar',
    confirmRemove: (label: string) => `Apagar a calibração "${label}"?`,
    error: 'Não foi possível guardar. Tenta outra vez.',
    recognise: 'Reconhecer nos outros dias',
    recognised: (label: string) => `Reconhecido como "${label}".`,
  },
  recentAppliances: {
    title: 'Quanto custam os aparelhos',
    working: 'A analisar os últimos dias ao segundo…',
    error: 'Não foi possível ler os valores ao segundo dos últimos dias. Tenta mais tarde.',
    noDays: 'Ainda não há um dia inteiro com valores ao segundo.',
    intro: (days: number, first: string, last: string) =>
      days === 1
        ? `No dia ${first}, e um mês igual a esse dia.`
        : `Nos últimos ${days} dias inteiros (${first} a ${last}), e um mês igual a estes dias.`,
    none: 'Nenhum aparelho com nome trabalhou nestes dias.',
    appliance: 'Aparelho',
    uses: 'Usos',
    energy: 'Energia',
    cost: 'Custo',
    perMonth: 'Num mês',
    inEmpty: 'No vazio',
    savingPerMonth: (cost: string) => `−${cost}/mês`,
    shiftNote:
      '"No vazio": quanto pagarias a menos por mês com as máquinas (programas inteiros) sempre no período mais barato do teu tarifário. O fogão, o frigorífico e o resto não mudam de hora.',
    simpleNote:
      'Com o tarifário simples a hora não muda o preço. Em Tarifários vês se o bi-horário compensa com as tuas máquinas no vazio.',
    toTariffs: 'Ver em Tarifários',
    how: 'Custo da energia com o teu tarifário, à hora de cada uso, com IEC e IVA (a potência contratada paga-se na mesma). O mês é uma projeção destes dias: um dia com mais lavagens, ou menos, muda-a.',
    onlyNamed:
      'Só conta os aparelhos com nome, e só os dias com valores ao segundo quase completos. Para dar nome a um aparelho, usa "Dar nome" em "Ao segundo".',
  },
  reprocess: {
    title: 'Reprocessar',
    intro:
      'A app guarda o que encontrou em cada dia, para os aparelhos terem histórico depois de os valores ao segundo se apagarem (90 dias). Quando a deteção melhora, os últimos 7 dias voltam a guardar-se sozinhos; aqui refazes de uma vez os últimos 90. Os dias mais antigos ficam como foram guardados.',
    action: 'Reprocessar os últimos 90 dias',
    working: (done: number, total: number) => `A reprocessar… ${done} de ${total} dias`,
    done: (days: number) =>
      days === 1 ? 'Reprocessado: 1 dia guardado.' : `Reprocessado: ${days} dias guardados.`,
    failed: 'Não foi possível ler ou guardar um dos dias. Tenta outra vez mais tarde.',
  },
  knownAppliances: {
    rhythm: (power: string, seconds: number) => `${power} aos pulsos, a cada ${seconds} s`,
    noRhythm:
      'Ainda sem ritmo: para o aprender, carrega em "Mudar o nome" num uso certo deste aparelho, no cartão "Ao segundo", e escreve o mesmo nome. Com o ritmo, a app separa aparelhos de potência parecida (o fogão pulsa a cada 44 s, uma airfryer a cada 60 s).',
    seeEquipment: 'Ver equipamento',
    linkedHint: 'O nome muda-se no equipamento.',
    title: 'Aparelhos que a app reconhece',
    intro:
      'Cada um é reconhecido pela potência, pela forma e pela duração dos seus ciclos, em todos os dias com valores ao segundo. Dás-lhes nome em "Dar nome" no cartão "Ao segundo" ou a partir de uma calibração. Para mudar um nome, escreve-o na caixa e carrega em "Guardar nome". Um programa mais curto ou mais longo (máquina de lavar a 30 ou a 60 °C) que não seja reconhecido: dá-lhe o mesmo nome e a duração aceite alarga-se.',
    withDurations: (power: string, shortest: string, longest: string) =>
      `${power}, ciclos de ${shortest} a ${longest}`,
    empty:
      'Ainda nenhum. Dá nome a um grupo de ciclos no cartão "Ao segundo", em Consumo › Aparelhos.',
    name: 'Nome do aparelho',
    rename: 'Guardar nome',
    forget: 'Esquecer',
    confirmForget: (label: string) =>
      `Esquecer "${label}"? Os ciclos dele voltam a aparecer sem nome.`,
    failed: 'Não foi possível guardar. Tenta outra vez.',
  },
} as const;
