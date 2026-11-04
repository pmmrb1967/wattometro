// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): Starting: installing the Shelly, the E-Redes file and the use without an account. */
export const setupTexts = {
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
    introLocal:
      'Importa o histórico a 15 minutos do teu contador inteligente: serve para o simulador de tarifários, a potência contratada e o consumo base. O ficheiro é lido no teu browser e os consumos ficam guardados só nele.',
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
  local: {
    title: 'Usar sem conta',
    intro:
      'Só com o ficheiro da E-Redes: a tua casa fica guardada neste browser e não é enviada para o servidor. Não precisas de conta nem de Shelly. Se o browser apagar os dados, perdes-os: guarda uma cópia num ficheiro.',
    who: 'Neste browser',
    householdName: 'A minha casa',
    banner: {
      empty: 'Sem conta: os dados ficam só neste browser.',
      never: 'Sem conta: os dados ficam só neste browser e ainda não tens uma cópia.',
      due: (date: string) => `Sem conta: a casa mudou desde a última cópia, de ${date}.`,
      fresh: (date: string) => `Sem conta: os dados ficam só neste browser. Última cópia: ${date}.`,
      unreadable:
        'Não foi possível ler os dados guardados neste browser. Para não os estragar, a app não grava nada por cima.',
    },
    backupLink: 'Guardar cópia',
    unreadableLink: 'Ver o que fazer',
    exit: 'Sair do modo sem conta',
    lookGroup: 'Aspeto',
    shellyUnavailable:
      'Sem conta não é possível configurar um Shelly: o Shelly envia as medições para o servidor da app, e no modo sem conta os dados ficam só neste browser.',
    shelly:
      'Com um Shelly no quadro elétrico, a app mostra também a potência a cada segundo, os aparelhos, a tensão e avisos no telemóvel. Isso precisa de uma instalação própria, com o servidor da app na tua conta Cloudflare:',
    shellyLink: 'como instalar',
    addShelly: 'Com um Shelly: precisa de uma instalação própria (como fazer)',
    solar:
      'Os painéis solares precisam do servidor da app para pedir a produção ao PVGIS, por isso não estão disponíveis sem conta.',
    data: {
      title: 'Dados deste browser',
      intro:
        'A tua casa (o ficheiro da E-Redes, o tarifário, a localidade) está guardada só neste browser. Se limpares os dados do browser ou mudares de aparelho, perdes-a: guarda uma cópia num ficheiro e repõe-na quando precisares.',
      save: 'Guardar cópia',
      restore: 'Repor cópia',
      restoreConfirm: 'Repor a cópia substitui a casa guardada neste browser. Continuar?',
      restored: 'Cópia reposta.',
      badFile: 'Este ficheiro não é uma cópia do Wattómetro que esta versão da app consiga ler.',
      notKept: 'O browser não deixou guardar os dados (espaço cheio ou janela privada).',
      nothingToSave: 'Ainda não há dados para guardar.',
      unreadable:
        'Não foi possível ler os dados deste browser. Recarrega a página e, se a app tiver sido atualizada, fecha-a e volta a abri-la. Se o problema continuar, guarda os dados como estão e repõe uma cópia.',
      saveAsTheyAre: 'Guardar os dados como estão',
      notRead: 'O browser não deixou ler os dados. Recarrega a página e tenta outra vez.',
      remove: 'Apagar os dados deste browser',
      notRemoved: 'O browser não deixou apagar os dados. Recarrega a página e tenta outra vez.',
      removeConfirm:
        'Apagar a casa guardada neste browser, com a chave de IA e o registo de gastos? Não dá para desfazer.',
      fileName: (date: string) => `wattometro-${date}.json`,
      unreadableFileName: (date: string) => `wattometro-ilegivel-${date}.json`,
    },
  },
} as const;
