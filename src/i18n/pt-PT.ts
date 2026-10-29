// SPDX-License-Identifier: AGPL-3.0-or-later
/** Every text the user sees, in European Portuguese (post-1990 agreement, "tu"). */
/** The voltage band of a complaint letter, already formatted ("207 V"). */
interface Band {
  low: string;
  high: string;
  floor: string;
}

const minutes = (count: number) => `${count} ${count === 1 ? 'minuto' : 'minutos'}`;
/** Monday first, as weekdayOf (src/domain/consumption.ts). */
const WEEKDAYS_PLURAL = [
  'segundas-feiras',
  'terças-feiras',
  'quartas-feiras',
  'quintas-feiras',
  'sextas-feiras',
  'sábados',
  'domingos',
];

export const t = {
  appName: 'Wattómetro',
  loading: 'A carregar…',
  howItWorks: 'Como é calculado',
  infoLabel: 'Onde encontrar este valor',
  moreInfoLabel: 'Mais informação',
  signOut: 'Sair',
  navToggle: {
    collapse: 'Recolher menu',
    expand: 'Expandir menu',
  },
  signOutLabel: 'Sair: terminar a sessão neste dispositivo',
  nav: {
    home: 'Início',
    power: 'Potência',
    consumption: 'Consumo',
    tariffs: 'Tarifários',
    quality: 'Qualidade',
    ask: 'Perguntar',
    settings: 'Definições',
  },
  errors: {
    locked: (count: number) => `Demasiadas tentativas. Tenta outra vez daqui a ${minutes(count)}.`,
    unavailable: 'Não foi possível contactar o servidor. Tenta outra vez.',
  },
  landing: {
    title: 'Onde a tua casa pode gastar menos, em euros',
    lead: 'O Wattómetro lê o consumo elétrico da tua casa, de um Shelly no quadro elétrico ou do ficheiro da E-Redes, e transforma-o em conclusões concretas: a potência contratada certa, o tarifário mais barato para o teu consumo, o custo do que fica sempre ligado e a fatura do mês.',
    signIn: 'Entrar',
    howItWorksLink: 'Como funciona',
    back: '← Voltar',
    day: {
      title: 'Um dia de consumo de uma casa',
      label:
        'Gráfico ilustrativo da potência ao longo de um dia: consumo base de noite, um pico ao jantar abaixo da potência contratada, a máquina de lavar de manhã e as horas de vazio.',
      contracted: 'Potência contratada',
      peak: 'Pico',
      base: 'Consumo base',
      wash: 'Máquina de lavar',
      offPeak: 'Vazio',
      caption:
        'Ilustração. Com os dados da tua casa, a app diz se a potência contratada pode baixar, quanto custa o consumo base e quanto poupas a mudar as máquinas para o vazio.',
    },
    features: {
      title: 'O que faz por ti',
      items: [
        {
          title: 'Potência contratada certa',
          body: 'Pelos picos medidos ao segundo, diz se podes baixar a potência sem o contador disparar, e quanto poupas por ano.',
        },
        {
          title: 'Tarifário mais barato',
          body: 'Compara as ofertas publicadas pela ERSE com o consumo real da tua casa, a cada 15 minutos, e não com um perfil médio.',
        },
        {
          title: 'Consumo fantasma',
          body: 'Mede o que fica ligado de noite e quanto custa por ano.',
        },
        {
          title: 'Fatura do mês',
          body: 'Prevê quanto vais pagar no fim do mês, a partir do que já gastaste.',
        },
        {
          title: 'Aparelhos',
          body: 'Reconhece os aparelhos pelo consumo e avisa quando um começa a gastar mais do que costumava.',
        },
        {
          title: 'Qualidade da energia',
          body: 'Regista as falhas de luz e a tensão fora dos limites da norma, para poderes reclamar com dados.',
        },
      ],
    },
    sources: {
      title: 'De onde vêm os dados',
      items: [
        {
          title: 'Um Shelly no quadro elétrico',
          body: 'Envia o consumo minuto a minuto, com os valores ao segundo. É a fonte mais completa: vê os picos de potência, a tensão e os aparelhos.',
        },
        {
          title: 'O ficheiro da E-Redes',
          body: 'Sem instalar nada: descarregas do Balcão Digital da E-Redes o consumo a cada 15 minutos e carregas o ficheiro na app.',
        },
      ],
    },
    privacy: {
      title: 'Os teus dados ficam contigo',
      items: [
        'As medições ficam num servidor na União Europeia, sem publicidade nem estatísticas de terceiros.',
        'Os cálculos são feitos no teu browser; o servidor só guarda e resume as medições.',
        'A inteligência artificial é opcional, usa a tua própria chave e só recebe resultados já calculados, nunca as medições.',
        'O código é aberto: podes ver tudo o que a app faz.',
      ],
    },
    steps: {
      title: 'Como funciona',
      items: [
        {
          title: 'Liga os dados',
          body: 'Instala o script no Shelly ou carrega o ficheiro da E-Redes.',
        },
        {
          title: 'Indica o teu contrato',
          body: 'A potência contratada e o tarifário que tens hoje, para as contas saírem em euros.',
        },
        {
          title: 'Vê onde poupar',
          body: 'O Início mostra as conclusões em euros por ano e o que fazer em cada caso.',
        },
      ],
    },
  },
  login: {
    title: 'Entrar',
    email: 'Email',
    password: 'Palavra-passe',
    submit: 'Entrar',
    submitting: 'A entrar…',
    invalid: 'Email ou palavra-passe errados.',
    noAccount: 'As contas são criadas pelo responsável da instalação.',
  },
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
  /** Web Push alerts (server/src/alerts.ts composes them; Definições → Avisos sets them). */
  alerts: {
    staleTitle: 'O Shelly deixou de enviar',
    staleBody: (device: string, time: string) =>
      `Sem medições de «${device}» desde as ${time}. O Shelly guarda os minutos até 10 dias: quando voltar a enviar, são recuperados.`,
    backTitle: 'O Shelly voltou a enviar',
    backBody: (device: string, time: string) =>
      `«${device}» voltou a enviar às ${time}. Os minutos em falta vêm do registo do próprio Shelly.`,
    powerTitle: 'Potência perto do corte',
    powerBody: (time: string, peak: string, factor: string, contracted: string) =>
      `Às ${time} chegaste a ${peak}, acima de ${factor} × a potência contratada (${contracted}): o contador começou a contar para cortar a luz.`,
    databaseTitle: 'Base de dados perto do limite diário',
    databaseBody: (percent: number, resetsAt: string) =>
      `Hoje já se leram ${percent} % das linhas que o plano gratuito da Cloudflare permite por dia. Aos 100 %, a app deixa de gravar até às ${resetsAt}.`,
    cheapTitle: 'Amanhã: as horas mais baratas',
    cheapBody: (
      from: string,
      to: string,
      price: string,
      dearFrom: string,
      dearTo: string,
      dearPrice: string,
    ) =>
      `Das ${from} às ${to}, a energia no mercado custa em média ${price}. As mais caras: das ${dearFrom} às ${dearTo} (${dearPrice}). Só muda a fatura num tarifário com preço à hora.`,
    eredesTitle: 'Importar os consumos da E-Redes',
    eredesBody: (last: string) =>
      `O último dia importado é ${last}. Exporta o ficheiro no Balcão Digital da E-Redes e importa-o em Definições: os tarifários e a previsão passam a usar o teu consumo mais recente.`,
    reviewTitle: 'Rever o tarifário',
    reviewBody:
      'Passou meio ano: vê em Tarifários se o teu contrato continua a ser o mais barato para o teu consumo. As ofertas mudam ao longo do ano.',
    budgetTitle: 'Orçamento do mês',
    budgetBody: (budget: string) =>
      `Ao ritmo deste mês, a fatura deve passar o teu orçamento de ${budget}. Vê a previsão em Consumo.`,
    testTitle: 'Aviso de teste',
    testBody: 'Os avisos do Wattómetro chegam a este aparelho.',
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
  settings: {
    tocLabel: 'Secções das definições',
    groups: [
      ['tarifario', 'Tarifário'],
      ['dados', 'Dados e Shelly'],
      ['avisos', 'Avisos'],
      ['ia', 'IA'],
      ['casa', 'Casa'],
      ['conta', 'Conta e aspeto'],
    ] as const,
    /** Only for administrators (ADMIN_EMAILS). */
    adminGroup: ['servidor', 'Servidor'] as const,
    admin: {
      title: 'Utilização do servidor (administrador)',
      intro:
        'Totais do servidor e da base de dados, para veres se a app está perto dos limites do plano gratuito da Cloudflare. Só os administradores veem esta parte.',
      loading: 'A obter os números do servidor…',
      failed: 'Não foi possível obter os números do servidor.',
      rowsRead: 'Linhas lidas hoje',
      rowsWritten: 'Linhas escritas hoje',
      ofLimit: (used: string, limit: string, pct: string) => `${used} de ${limit} (${pct} %)`,
      resets:
        'Voltam a zero à meia-noite UTC. Aos 100 %, a app deixa de ler (ou de gravar) até lá.',
      database: 'Base de dados',
      databaseUnknown: 'Ainda não medida (o Cron mede-a uma vez por dia).',
      lastDays: 'Últimos 7 dias (UTC)',
      columns: { day: 'Dia', read: 'Lidas', written: 'Escritas' },
      cron: 'Agregações (Cron)',
      rolledUp: (ago: string) => `Agregou os minutos até há ${ago}.`,
      rolledUpNever: 'Ainda não agregou nada.',
      late: 'Atrasado: o Cron corre de 5 em 5 minutos.',
      purged: (ago: string) => `Última limpeza dos dados antigos há ${ago}.`,
      purgedNever: 'Ainda não fez a limpeza diária.',
      shelly: 'Shelly',
      shellyLine: (index: number, model: string, script: string) =>
        `Shelly ${index} · ${model} · script ${script}`,
      unknown: '?',
      lastSeen: (ago: string) => `Última mensagem há ${ago}.`,
      neverSeen: 'Ainda não enviou dados.',
      minutesToday: (got: number, expected: number, pct: number) =>
        `Hoje: ${got} de ${expected} minutos (${pct} %).`,
      noDevices: 'Nenhum Shelly ligado.',
      accounts: 'Contas',
      accountsLine: (users: number, households: number, push: number) =>
        `${users} ${users === 1 ? 'utilizador' : 'utilizadores'} · ${households} ${households === 1 ? 'casa' : 'casas'} · ${push} ${push === 1 ? 'aparelho' : 'aparelhos'} com avisos`,
      visits: (days: number) => `Visitas às páginas (${days} dias)`,
      visitsNote:
        'Só se conta a página e o dia: nem quem, nem a casa, nem o endereço, nem a hora. Guardadas 90 dias na base de dados da app, na UE.',
      noVisits: 'Ainda sem visitas contadas.',
      visitColumns: { page: 'Página', today: 'Hoje', total: 'Total' },
      pages: {
        '/': 'Início',
        '/consumo': 'Consumo',
        '/consumo/relatorio': 'Consumo › Relatório',
        '/consumo/aparelhos': 'Consumo › Aparelhos',
        '/consumo/calibrar': 'Consumo › Calibrar',
        '/potencia': 'Potência',
        '/tarifarios': 'Tarifários',
        '/qualidade': 'Qualidade',
        '/definicoes': 'Definições',
      } as Record<string, string>,
    },
    alerts: {
      title: 'Avisos',
      intro:
        'Notificações neste aparelho, mesmo com a app fechada. O servidor verifica a cada 5 minutos.',
      turnOn: 'Ativar avisos neste aparelho',
      turnOff: 'Desativar neste aparelho',
      turnedOn: 'Avisos ativos neste aparelho.',
      turnedOff: 'Avisos desativados neste aparelho.',
      which: 'Avisar quando:',
      kinds: {
        stale: 'O Shelly deixa de enviar',
        power: 'A potência se aproxima do corte',
        database: 'A base de dados se aproxima do limite diário',
        cheapHours: 'Saem as horas mais baratas de amanhã',
        eredesImport: 'É altura de importar os consumos da E-Redes',
        tariffReview: 'É altura de rever o tarifário',
        budget: 'O mês vai passar o orçamento',
      },
      kindNotes: {
        stale: 'Ao fim de 15 minutos sem medições, e outra vez quando voltar.',
        power:
          'Quando passa de 1,2 × a potência contratada: o contador começa a contar para cortar a luz. No máximo um por hora.',
        database:
          'Aos 80 % das leituras que o plano gratuito permite por dia. Aos 100 %, a app deixa de gravar até à meia-noite (UTC).',
        cheapHours:
          'Por volta das 12:00, quando o mercado (OMIE) publica os preços de amanhã. Só muda a fatura num tarifário com preço à hora.',
        eredesImport:
          'Quando o último dia importado tem mais de um mês. No máximo uma vez por mês.',
        tariffReview: 'Em janeiro e em julho, para comparares o teu contrato com as ofertas.',
        budget:
          'Quando, a partir do dia 7, o ritmo do mês passa o orçamento. Define-o em Consumo › Previsão. Uma vez por mês.',
      },
      saved: 'Escolha guardada.',
      test: 'Enviar aviso de teste',
      testSent: 'Aviso de teste enviado: deve aparecer dentro de segundos.',
      testFailed: 'O serviço de notificações recusou o aviso. Desativa e volta a ativar os avisos.',
      denied:
        'O browser não deu autorização para notificações. Permite-as nas definições do browser para este site e tenta outra vez.',
      failed: 'Não foi possível ativar os avisos. Tenta outra vez.',
      notConfigured: 'O servidor ainda não tem os avisos ativos.',
      needsInstall:
        'No iPhone e no iPad, os avisos só funcionam com a app instalada no ecrã principal (Partilhar → Adicionar ao ecrã principal). Abre-a por aí e volta a esta página.',
      unsupported:
        'Este browser não permite avisos. No telemóvel, usa o Chrome ou a app instalada.',
      privacy:
        'Os avisos passam pelo serviço de notificações do browser (Google, Apple ou Mozilla), cifrados: só este aparelho os lê. Nunca levam medições.',
    },
    ai: {
      title: 'Inteligência artificial',
      intro:
        'Opcional: com uma chave da API da Anthropic tua, podes fazer perguntas sobre o teu consumo e pedir explicações em linguagem simples. Os números vêm sempre da app; a IA só os explica. Tudo funciona sem ela.',
      key: 'Chave da API da Anthropic',
      model: 'Modelo',
      modelOption: (label: string, id: string) =>
        id === 'claude-sonnet-5-5'
          ? `${label} (recomendado)`
          : id === 'claude-haiku-5-5'
            ? `${label} (mais barato)`
            : `${label} (mais caro)`,
      autoSend: 'Enviar sem mostrar primeiro o custo estimado',
      keyNote:
        'A chave fica guardada na tua conta, cifrada, e aparece nos outros aparelhos onde entrares. O que perguntas vai diretamente deste browser para a Anthropic, com resumos já calculados (nunca as medições ao minuto). O custo é cobrado pela Anthropic na tua conta.',
      showKey: 'Mostrar a chave',
      hideKey: 'Esconder a chave',
      inAccount: 'Guardada na tua conta: disponível em todos os teus aparelhos.',
      inBrowser: 'Guardada só neste browser: o servidor não a pôde guardar agora.',
      save: 'Guardar',
      test: 'Testar',
      working: 'A testar a chave…',
      works: 'A chave funciona.',
      saved: 'Chave testada e guardada na tua conta.',
      savedHere: 'Chave testada e guardada só neste browser (o servidor não a pôde guardar agora).',
      forget: 'Apagar',
      forgetConfirm:
        'Apagar a chave da IA da tua conta? Deixa de funcionar em todos os teus aparelhos.',
      forgetFailed: 'Não foi possível apagar a chave.',
      forgotten: 'A chave foi apagada da tua conta e deste browser.',
      spent: (cost: string, requests: number) =>
        `Este mês: ${requests} ${requests === 1 ? 'pedido' : 'pedidos'}, cerca de ${cost} (estimativa a preços de tabela).`,
    },
    title: 'Definições',
    account: {
      title: 'Conta',
      signedInAs: (email: string) => `Entraste como ${email}.`,
      sessionNote:
        'A sessão mantém-se enquanto usares a app; termina ao fim de 30 dias sem a abrires.',
      logout: 'Sair',
    },
    theme: {
      title: 'Aspeto',
      intro: 'Claro, escuro ou como o resto do aparelho. Fica guardado só neste aparelho.',
      options: { auto: 'Automático', light: 'Claro', dark: 'Escuro' },
    },
    household: {
      title: 'Casa',
      name: 'Nome da casa',
      save: 'Guardar',
      saving: 'A guardar…',
      saved: 'Nome guardado.',
      invalid: 'Escreve um nome com 1 a 60 caracteres.',
    },
    location: {
      title: 'Localidade',
      intro:
        'Para a previsão da fatura ter em conta a temperatura. Indica só a localidade, nunca a morada: a app pede a temperatura dessa zona (~1 km) à Open-Meteo.',
      current: (name: string) => `Localidade: ${name}`,
      none: 'Ainda não indicaste a localidade. A previsão da fatura funciona sem ela, mas sem ter em conta a temperatura.',
      query: 'Procurar localidade',
      placeholder: 'Ex.: Coimbra',
      search: 'Procurar',
      tooShort: (min: number) => `Escreve pelo menos ${min} letras.`,
      notFound: 'Não encontrei nenhuma localidade com esse nome em Portugal.',
      postalCode:
        'A pesquisa não aceita códigos postais: escreve o nome da localidade (por exemplo, Lavra), ou usa a localização do dispositivo.',
      searchFailed: 'Não foi possível procurar agora. Tenta mais tarde.',
      saved: (name: string) => `Localidade guardada: ${name}.`,
      cleared: 'Localidade removida.',
      clear: 'Remover localidade',
      invalid: 'Localidade inválida.',
      attribution: 'Dados meteorológicos e de localidades:',
      deviceIntro:
        'Ou usa a localização deste telemóvel ou computador, se estiver em casa. O browser pede-te autorização; depois confirmas antes de guardar. Só fica guardada com precisão de ~1 km.',
      device: 'Usar a minha localização',
      deviceName: 'Localização do dispositivo',
      deviceFailed: {
        unsupported: 'Este browser não indica a localização. Procura a localidade pelo nome.',
        denied:
          'Não deste autorização para a localização. Podes autorizá-la nas definições do browser, ou procurar a localidade pelo nome.',
        unavailable:
          'Não foi possível obter a localização agora. Tenta outra vez, ou procura a localidade pelo nome.',
      },
      confirmTitle: 'Confirmar a localização',
      confirmText: (lat: string, lon: string, accuracy: number) =>
        `O dispositivo está perto de ${lat}; ${lon} (precisão de ${accuracy} m; guarda-se arredondada a ~1 km).`,
      map: 'Ver no mapa',
      confirm: 'Guardar esta localização',
      cancel: 'Cancelar',
    },
    installation: {
      title: 'A tua instalação',
      intro:
        'Ajuda a app a interpretar o consumo: por exemplo, se o aquecimento não é elétrico, a previsão da fatura não usa a temperatura. Responde só ao que souberes.',
      heating: 'Aquecimento da casa',
      heatingHint: 'Podes marcar vários. Se não marcares nenhum, fica «Não sei».',
      heatingKinds: {
        'gas-boiler': 'Caldeira a gás (radiadores ou piso radiante de água)',
        'heat-pump': 'Bomba de calor ou ar condicionado',
        'electric-heaters': 'Aquecedores elétricos (a óleo, termoventiladores, acumuladores)',
        wood: 'Lenha ou pellets (lareira, salamandra, recuperador)',
        none: 'Nenhum',
      },
      waterHeating: 'Água quente',
      waterHeatingKinds: {
        gas: 'Caldeira ou esquentador a gás',
        electric: 'Termoacumulador elétrico',
        'heat-pump': 'Bomba de calor',
        solar: 'Solar térmico',
      },
      hob: 'Placa do fogão',
      hobKinds: { electric: 'Elétrica ou de indução', gas: 'A gás' },
      flags: {
        airConditioning: 'Ar condicionado para arrefecer',
        solarPanels: 'Painéis solares fotovoltaicos (produzem eletricidade)',
        electricCar: 'Carro elétrico carregado em casa',
      },
      unknown: 'Não sei',
      yes: 'Sim',
      no: 'Não',
      save: 'Guardar',
      saved: 'Instalação guardada.',
      invalid: 'Respostas inválidas.',
    },
    devices: {
      title: 'Dispositivos',
      intro: 'O Shelly do quadro envia as medições para aqui. Cada Shelly tem o seu token.',
      none: 'Ainda não há dispositivos.',
      lastSeen: (when: string) => `Último envio: ${when}`,
      neverSeen: 'Ainda não enviou dados.',
      details: (model: string, script: string) => `${model} · script ${script}`,
      rename: 'Mudar o nome',
      save: 'Guardar',
      cancel: 'Cancelar',
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
      expand: 'Mudar ou corrigir o tarifário',
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
      energyDiscount: 'Desconto na energia (%)',
      socialTitle: 'Tarifa social',
      socialHint:
        'Só se a fatura tiver "Desc. Social": copia os valores por kWh e por dia, sem o sinal menos. Sem tarifa social, deixa 0.',
      socialEnergy: 'Desconto social na energia (€/kWh)',
      socialPower: 'Desconto social na potência (€/dia)',
      socialFinancing: 'Financiamento da tarifa social (€/kWh)',
      taxesTitle: 'Taxas da fatura',
      taxesHint: 'Opcionais: deixa 0 se não as encontrares na fatura.',
      iec: 'Imposto especial de consumo — IEC (€/kWh)',
      cav: 'Contribuição audiovisual (€/mês)',
      dgeg: 'Taxa de exploração DGEG (€/mês)',
      info: {
        validFrom:
          'O dia a partir do qual pagas estes preços: o início do contrato ou a data da última mudança de preços, que o comercializador te comunica por carta ou email.',
        power: 'Na fatura, nos dados do contrato: "Potência contratada", em kVA.',
        fixedPerDay:
          'No detalhe da fatura, linha "Potência" ou "Termo de potência": o preço por dia, sem IVA. Se vier em duas linhas (comercializador e tarifa de acesso às redes), soma os dois preços. Ex.: 0,12 + 0,3436 = 0,4636.',
        energy:
          'No detalhe da fatura, linha "Energia" ou "Consumo": o preço por kWh, sem IVA e antes dos descontos. Se vier em duas linhas (energia e tarifa de acesso às redes), soma os dois preços.',
        energyDiscount:
          'Linhas de desconto no detalhe da fatura, como "Desc. FE" (fatura eletrónica), "Desc. DD" (débito direto) ou "Desc. Dual" (eletricidade e gás no mesmo comercializador): soma as percentagens. Ex.: 1 % + 1 % + 2 % = 4. O desconto social vai abaixo, na tarifa social.',
        socialEnergy:
          'Linha "Desc. Social" da energia: o valor por kWh, sem o sinal menos. Ex.: 0,0468.',
        socialPower:
          'Linha "Desc. Social" da potência: o valor por dia, sem o sinal menos. Ex.: 0,2166.',
        socialFinancing:
          'Linha "Financiamento da tarifa social": o valor por kWh. Aparece em todas as faturas desde janeiro de 2026, mesmo sem tarifa social. Ex.: 0,002067.',
        iec: 'Linha "IEC" ou "Imposto Especial de Consumo": o valor por kWh (0,001 no continente). Com tarifa social aparece isento: deixa 0.',
        cav: 'Linha "Contribuição Audiovisual" (CAV): o valor por mês, sem IVA. Ex.: 2,85.',
        dgeg: 'Linha "Taxa de exploração DGEG": o valor por mês, sem IVA. Ex.: 0,07.',
      },
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
      title: 'Mudar a palavra-passe',
      current: 'Palavra-passe atual',
      next: (min: number) => `Nova palavra-passe (mín. ${min} caracteres)`,
      repeat: 'Repete a nova palavra-passe',
      submit: 'Mudar a palavra-passe',
      submitting: 'A mudar…',
      done: 'Palavra-passe mudada. As sessões noutros dispositivos terminaram.',
      wrong: 'A palavra-passe atual está errada.',
      tooShort: (min: number) => `A nova palavra-passe tem de ter pelo menos ${min} caracteres.`,
      mismatch: 'As novas palavras-passe não coincidem.',
    },
  },
  power: {
    title: 'Potência contratada',
    intro:
      'A potência contratada mais baixa que não teria cortado a luz nos últimos 90 dias. A app simula o contador da E-Redes segundo a segundo, com os dados do teu Shelly.',
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
    verdictLowerWhy: 'Nos últimos 90 dias, o contador nunca teria cortado.',
    verdictSame: (current: string) => `Os teus ${current} estão certos`,
    verdictSameWhy: 'É o escalão mais baixo que não teria cortado nos últimos 90 dias.',
    verdictHigher: (current: string, recommended: string) =>
      `Considera subir de ${current} para ${recommended}`,
    verdictHigherWhy: (current: string) =>
      `Com ${current}, o contador teria cortado (ou já cortou) nos últimos 90 dias.`,
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
    clear: 'nunca chega ao limite de corte',
    safe: (pct: number, when: string) =>
      `passa o limite mas não corta (no máximo ${pct} % do tempo de corte, em ${when})`,
    trips: (count: number, when: string, kva: string) =>
      `cortaria ${count} ${count === 1 ? 'vez' : 'vezes'} (a 1.ª em ${when}, a ${kva})`,
    unknown: 'demasiados minutos acima do limite para verificar',
    estimated: (count: number) =>
      `${count} ${count === 1 ? 'minuto sem' : 'minutos sem'} valores ao segundo: contado com o pico do minuto durante o minuto inteiro.`,
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
      'Só vê o que aconteceu nestes 90 dias: um inverno frio ou um aparelho novo podem pedir mais potência.',
    ],
  },
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
    confusable: (label: string, other: string) =>
      `Guardado. Atenção: "${label}" e "${other}" têm ciclos quase iguais (mesma potência e duração parecida). A app fica com o mais próximo, mas pode trocá-los.`,
    close: 'Fechar',
    unreliable: 'pouco fiável',
    loadKinds: { resistive: 'tipo resistência', motor: 'tipo motor' },
    loadKindNote:
      'O tipo vem da potência não ativa que o aparelho junta à da casa. Tipo resistência (até 10 % da potência ativa): chaleira, forno, aquecimento das máquinas, mas também a placa de indução. Tipo motor (15 % ou mais): frigorífico, tambor da máquina, micro-ondas. Diz como o aparelho puxa a corrente, não o que é: o compressor de uma máquina de secar com bomba de calor pode parecer uma resistência. Nos aparelhos pequenos e nos programas inteiros não aparece.',
    unreliableNote:
      'Grupos de menos de 60 W ("pouco fiável") estão perto do mínimo que a app consegue ver: o consumo da casa varia mais do que isso de segundo a segundo, e alguns ligares ficam emparelhados com o desligar errado. A energia deles é um máximo, não uma medida.',
    name: 'Guardar',
    cancel: 'Cancelar',
    named: 'Aparelhos reconhecidos neste dia',
    namedRow: (count: number, energy: string, cost: string | null) =>
      `${count === 1 ? '1 vez' : `${count} vezes`}, ${energy}${cost === null ? '' : `, ${cost}`}`,
    costNote:
      'Custo da energia com o teu tarifário, à hora de cada uso, com IEC e IVA: o que a fatura deste dia teria a menos sem o aparelho. A potência contratada paga-se na mesma.',
    noTariff: 'Para ver quanto custou cada aparelho, indica o teu tarifário.',
    explained: (percent: number, energy: string) =>
      `Os aparelhos com nome explicam ${percent} % da energia deste dia (${energy}). O resto é o consumo de fundo e o que ainda não tem nome.`,
    nameFailed: 'Não foi possível guardar o nome. Tenta outra vez.',
    tooMany: 'Já há aparelhos a mais com nome. Apaga algum em "Calibrar aparelhos".',
    day: 'Dia',
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
  },
  calibrate: {
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
    tooLong: 'Mais de 4 horas: cancela e indica as horas à mão, só com a parte que interessa.',
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
      'Só conta os aparelhos com nome, e só os dias com valores ao segundo quase completos. Para dar nome a um aparelho, usa "O que é?" em "Ao segundo".',
  },
  knownAppliances: {
    title: 'Aparelhos que a app reconhece',
    intro:
      'Cada um é reconhecido pela potência, pela forma e pela duração dos seus ciclos, em todos os dias com valores ao segundo. Dás-lhes nome em "O que é?" no cartão "Ao segundo" ou a partir de uma calibração. Um programa mais curto ou mais longo (máquina de lavar a 30 ou a 60 °C) que não seja reconhecido: dá-lhe o mesmo nome e a duração aceite alarga-se.',
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
      title: (shelly: string) => `${shelly} (Shelly) e E-Redes`,
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
  /** Settings → Devices → "Instalar um Shelly": the electrician's sheet and the check. */
  shellySetup: {
    title: 'Instalar um Shelly',
    link: 'Instalar um Shelly: folha para o eletricista e verificação',
    back: 'Voltar às Definições',
    intro:
      'Um Shelly no quadro elétrico mede a casa toda ao segundo. A instalação no quadro é para um eletricista: imprime esta folha e entrega-lha. Depois de ligado, verifica aqui se ficou bem.',
    sheetTitle: 'Folha para o eletricista',
    sheet: [
      [
        'Aparelho',
        'Shelly EM Gen3 (ou outro Shelly de 2.ª geração ou mais recente que meça energia; o Shelly EM de 1.ª geração não serve, porque não corre scripts). Monta em calha DIN, no quadro.',
      ],
      [
        'Alimentação',
        'Fase (L) e neutro (N). A fase que alimenta o Shelly deve ser a mesma em que fica a pinça: é a referência de tensão da medição.',
      ],
      [
        'Pinça',
        'Só no condutor de fase da entrada da casa, antes de qualquer derivação, para medir a casa toda. Nunca no neutro, nem à volta da fase e do neutro juntos (assim não mede nada). Bem fechada à volta do cabo.',
      ],
      [
        'Sentido',
        'A seta (K → L) no sentido da corrente, da rede para a casa. Ao contrário, a potência aparece negativa; corrige-se virando a pinça ou, na interface do Shelly, com a opção de inverter o sentido da pinça (pede reinício).',
      ],
      [
        'Entrada',
        'A pinça incluída na primeira entrada de pinça do Shelly (canal 0 no Wattómetro).',
      ],
      [
        'Wi-Fi',
        'A rede Wi-Fi da casa tem de chegar ao quadro: o Shelly envia as medições pela internet.',
      ],
      [
        'Segurança',
        'Instalação por um eletricista qualificado, com o quadro desligado, segundo o guia de segurança que vem com o Shelly.',
      ],
    ] as const,
    afterTitle: 'Depois da instalação',
    after:
      'Liga o Shelly ao Wi-Fi com a app Shelly Smart Control, adiciona um dispositivo em Definições → Dispositivos e instala o script do Wattómetro.',
    instructions: 'Instruções do script',
    print: 'Imprimir a folha',
    checkTitle: 'Verificar a instalação',
    checkIntro:
      'Com o script a enviar, a app olha para o último minuto de cada Shelly. Atualiza sozinha a cada 30 segundos.',
    noDevices: 'Ainda não há nenhum Shelly. Adiciona-o em Definições → Dispositivos.',
    meter: (name: string, channel: number) => `${name}, canal ${channel}`,
    lastMinute: (power: string, volts: string, time: string) =>
      `Último minuto (${time}): ${power}, ${volts}.`,
    state: { ok: 'Bem', warn: 'Atenção', fail: 'Problema' },
    checks: {
      sending: { ok: 'Está a enviar as medições a cada minuto.' },
      voltage: { ok: 'Mede a tensão dentro dos limites.' },
      direction: { ok: 'A pinça está no sentido certo: a potência é positiva.' },
      clamp: { ok: 'A pinça está a medir consumo.' },
    },
    findings: {
      never:
        'Ainda não enviou nada. Confirma o endereço e o token no Shelly e que o script está a correr (instruções do script, passo 5).',
      stale:
        'Não envia há mais de 3 minutos. Vê se o Shelly tem Wi-Fi e se o script está a correr.',
      low: (volts: string) =>
        `A tensão do último minuto (${volts}) está abaixo do limite. Confirma a ligação da fase e do neutro do Shelly.`,
      high: (volts: string) =>
        `A tensão do último minuto (${volts}) está acima do limite. Se se repetir, vê a página Qualidade.`,
      reversed: (power: string) =>
        `A potência é negativa (${power}): a pinça está ao contrário. Vira-a (seta da rede para a casa) ou inverte o sentido da pinça na interface do Shelly. Com painéis solares a injetar na rede, é normal.`,
      idle: (power: string) =>
        `A pinça quase não mede nada (${power}). Pode estar no neutro, à volta da fase e do neutro juntos, ou mal fechada; ou a casa não tem mesmo nada ligado.`,
    },
    testTitle: 'Teste com um aparelho',
    test: 'Liga uma chaleira ou um secador de cabelo durante 2 minutos inteiros. No minuto seguinte, a potência deve subir mais ou menos o que diz a etiqueta do aparelho. Se não subir, a pinça não está no cabo que alimenta essa tomada.',
    later:
      'Ao fim de uns dias, se tiveres o ficheiro da E-Redes, compara os dois em Consumo: a diferença deve ser pequena.',
  },
  eredes: {
    title: 'Consumos da E-Redes',
    intro:
      'Importa o histórico a 15 minutos do teu contador inteligente: serve para o simulador de tarifários e para os meses antes do Shelly. O ficheiro é lido no teu browser; só os consumos vão para o servidor (o CPE e o número do contador não).',
    steps: [
      'No Balcão Digital da E-Redes: "Consultar histórico", consumos a 15 minutos, estado real e estimado.',
      'Exporta: o ficheiro .xlsx fica pronto até 24 horas depois (o portal avisa).',
      'Escolhe-o aqui, sem o abrir nem gravar no Excel antes. Podes importar o mesmo período mais do que uma vez: nada se duplica.',
    ],
    /** The second step: which dates to ask for. */
    period: {
      first: 'Período: os últimos 12 meses, o máximo que a E-Redes dá.',
      next: (from: string) =>
        `Período: de ${from} até ontem (o dia a seguir ao último que já importaste).`,
      upToDate: 'Já tens os consumos até ontem: por agora não há nada de novo para pedir.',
    },
    stored: 'Já importado:',
    between: (from: string, to: string) => `de ${from} a ${to}`,
    storedDetail: (kwh: string, quarters: number, estimated: number) =>
      `${kwh} em ${quarters.toLocaleString('pt-PT')} quartos de hora${estimated > 0 ? `, ${estimated.toLocaleString('pt-PT')} estimados pela E-Redes` : ''}.`,
    choose: 'Ficheiro exportado da E-Redes (.xlsx)',
    pick: 'Escolher ficheiro',
    noFile: 'Nenhum ficheiro escolhido',
    inFile: 'No ficheiro:',
    fileEnergy: (kwh: string, quarters: number) =>
      `${kwh} em ${quarters.toLocaleString('pt-PT')} quartos de hora`,
    fileEstimated: (count: number) =>
      `${count.toLocaleString('pt-PT')} valores estimados pela E-Redes (falha de comunicação do contador): ficam marcados.`,
    fileMissing: (count: number) =>
      `${count.toLocaleString('pt-PT')} quartos de hora em falta no ficheiro (a E-Redes perde a hora repetida no dia em que a hora muda em outubro).`,
    coverage: {
      whole: 'Nenhum dia em falta ou incompleto, e nenhum valor estimado.',
      missing: (days: number) =>
        `${days.toLocaleString('pt-PT')} ${days === 1 ? 'dia' : 'dias'} sem dados:`,
      range: (from: string, to: string, days: number) =>
        days === 1 ? from : `${from} a ${to} (${days} dias)`,
      partial: (days: number) =>
        `${days.toLocaleString('pt-PT')} ${days === 1 ? 'dia incompleto' : 'dias incompletos'}:`,
      partialDay: (day: string, quarters: number) =>
        `${day} (${quarters === 1 ? 'falta 1 quarto de hora' : `faltam ${quarters} quartos de hora`})`,
      estimated: (quarters: number, days: number) =>
        `${quarters.toLocaleString('pt-PT')} ${quarters === 1 ? 'quarto de hora estimado' : 'quartos de hora estimados'} pela E-Redes em ${days.toLocaleString('pt-PT')} ${days === 1 ? 'dia' : 'dias'}:`,
      estimatedDay: (day: string, quarters: number) => `${day} (${quarters})`,
      more: (count: number) => `e mais ${count.toLocaleString('pt-PT')}`,
      gapsHint:
        'Para os preencher, pede no Balcão Digital um ficheiro com esses dias e importa-o aqui: o que já tens não se duplica.',
      estimatedHint:
        'A E-Redes estima quando não consegue ler o contador. Se mais tarde os corrigir, um ficheiro novo substitui-os.',
    },
    send: 'Importar',
    sending: (percent: number) => `A enviar… ${percent} %`,
    done: (written: number) =>
      written === 0
        ? 'Nada de novo: estes consumos já estavam importados.'
        : `Importados ${written.toLocaleString('pt-PT')} quartos de hora.`,
    rejected: 'O servidor recusou os dados. Confirma que é o ficheiro da E-Redes.',
    remove: 'Apagar os consumos importados',
    removeConfirm: 'Apagar todos os consumos importados da E-Redes? Podes voltar a importá-los.',
    removed: 'Consumos da E-Redes apagados.',
    errors: {
      not_xlsx: () => 'Não consegui ler o ficheiro: tem de ser o .xlsx exportado da E-Redes.',
      not_eredes: () =>
        'Este .xlsx não é a exportação de consumos da E-Redes (cabeçalho ou unidade diferentes).',
      bad_row: (row: number) => `Linha ${row} do ficheiro com valores que não consigo ler.`,
      duplicate: (row: number) => `A linha ${row} repete um quarto de hora já lido.`,
      empty: () => 'O ficheiro não tem consumos.',
    },
  },
  demo: {
    title: 'Ver demonstração',
    intro:
      'Vê o que o Wattómetro faz com uma casa fictícia: consumo, custo, potência contratada e qualidade da energia. Os dados são gerados no teu browser; nada é enviado.',
    banner: 'Demonstração: casa fictícia com dados de exemplo. As alterações perdem-se ao sair.',
    exit: 'Sair da demonstração',
    readOnly: 'Na demonstração isto não se pode mudar.',
  },
  server: {
    checking: 'A verificar o servidor…',
    ok: 'Servidor ligado',
    unavailable: 'Servidor indisponível',
    limit: 'Base de dados em pausa',
    limitBanner: (time: string | null) =>
      `A base de dados atingiu o limite diário gratuito de leituras da Cloudflare: a app fica parada${time ? ` até às ${time}` : ''} (meia-noite UTC). Os dados guardados não se perdem; o Shelly guarda os minutos que conseguir até lá.`,
    banner:
      'Sem ligação ao servidor: os valores podem estar desatualizados. A app tenta outra vez sozinha.',
  },
  install: {
    title: 'Aplicação',
    intro:
      'Instala o Wattómetro no telemóvel ou no computador: abre pelo ícone, em ecrã inteiro, como uma app.',
    button: 'Instalar app',
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
