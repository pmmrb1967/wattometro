// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Texts (pt-PT): the local mode's sync and backups in the user's cloud
 * (OneDrive, Google Drive or Dropbox). `service` is the service's name
 * (providerName), `company` the one behind its sign-in page and accounts
 * (providerCompany).
 */
export const cloudTexts = {
  cloud: {
    title: 'Sincronizar e guardar na tua cloud',
    titleLinked: (service: string) => `Sincronizar e guardar no teu ${service}`,
    intro: 'A casa fica numa pasta tua, cifrada com uma palavra-passe que só tu sabes.',
    connect: (service: string) => `Ligar ao ${service}`,
    leaving: (company: string) => `A abrir a página da ${company}…`,
    checking: (service: string) => `A ver a pasta do ${service}…`,
    failed: (service: string) => `Não foi possível ligar ao ${service}. Tenta outra vez.`,
    unreadableHouse:
      'Os dados deste browser não se conseguem ler, por isso não são enviados. Resolve isso primeiro (acima).',
    newerApp: (service: string) =>
      `A casa no ${service} foi gravada por uma versão mais recente da app. Atualiza a app neste aparelho: fecha-a e volta a abri-la.`,
    create: {
      title: 'Escolhe a palavra-passe da cloud',
      hint: (company: string) =>
        `Serve para abrir a casa noutros aparelhos. Não é a da ${company} e a app não a guarda: se a esqueceres, só a chave de recuperação abre a casa.`,
      password: (min: number) => `Palavra-passe (mínimo ${min} caracteres)`,
      repeat: 'Repete a palavra-passe',
      tooShort: (min: number) => `A palavra-passe tem de ter pelo menos ${min} caracteres.`,
      mismatch: 'As duas palavras-passe não são iguais.',
      submit: 'Cifrar e ligar',
      submitting: 'A cifrar e a enviar…',
    },
    recovery: {
      title: 'Chave de recuperação',
      intro:
        'Guarda esta chave num sítio seguro, por exemplo num gestor de palavras-passe. Abre a casa se esqueceres a palavra-passe; sem uma das duas, ninguém consegue ler os dados, nem tu.',
      copy: 'Copiar',
      copied: 'Copiada',
      saved: 'Já a guardei',
    },
    join: {
      title: (service: string) => `O teu ${service} já tem uma casa`,
      intro: 'Escreve a palavra-passe que escolheste ao ligar o primeiro aparelho.',
      password: 'Palavra-passe da cloud',
      recoveryKey: 'Chave de recuperação',
      useRecovery: 'Usar a chave de recuperação',
      usePassword: 'Usar a palavra-passe',
      wrongSecret: 'A palavra-passe ou a chave de recuperação não está certa. Tenta outra vez.',
      bothHouses:
        'Este browser também tem uma casa. Juntar acrescenta-lhe o que falta na cloud; ficar com a da cloud descarrega primeiro uma cópia da casa deste browser e depois substitui-a.',
      join: 'Juntar as duas casas',
      keepCloud: 'Ficar com a da cloud',
      noCloudHouse: (service: string) =>
        `A pasta do ${service} não tem uma casa que se consiga ler. Usa «Juntar as duas casas».`,
      open: 'Abrir a casa',
      working: 'A abrir a casa…',
    },
    landingJoin: {
      button: 'Tenho a casa na cloud',
      /** One button per service, when more than one is offered. */
      from: (service: string) => `Do ${service}`,
      leaving: (company: string) => `A abrir a página da ${company}…`,
      noHouse: (service: string) =>
        `Esta pasta do ${service} ainda não tem uma casa. Usa sem conta e liga o ${service} em Definições.`,
    },
    cancel: 'Cancelar',
    linked: (service: string, account: string, when: string) =>
      `${service} de ${account} · última sincronização: ${when}`,
    neverSynced: 'ainda não',
    someAccount: (company: string) => `uma conta ${company}`,
    syncNow: 'Sincronizar agora',
    syncing: 'A sincronizar…',
    disconnect: 'Desligar',
    disconnectConfirm: (service: string) =>
      `Desligar este browser do ${service}? A casa fica neste browser e na cloud, e os outros aparelhos continuam a sincronizar.`,
    disconnectFailed: (service: string) =>
      `Não foi possível falar com o ${service}. Este browser ficou desligado; a fotografia dele na pasta fica até a apagares.`,
    backups: {
      title: (service: string) => `Cópias no ${service}`,
      none: 'Ainda não há cópias: a app faz uma por semana, quando a casa muda.',
      loading: 'A ler as cópias…',
      failed: 'Não foi possível ler a lista das cópias.',
      size: (kilobytes: number) => `${kilobytes} kB`,
      restore: 'Repor',
      restoreConfirm: (date: string, service: string) =>
        `Repor a cópia de ${date}? Substitui a casa em todos os aparelhos ligados ao ${service}.`,
      unreadable: 'Não foi possível ler esta cópia.',
    },
    /** Settings › Dados, with the cloud linked. */
    data: {
      restoreConfirm: (service: string) =>
        `Repor a cópia substitui a casa em todos os aparelhos ligados ao ${service}. Continuar?`,
      removeChoice: (service: string) =>
        `A casa está ligada ao ${service}. Apagar só deste browser (a cloud e os outros aparelhos ficam como estão) ou também da cloud (a casa, as cópias e a chave, para todos os aparelhos)?`,
      onlyHere: 'Só deste browser',
      alsoCloud: 'Também da cloud',
      typeWord: 'Para apagar também da cloud, escreve «apagar»',
      word: 'apagar',
      removeAll: 'Apagar tudo',
      cloudNotRemoved: (service: string) =>
        `Não foi possível apagar tudo do ${service}: a casa na cloud pode ter ficado só em parte. Este browser não foi apagado; tenta outra vez.`,
    },
    /** Importar: deleting the E-Redes data with the cloud linked. */
    eredesRemoveConfirm: (service: string) =>
      `Apagar todos os consumos importados da E-Redes, em todos os aparelhos ligados ao ${service}? Podes voltar a importá-los.`,
    banner: {
      synced: (service: string, date: string) =>
        `Sem conta: a casa sincroniza com o teu ${service}. Última sincronização: ${date}.`,
      needs_reconnect: (service: string) =>
        `A ligação ao ${service} expirou: a casa não se sincroniza.`,
      reconnect: (service: string) => `Ligar de novo ao ${service}`,
      quota_full: (service: string) =>
        `O ${service} está cheio: a casa não se sincroniza até libertares espaço.`,
      newer_app:
        'Outro aparelho tem uma versão mais recente da app. Atualiza a app neste aparelho: fecha-a e volta a abri-la.',
      unreadable_device:
        'Um aparelho tem dados que não se conseguem ler. Os outros continuam a sincronizar.',
      failed: (service: string) =>
        `Não foi possível sincronizar com o ${service}. Abre Definições › Dados para ver o que se passa.`,
      removed: 'A casa na cloud foi apagada ou substituída. Liga de novo para continuar.',
      removedLink: 'Ligar de novo',
      settingsLink: 'Abrir Definições',
      close: 'Fechar',
    },
  },
} as const;
