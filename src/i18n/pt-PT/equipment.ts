// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): Equipamentos: the register, the photos and the estimates. */
import type { EquipmentKind } from '../../domain/equipment';

export const equipmentTexts = {
  equipmentEstimate: {
    card: {
      title: 'Onde vai o consumo (estimativa)',
      intro: (from: string, to: string, days: number, measured: string) =>
        `De ${from} a ${to} (os últimos ${days} dias com dados da E-Redes), a casa gastou ${measured}. Cada equipamento conta com o que indicaste em "Para a estimativa do consumo": a etiqueta energética, ou a chapa, e o uso.`,
      noData:
        'Ainda não há consumos da E-Redes. Importa o ficheiro do Balcão Digital para comparar as estimativas com o que gastaste.',
      empty:
        'Nenhum equipamento tem estimativa. Edita um e preenche "Para a estimativa do consumo" com a etiqueta energética, ou a chapa, e o uso.',
      equipment: 'Equipamento',
      energy: 'Energia',
      cost: 'Custo',
      share: 'Do total',
      pct: (pct: number) => `${pct} %`,
      explained: (pct: number, measured: string, rest: string) =>
        `Os equipamentos com estimativa explicam ${pct} % dos ${measured} medidos. Os outros ${rest} são do que não registaste, ou de um uso maior do que indicaste.`,
      overshoot: (over: string) =>
        `As estimativas passam o que foi medido em ${over}: algum uso indicado é maior do que o real, ou a chapa está muito acima do que o aparelho gasta.`,
      coldWithinBase: (names: string, cold: string, base: string) =>
        `Pela etiqueta, ${names}: em média ${cold}. O consumo base medido de noite é ${base}; o resto é do que fica sempre ligado (ver o cartão "Consumo base" em Consumo).`,
      coldAboveBase: (names: string, cold: string, base: string) =>
        `Pela etiqueta, ${names}: em média ${cold}, mais do que o consumo base medido de noite (${base}). A etiqueta é de ensaio: na casa podem gastar menos, ou o valor indicado não é o da etiqueta.`,
      missing: (names: string) => `Sem estimativa: ${names}.`,
      noPlate: (names: string) =>
        `Com base na chapa, mas sem a potência da chapa escrita (fica de fora da conta): ${names}.`,
      caveat:
        'É uma ordem de grandeza, não uma medição: a etiqueta é medida em condições de ensaio e o uso é o que indicaste. O custo é ao preço médio da energia nestes dias, com o tarifário de cada dia e sem a potência contratada.',
    },
    fields: {
      title: 'Para a estimativa do consumo',
      intro:
        'Opcional. Para quem só tem os dados da E-Redes: a app soma o que cada equipamento gasta segundo a etiqueta energética, ou a chapa, e o uso que indicas, e compara com o que a E-Redes mediu.',
      basis: 'Com base em',
      none: 'Sem estimativa',
      suggested: (text: string) => `${text} (este tipo)`,
      bases: {
        year: 'Etiqueta, kWh/ano',
        cycles100: 'Etiqueta, kWh/100 ciclos',
        hours1000: 'Etiqueta, kWh/1000 h',
        plate: 'Chapa e tempo de uso',
      },
      label: {
        year: 'Energia da etiqueta (kWh/ano)',
        cycles100: 'Energia da etiqueta (kWh/100 ciclos)',
        hours1000: 'Energia da etiqueta (kWh/1000 h)',
      },
      labelRead: 'Energia da etiqueta',
      labelValue: {
        year: (kwh: string) => `${kwh} kWh/ano`,
        cycles100: (kwh: string) => `${kwh} kWh/100 ciclos`,
        hours1000: (kwh: string) => `${kwh} kWh/1000 h`,
      },
      cyclesPerWeek: 'Ciclos por semana',
      timePerDay: 'Tempo de uso por dia (h:mm)',
      needsPlate: 'Escreve acima a potência da chapa: é com ela que se faz a conta.',
      plateCeiling:
        'A chapa é um teto: o aparelho costuma gastar um pouco menos, por isso a estimativa fica por cima.',
      invalid:
        'Falta um valor ou não é válido: a energia em kWh com até 3 casas decimais, os ciclos de 1 a 50, o tempo em h:mm.',
    },
  },
  equipmentPhotos: {
    title: 'Ler de fotografias',
    intro: (max: number) =>
      `Com a tua chave de IA: escolhe ou tira até ${max} fotografias da chapa, da etiqueta energética ou da tabela de programas do manual. Vão diretamente para a IA, mais pequenas e sem a localização, e não ficam guardadas. Confirmas cada valor antes de o usar.`,
    choose: 'Escolher fotografias',
    take: 'Tirar fotografia',
    takeAnother: 'Tirar outra fotografia',
    tooMany: (max: number) => `Escolhe no máximo ${max} fotografias.`,
    unreadable: 'Não consegui abrir uma das fotografias. Experimenta uma em JPEG ou PNG.',
    preparing: 'A preparar as fotografias…',
    confirm: (count: number, cost: string) =>
      `Enviar ${count === 1 ? '1 fotografia' : `${count} fotografias`} à IA? Custo estimado: até ${cost}.`,
    send: 'Enviar',
    cancel: 'Cancelar',
    busy: 'A IA está a ler as fotografias…',
    reviewTitle: 'Li isto nas fotografias',
    reviewIntro:
      'Marca o que queres usar. Confirma cada valor com a fotografia: a IA pode ler mal um número.',
    nothing: 'Não encontrei nestas fotografias nada que o registo use.',
    now: (value: string) => `agora: ${value}`,
    programme: (row: {
      name: string;
      duration: string;
      energy: string;
      temperature: string;
      load: string;
    }) =>
      [
        `${row.name}: ${row.duration}, ${row.energy} kWh`,
        row.temperature === '' ? null : `${row.temperature} °C`,
        row.load === '' ? null : `${row.load} kg`,
      ]
        .filter((part) => part !== null)
        .join(', '),
    replaces: 'substitui o programa com o mesmo nome',
    programmesNeedKind: (count: number) =>
      `Li ${count === 1 ? '1 programa' : `${count} programas`}, mas os programas só se guardam numa máquina de lavar roupa ou loiça. Escolhe primeiro o tipo.`,
    refused: (names: string) => `Não consegui ler a duração ou a energia de: ${names}.`,
    spent: (cost: string) => `Esta leitura custou ${cost}.`,
    apply: 'Usar estes valores',
    discard: 'Descartar',
    applied: 'Pus os valores no formulário. Revê-os e carrega em Guardar.',
  },
  equipment: {
    title: 'Equipamentos',
    intro:
      'Opcional. Ajuda a app a reconhecer os aparelhos nas medições: o nome, a divisão e a potência da chapa já chegam.',
    listTitle: 'Os teus equipamentos',
    empty:
      'Ainda não registaste nenhum equipamento. Começa pelos que mais gastam: máquinas, forno, aquecedores.',
    add: 'Registar um equipamento',
    newTitle: 'Novo equipamento',
    edit: 'Editar',
    save: 'Guardar',
    cancel: 'Cancelar',
    remove: 'Apagar equipamento',
    confirmRemove: (name: string) =>
      `Apagar "${name}"? Os aparelhos ligados continuam a ser reconhecidos, com o mesmo nome.`,
    failed: 'Não foi possível guardar. Tenta outra vez.',
    nameTaken: 'Já tens um equipamento com esse nome.',
    tooMany: (max: number) => `Já tens ${max} equipamentos, o máximo do registo.`,
    fields: {
      name: 'Nome',
      namePlaceholder: 'Máquina da roupa',
      kind: 'Tipo',
      noKind: 'Sem tipo',
      brand: 'Marca',
      model: 'Modelo',
      room: 'Divisão',
      roomPlaceholder: 'Cozinha',
      ratedPower: 'Potência da chapa (W)',
      ratedPowerHint:
        'A da etiqueta na parte de trás ou no manual. É um máximo: a medida costuma ficar abaixo.',
      energyClass: 'Classe energética',
      noClass: 'Sem classe',
      notes: 'Notas',
    },
    kinds: {
      washer: 'Máquina de lavar roupa',
      dishwasher: 'Máquina de lavar loiça',
      dryer: 'Máquina de secar',
      fridge: 'Frigorífico',
      freezer: 'Arca congeladora',
      oven: 'Forno',
      hob: 'Placa ou fogão',
      microwave: 'Micro-ondas',
      airfryer: 'Airfryer',
      kettle: 'Chaleira',
      coffee: 'Máquina de café',
      heater: 'Aquecedor',
      air_conditioner: 'Ar condicionado',
      water_heater: 'Termoacumulador',
      ev_charger: 'Carregador de carro',
      tv: 'Televisão',
      computer: 'Computador',
      other: 'Outro',
    } satisfies Record<EquipmentKind, string>,
    programmes: {
      title: 'Programas do manual',
      intro:
        'A tabela do manual com a duração e a energia de cada programa. A app diz qual foi o programa provável de cada lavagem e compara a energia com a do manual.',
      name: 'Programa',
      duration: 'Duração (h:mm)',
      energy: 'Energia (kWh)',
      temperature: '°C',
      load: 'kg',
      add: 'Acrescentar programa',
      remove: 'Tirar',
      invalid:
        'Cada programa precisa de nome, duração em h:mm (1:21) e energia em kWh (0,458); a temperatura em graus inteiros e a carga em kg de meio em meio (4,5).',
    },
    linked: {
      title: 'Aparelhos reconhecidos',
      intro:
        'Os aparelhos que a app reconhece nas medições e são este equipamento. Ligados, passam a ter o nome dele; os níveis (um botão ou dois) distinguem-se pela potência.',
      none: 'Nenhum aparelho reconhecido ligado.',
      choose: 'Ligar aparelhos reconhecidos',
      sameName: 'mesmo nome',
      overPlate: 'acima da chapa',
      link: 'Ligar',
      noneToLink: 'Não há aparelhos reconhecidos por ligar. Dá-lhes nome em Consumo › Aparelhos.',
      noShelly: 'Com um Shelly no quadro, a app reconhece os aparelhos e liga-os aos equipamentos.',
    },
    summary: (parts: string[]) => parts.join(' · '),
    difference: (pct: number) =>
      pct === 0
        ? 'o mesmo que o manual'
        : pct > 0
          ? `mais ${pct} % do que o manual`
          : `menos ${-pct} % do que o manual`,
    uses: {
      title: 'Últimos usos',
      intro: (days: number) =>
        `Os programas inteiros dos últimos ${days} dias já analisados, com o programa provável e a energia comparada com a do manual.`,
      none: 'Ainda não há programas inteiros reconhecidos deste equipamento.',
      noProgrammes: 'Escreve os programas do manual para a app dizer qual foi cada um.',
      average: (difference: string) => `Em média, ${difference}.`,
      caveat:
        'O manual mede em condições de ensaio: a carga e a temperatura da água mudam o consumo.',
      loading: 'A procurar os usos…',
      failed: 'Não foi possível ler os dias guardados. Tenta mais tarde.',
    },
    settingsTitle: 'Equipamentos da casa',
    settingsText:
      'O registo dos equipamentos que tens em casa, opcional. Ajuda a reconhecer os aparelhos nas medições.',
    settingsLink: 'Ver os equipamentos',
  },
} as const;
