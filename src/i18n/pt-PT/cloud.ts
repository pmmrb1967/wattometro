// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): the local mode's sync and backups in the user's OneDrive. */
export const cloudTexts = {
  cloud: {
    title: 'Sincronizar e guardar no teu OneDrive',
    intro: 'A casa fica numa pasta tua, cifrada com uma palavra-passe que só tu sabes.',
    connect: 'Ligar ao OneDrive',
    leaving: 'A abrir a página da Microsoft…',
    checking: 'A ver a pasta do OneDrive…',
    failed: 'Não foi possível ligar ao OneDrive. Tenta outra vez.',
    unreadableHouse:
      'Os dados deste browser não se conseguem ler, por isso não são enviados. Resolve isso primeiro (acima).',
    newerApp:
      'A casa no OneDrive foi gravada por uma versão mais recente da app. Atualiza a app neste aparelho: fecha-a e volta a abri-la.',
    create: {
      title: 'Escolhe a palavra-passe da cloud',
      hint: 'Serve para abrir a casa noutros aparelhos. Não é a da Microsoft e a app não a guarda: se a esqueceres, só a chave de recuperação abre a casa.',
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
      title: 'O teu OneDrive já tem uma casa',
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
      open: 'Abrir a casa',
      working: 'A abrir a casa…',
    },
    cancel: 'Cancelar',
    linked: (account: string, when: string) =>
      `OneDrive de ${account} · última sincronização: ${when}`,
    neverSynced: 'ainda não',
    someAccount: 'uma conta Microsoft',
    syncNow: 'Sincronizar agora',
    syncing: 'A sincronizar…',
    disconnect: 'Desligar',
    disconnectConfirm:
      'Desligar este browser do OneDrive? A casa fica neste browser e na cloud, e os outros aparelhos continuam a sincronizar.',
    disconnectFailed:
      'Não foi possível falar com o OneDrive. Este browser ficou desligado; a fotografia dele na pasta fica até a apagares.',
    backups: {
      title: 'Cópias no OneDrive',
      none: 'Ainda não há cópias: a app faz uma por semana, quando a casa muda.',
      loading: 'A ler as cópias…',
      failed: 'Não foi possível ler a lista das cópias.',
      size: (kilobytes: number) => `${kilobytes} kB`,
      restore: 'Repor',
      restoreConfirm: (date: string) =>
        `Repor a cópia de ${date}? Substitui a casa em todos os aparelhos ligados ao OneDrive.`,
      unreadable: 'Não foi possível ler esta cópia.',
    },
    /** Settings › Dados, with the cloud linked. */
    data: {
      restoreConfirm:
        'Repor a cópia substitui a casa em todos os aparelhos ligados ao OneDrive. Continuar?',
      removeChoice:
        'A casa está ligada ao OneDrive. Apagar só deste browser (a cloud e os outros aparelhos ficam como estão) ou também da cloud (a casa, as cópias e a chave, para todos os aparelhos)?',
      onlyHere: 'Só deste browser',
      alsoCloud: 'Também da cloud',
      typeWord: 'Para apagar também da cloud, escreve «apagar»',
      word: 'apagar',
      removeAll: 'Apagar tudo',
      cloudNotRemoved:
        'Não foi possível apagar a casa do OneDrive. Nada foi apagado; tenta outra vez.',
    },
    /** Importar: deleting the E-Redes data with the cloud linked. */
    eredesRemoveConfirm:
      'Apagar todos os consumos importados da E-Redes, em todos os aparelhos ligados ao OneDrive? Podes voltar a importá-los.',
    banner: {
      synced: (date: string) =>
        `Sem conta: a casa sincroniza com o teu OneDrive. Última sincronização: ${date}.`,
      needs_reconnect: 'A ligação ao OneDrive expirou: a casa não se sincroniza.',
      reconnect: 'Ligar de novo ao OneDrive',
      quota_full: 'O OneDrive está cheio: a casa não se sincroniza até libertares espaço.',
      newer_app:
        'Outro aparelho tem uma versão mais recente da app. Atualiza a app neste aparelho: fecha-a e volta a abri-la.',
      unreadable_device:
        'Um aparelho tem dados que não se conseguem ler. Os outros continuam a sincronizar.',
      removed: 'A casa no OneDrive foi apagada ou substituída. Liga de novo para continuar.',
      removedLink: 'Ligar de novo',
      close: 'Fechar',
    },
  },
} as const;
