// SPDX-License-Identifier: AGPL-3.0-or-later
/** Every text the user sees, in European Portuguese (post-1990 agreement, "tu"). */
const minutes = (count: number) => `${count} ${count === 1 ? 'minuto' : 'minutos'}`;

export const t = {
  appName: 'Wattómetro',
  tagline: 'O consumo elétrico da casa transformado em poupança concreta.',
  loading: 'A carregar…',
  signOut: 'Sair',
  signOutLabel: 'Sair: terminar a sessão neste dispositivo',
  nav: {
    home: 'Início',
    power: 'Potência',
    quality: 'Qualidade',
    settings: 'Definições',
  },
  errors: {
    locked: (count: number) => `Demasiadas tentativas. Tenta outra vez daqui a ${minutes(count)}.`,
    unavailable: 'Não foi possível contactar o servidor. Tenta outra vez.',
  },
  login: {
    title: 'Entrar',
    email: 'Email',
    password: 'Password',
    submit: 'Entrar',
    submitting: 'A entrar…',
    invalid: 'Email ou password errados.',
    noAccount: 'As contas são criadas pelo responsável da instalação.',
  },
  now: {
    noDevices: 'Ainda não tens nenhum Shelly ligado.',
    addDevice: 'Adicionar em Definições → Dispositivos',
    channel: (channel: number) => `canal ${channel + 1}`,
    power: 'Potência',
    minuteAt: (time: string) => `média do minuto das ${time}`,
    noReadings: 'Ainda sem medições.',
    neverSeen: 'Este Shelly ainda não enviou dados.',
    stale: (count: number) => `Sem dados há ${minutes(count)}.`,
    voltage: 'Tensão',
    voltageRange: (min: string, max: string) => `${min} a ${max}`,
    today: 'Hoje',
    todayMinutes: (count: number) => `${minutes(count)} com dados`,
    peak: 'Pico de hoje',
    peakHint: 'maior valor de um segundo',
    nothing: '—',
    cost: 'Custo hoje',
    costParts: (energy: string, power: string, taxes: string) =>
      `energia ${energy} · potência ${power} · taxas ${taxes}`,
    costNote: 'Estimativa com IVA, com o teu tarifário.',
    noTariff: 'Para veres quanto custa, indica o teu tarifário em Definições.',
    databaseNear: (used: number, limit: number) =>
      `A base de dados está a ${used} MB de ${limit} MB. É preciso libertar espaço em breve.`,
  },
  home: {
    status: 'Em construção',
    intro:
      'O Wattómetro vai ler o consumo do teu quadro elétrico (Shelly) e os dados da E-Redes para te dizer, em euros, onde podes poupar.',
    comingTitle: 'O que vem aí',
    coming: [
      'A potência contratada certa para a tua casa',
      'O tarifário mais barato para o teu consumo real',
      'Quanto te custa o consumo fantasma',
      'A fatura prevista do mês',
    ],
  },
  settings: {
    title: 'Definições',
    account: {
      title: 'Conta',
      signedInAs: (email: string) => `Entraste como ${email}.`,
      sessionNote:
        'A sessão mantém-se enquanto usares a app; termina ao fim de 30 dias sem a abrires.',
      logout: 'Sair',
    },
    household: {
      title: 'Casa',
      name: 'Nome da casa',
      save: 'Guardar',
      saving: 'A guardar…',
      saved: 'Nome guardado.',
      invalid: 'Escreve um nome com 1 a 60 caracteres.',
    },
    devices: {
      title: 'Dispositivos',
      intro: 'O Shelly do quadro envia as medições para aqui. Cada Shelly tem o seu token.',
      none: 'Ainda não há dispositivos.',
      lastSeen: (when: string) => `Último envio: ${when}`,
      neverSeen: 'Ainda não enviou dados.',
      details: (model: string, script: string) => `${model} · script ${script}`,
      remove: 'Remover',
      removeConfirm: (name: string) =>
        `Remover "${name}"? O token deixa de funcionar e o Shelly deixa de conseguir enviar dados. As medições já guardadas ficam.`,
      name: 'Nome do dispositivo',
      namePlaceholder: 'Quadro',
      add: 'Adicionar dispositivo',
      adding: 'A adicionar…',
      invalid: 'Escreve um nome com 1 a 60 caracteres.',
      createdTitle: (name: string) => `"${name}" adicionado`,
      createdWarning: 'Copia o token agora: por segurança, não volta a aparecer.',
      url: 'Endereço',
      token: 'Token',
      copy: 'Copiar',
      copied: 'Copiado',
      instructions: 'Instruções de instalação no Shelly',
      done: 'Já copiei',
    },
    tariff: {
      title: 'Tarifário',
      intro:
        'Copia os valores da tua fatura de eletricidade. Os preços são sem IVA, como aparecem no detalhe da fatura; a app calcula o IVA.',
      current: (date: string) => `Em vigor desde ${date}`,
      history: 'Tarifários anteriores',
      summary: (option: string, power: string) => `${option}, ${power}`,
      remove: 'Remover',
      removeConfirm: (date: string) => `Remover o tarifário em vigor desde ${date}?`,
      none: 'Ainda não indicaste o teu tarifário.',
      newTitle: 'Novo tarifário ou mudança de preços',
      editHint:
        'Para corrigir o tarifário atual, guarda com a mesma data de início; com outra data, fica um novo a partir desse dia.',
      validFrom: 'Em vigor desde',
      supplier: 'Comercializador (opcional)',
      power: 'Potência contratada',
      option: 'Opção horária',
      options: { simple: 'Simples', bi: 'Bi-horária', tri: 'Tri-horária' },
      cycle: 'Ciclo',
      cycles: { daily: 'Diário', weekly: 'Semanal' },
      cycleHint: 'Está na fatura ou no contrato. Na dúvida, é quase sempre o diário.',
      periodsMap: 'Horários dos períodos',
      periodsMaps: { 'pre-2027': 'Atuais', '2027': 'Novos (2027)' },
      periodsMapHint:
        'A ERSE muda os horários dos períodos: a E-Redes atualiza o contador entre julho e dezembro de 2027 e avisa-te da data.',
      fixedPerDay: 'Termo de potência (€/dia)',
      energy: 'Preço da energia (€/kWh)',
      periods: {
        simple: 'Energia',
        offEmpty: 'Fora de vazio',
        empty: 'Vazio',
        full: 'Cheias',
        peak: 'Ponta',
      },
      taxesTitle: 'Taxas da fatura',
      taxesHint: 'Opcionais: deixa 0 se não as encontrares na fatura.',
      iec: 'Imposto especial de consumo — IEC (€/kWh)',
      cav: 'Contribuição audiovisual (€/mês)',
      dgeg: 'Taxa de exploração DGEG (€/mês)',
      largeFamily: 'Família numerosa (IVA a 6 % até 300 kWh por 30 dias, em vez de 200 kWh)',
      lowPowerNote:
        'Até 3,45 kVA, parte do termo de potência tem IVA a 6 %, mas a fatura não a separa: a estimativa fica ligeiramente acima.',
      save: 'Guardar tarifário',
      saving: 'A guardar…',
      saved: 'Tarifário guardado.',
      invalid: 'Verifica os valores: usa vírgula decimal, até 6 casas decimais.',
      invalidField: (field: string) =>
        `Valor inválido em "${field}": usa vírgula decimal, até 6 casas decimais.`,
    },
    password: {
      title: 'Mudar a password',
      current: 'Password atual',
      next: (min: number) => `Nova password (mín. ${min} caracteres)`,
      repeat: 'Repete a nova password',
      submit: 'Mudar a password',
      submitting: 'A mudar…',
      done: 'Password mudada. As sessões noutros dispositivos terminaram.',
      wrong: 'A password atual está errada.',
      tooShort: (min: number) => `A nova password tem de ter pelo menos ${min} caracteres.`,
      mismatch: 'As novas passwords não coincidem.',
    },
  },
  power: {
    title: 'Potência contratada',
    intro:
      'Qual o escalão mais baixo que não teria cortado a luz nos últimos 90 dias, simulando o contador inteligente da E-Redes segundo a segundo com os dados do teu Shelly.',
    meter: 'Contador',
    margin: 'Margem de segurança (%)',
    marginHint:
      'Baixa cada escalão nesta percentagem antes de simular, para cobrir cargas que ainda não apareceram e contadores configurados de outra forma.',
    current: (kva: string) => `Potência atual: ${kva}`,
    noTariff:
      'Indica o teu tarifário em Definições para comparar com a potência atual e calcular a poupança.',
    computing: 'A simular…',
    recommended: 'Escalão recomendado',
    recommendedValue: (kva: string) => `${kva}`,
    tooHigh: 'Os picos ultrapassam o escalão mais alto em baixa tensão normal (41,4 kVA).',
    same: 'A tua potência contratada é a mais baixa que não teria cortado.',
    lower: 'Podes baixar a potência contratada sem que o contador tivesse cortado nestes 90 dias.',
    higher:
      'Com a potência atual o contador teria cortado nestes 90 dias (ou já cortou). Considera subir.',
    savingTitle: 'Poupança estimada',
    saving: (euros: string) => `${euros} por ano`,
    savingHint: 'Só o termo de potência, com IVA, durante 365 dias.',
    priceFrom: (offer: string, supplier: string) =>
      `Preço a usar no escalão recomendado tirado da oferta “${offer}” (${supplier}) do simulador da ERSE, que tem o mesmo termo de potência que o teu contrato.`,
    priceLabel: (kva: string) => `Termo de potência a ${kva} (€/dia, sem IVA)`,
    priceMissing:
      'Não encontrei nas ofertas da ERSE o teu preço atual. Escreve o preço do escalão recomendado (vê no site do teu comercializador) para calcular a poupança.',
    vatNote:
      'Ao passar a 6,9 kVA ou menos, os primeiros 200 kWh por mês (300 em família numerosa) passam a ter IVA a 6 %: uma poupança extra, não incluída.',
    tiersTitle: 'Escalões simulados',
    tierColumns: { tier: 'Escalão', result: 'Resultado' },
    clear: 'nunca chega ao limite de corte',
    safe: (pct: number, when: string) =>
      `passa o limite mas não corta (no máximo ${pct} % do tempo de corte, em ${when})`,
    trips: (count: number, when: string, kva: string) =>
      `cortaria ${count} ${count === 1 ? 'vez' : 'vezes'} (a 1.ª em ${when}, a ${kva})`,
    unknown: 'demasiados minutos acima do limite para verificar',
    estimated: (count: number) =>
      `${count} ${count === 1 ? 'minuto sem' : 'minutos sem'} valores ao segundo: contado com o pico do minuto durante o minuto inteiro.`,
    topTitle: 'Momentos com maior potência',
    topColumns: { when: 'Quarto de hora', peak: 'Pico de 1 s', share: 'Da potência atual' },
    topEstimatedMark: '*',
    topEstimated:
      '* potência ativa (W): esse minuto chegou sem valores ao segundo; a aparente é igual ou maior.',
    noShelly: 'Ainda não há dados do Shelly neste período.',
    eredesOnly: (kw: string) =>
      `Só há dados da E-Redes: médias de 15 minutos, que escondem os picos curtos que fazem o contador cortar. A maior média foi ${kw}. Não é possível recomendar uma potência só com estes dados.`,
    caveats: [
      'Curva de corte da especificação do contador inteligente da E-Redes (DEF-C44-506/N, anexo B1), com os valores por omissão: só corta acima de 1,2 × a potência contratada, e mais depressa quanto maior o excesso. A E-Redes pode configurar outros valores; a margem cobre essa diferença.',
      'Monofásico. Em instalações trifásicas o contador usa 1,3 × e controla também cada fase: ainda não é simulado.',
      'Só vê o que aconteceu nestes 90 dias: um inverno frio ou um aparelho novo podem pedir mais potência.',
    ],
  },
  quality: {
    title: 'Qualidade da energia',
    intro:
      'Falhas de energia e tensão medidas pelo teu Shelly, comparadas com os limites do Regulamento da Qualidade de Serviço da ERSE e da norma NP EN 50160.',
    reportTitle: 'Registo de qualidade da energia elétrica',
    reportHousehold: (name: string) => `Instalação: ${name}`,
    reportPeriod: (from: string, to: string) => `Tensão: de ${from} a ${to}`,
    reportGenerated: (when: string) => `Gerado pelo Wattómetro em ${when}`,
    print: 'Imprimir ou guardar em PDF',
    printHint:
      'O relatório tem só factos medidos (datas, horas, valores) e as fontes dos limites. Podes anexá-lo a uma reclamação à E-Redes.',
    zone: {
      title: 'Zona de qualidade de serviço',
      label: 'Zona',
      none: 'Escolhe a zona',
      options: {
        A: 'A — capital de distrito ou localidade com mais de 25 000 clientes',
        B: 'B — localidade com 2 500 a 25 000 clientes',
        C: 'C — outras localidades',
      },
      hint: 'Define o número e a duração de falhas longas que a E-Redes tem de cumprir por ano. A zona depende da localidade (RQS, art. 14.º); em caso de dúvida, pergunta à E-Redes.',
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
      compensation:
        'Quando o padrão não é cumprido, a compensação é automática (RQS, art. 24.º): não precisas de a pedir.',
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
        outside: 'Fora de ± 10 %',
        result: 'Resultado',
      },
      evaluated: (count: number, expected: number) => `${count} de ${expected}`,
      excluded: (count: number) =>
        `${count} ${count === 1 ? 'excluído' : 'excluídos'} por falha de energia`,
      meets: 'cumpre',
      failsBand: 'mais de 5 % fora de ± 10 %',
      failsLimits: 'valores fora de − 15 % / + 10 %',
      episodesTitle: 'Episódios fora de ± 10 % (valores de cada minuto)',
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
    sourcesTitle: 'Fontes',
    sources: [
      'ERSE, Regulamento da Qualidade de Serviço (Regulamento n.º 826/2023, versão consolidada de 2026): art. 2.º, 12.º, 14.º, 24.º, 25.º, 66.º e Anexo I.',
      'NP EN 50160, características da tensão de alimentação em baixa tensão, conforme reproduzida pela ERSE (Formação ACE, 2021).',
      'Consultado em 22/10/2026. Pormenores em docs/voltage.md no código do Wattómetro.',
    ],
  },
  server: {
    checking: 'A verificar o servidor…',
    ok: 'Servidor ligado',
    unavailable: 'Servidor indisponível',
    banner:
      'Sem ligação ao servidor: os valores podem estar desatualizados. A app tenta outra vez sozinha.',
  },
  install: {
    title: 'Aplicação',
    intro:
      'Instala o Wattómetro no telemóvel ou no computador: abre pelo ícone, em ecrã inteiro, como uma app.',
    button: 'Instalar app',
    installed: 'O Wattómetro está instalado neste dispositivo.',
    installedPhone:
      'O Wattómetro já está instalado neste telemóvel: abre-o pelo ícone no ecrã principal. Também podes continuar aqui no browser.',
    installedComputer:
      'O Wattómetro já está instalado neste computador: abre-o pelo ícone, ou pelo botão “Abrir na app” que o Chrome e o Edge mostram à direita da barra de endereço.',
    steps: {
      ios: [
        'Abre esta página no Safari.',
        'Toca no botão Partilhar (o quadrado com a seta para cima).',
        'Escolhe “Adicionar ao ecrã principal” e confirma.',
      ],
      'safari-mac': [
        'No Safari, abre o menu Ficheiro (ou o botão Partilhar).',
        'Escolhe “Adicionar à Dock” e confirma.',
      ],
      'firefox-android': [
        'Abre o menu do Firefox (⋮).',
        'Escolhe “Instalar” ou “Adicionar ao ecrã principal” e confirma.',
      ],
      'firefox-desktop': [
        'O Firefox para computador não instala apps web.',
        'Para instalar, abre esta página no Chrome ou no Edge. Também podes usar a app aqui no Firefox: funciona igual, só não tem ícone próprio.',
      ],
      samsung: [
        'Abre o menu do Samsung Internet (☰).',
        'Escolhe “Adicionar página a” → “Ecrã principal” e confirma.',
      ],
      chromium: [
        'No Chrome ou Edge: abre o menu do browser (⋮).',
        'Escolhe “Instalar app” ou “Adicionar ao ecrã principal”.',
        'Se o browser só oferecer “Criar atalho”, atualiza o Chrome e os Serviços do Google Play e tenta de novo; o atalho também funciona.',
      ],
    },
  },
  feedback: {
    footer: 'Sugestões e problemas',
    subject: 'Sugestão ou problema',
    bodyStart: 'Escreve aqui a tua mensagem.',
    technical: '— Informação técnica (podes apagar) —',
    version: (commit: string) => `Versão: ${commit}`,
    page: (page: string) => `Página: ${page}`,
  },
  legal: {
    copyright: '© 2026 Paulo Barbosa',
    license: 'Código aberto, licença AGPL-3.0',
    source: 'Código no GitHub',
    version: (commit: string) => `Versão ${commit}`,
  },
} as const;
