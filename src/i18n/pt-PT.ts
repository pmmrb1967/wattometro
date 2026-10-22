// SPDX-License-Identifier: AGPL-3.0-or-later
/** Every text the user sees, in European Portuguese (post-1990 agreement, "tu"). */
const minutes = (count: number) => `${count} ${count === 1 ? 'minuto' : 'minutos'}`;

export const t = {
  appName: 'Wattómetro',
  tagline: 'O consumo elétrico da casa transformado em poupança concreta.',
  loading: 'A carregar…',
  nav: {
    home: 'Início',
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
      'Registo de problemas de tensão para reclamar',
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
  server: {
    checking: 'A verificar o servidor…',
    ok: 'Servidor ligado',
    unavailable: 'Servidor indisponível',
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
