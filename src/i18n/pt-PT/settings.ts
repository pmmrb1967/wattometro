// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): Definições, and the alerts set up there. */
export const settingsTexts = {
  /** Web Push alerts (server/src/alerts.ts composes them; Definições → Avisos sets them). */
  alerts: {
    staleTitle: 'O Shelly deixou de enviar',
    staleBody: (device: string, time: string) =>
      `Sem medições de «${device}» desde as ${time}. O Shelly guarda os minutos cerca de 7 dias: quando voltar a enviar, são recuperados.`,
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
    unusualMore: 'Vê em Consumo a que horas foi.',
    testTitle: 'Aviso de teste',
    testBody: 'Os avisos do Wattómetro chegam a este aparelho.',
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
        unusualDay: 'Ontem foi fora do habitual',
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
        unusualDay:
          'De manhã, quando ontem a casa gastou muito mais (ou muito menos) do que é costume nesse tipo de dia. Só nas casas em que a temperatura não mexe na eletricidade (em Definições › Casa: aquecimento que não é elétrico e sem ar condicionado).',
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
      invoice: {
        title: 'Preencher com uma fatura',
        intro:
          'Escolhe o PDF de uma fatura de eletricidade da Repsol: a app copia os preços para o formulário, para os reveres antes de guardar. O ficheiro é lido neste aparelho e não é enviado. Para outros comercializadores, copia os valores à mão.',
        choose: 'Fatura em PDF',
        pick: 'Escolher ficheiro',
        noFile: 'Nenhum ficheiro escolhido',
        reading: 'A ler a fatura…',
        password: 'Password do PDF',
        passwordHint: 'Na Repsol, costuma ser o NIF do titular. Fica só neste ecrã.',
        open: 'Abrir',
        wrongPassword: 'Password errada. Tenta outra vez.',
        unreadable: 'Não foi possível abrir este ficheiro como PDF.',
        problems: {
          notRepsol:
            'Isto não parece uma fatura de eletricidade da Repsol, a única que a app sabe ler por agora. Copia os valores à mão.',
          totalMismatch:
            'As linhas lidas não somam o total sem IVA da fatura, por isso nenhum valor foi usado. Copia os valores à mão.',
        },
        read: (from: string, to: string) =>
          `Formulário preenchido com a fatura de ${from} a ${to}. Revê os valores e carrega em Guardar.`,
        same: 'Os preços da fatura são iguais aos do tarifário atual: não há nada a mudar.',
        newFrom:
          'A data de início ficou a do começo da fatura. Se os preços mudaram antes, corrige-a.',
        missing: (fields: string) => `Não encontrados na fatura, ficaram como estavam: ${fields}.`,
        notOnInvoice:
          'O ciclo, os horários dos períodos e a família numerosa não vêm na fatura: ficaram como estavam.',
      },
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
} as const;
