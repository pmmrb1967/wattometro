// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): the household copy, in Definições › Dados e Shelly (BackupSection). */
const days = (count: number) => (count === 1 ? '1 dia' : `${count} dias`);

export const backupTexts = {
  backup: {
    title: 'Cópia da casa',
    intro:
      'Guarda num ficheiro cifrado com a palavra-passe da conta as medições, o tarifário, os equipamentos, os aparelhos e as definições da casa. Os valores ao segundo dos últimos 90 dias não entram (expiram sozinhos).',
    last: (date: string, count: number) =>
      count === 0 ? `Última cópia: ${date} (hoje).` : `Última cópia: ${date} (há ${days(count)}).`,
    never: 'Ainda não guardaste nenhuma cópia.',
    late: (count: number) => `Passou o prazo de ${days(count)}: guarda uma cópia nova.`,
    folder: (name: string) => `Pasta: ${name}`,
    noFolder: 'Ainda não escolheste a pasta: a cópia vai para as transferências do browser.',
    chooseFolder: 'Escolher pasta',
    changeFolder: 'Mudar pasta',
    folderNote:
      'O browser só mostra o nome da pasta, não o caminho. Para a cópia ir também para a cloud, escolhe uma pasta do OneDrive, Google Drive ou Dropbox deste computador.',
    downloadsOnly:
      'Neste browser a cópia vai para as transferências. No Chrome ou no Edge de um computador podes escolher uma pasta.',
    folderDenied: 'O browser não deu autorização para escrever nessa pasta. Escolhe-a outra vez.',
    estimate: (rows: string, percent: number) =>
      `Fazer a cópia lê cerca de ${rows} linhas do servidor (${percent} % do que o plano gratuito permite por dia).`,
    password: 'Palavra-passe da conta',
    showPassword: 'Mostrar a palavra-passe',
    hidePassword: 'Esconder a palavra-passe',
    passwordNote:
      'É a de Conta e aspeto. Se a mudares, as cópias anteriores continuam a abrir com a palavra-passe que tinhas quando as guardaste.',
    save: 'Guardar cópia',
    saving: (rows: string) => `A copiar… ${rows} linhas`,
    sealing: 'A cifrar…',
    saved: (name: string, place: string) => `Cópia guardada: ${name} em ${place}.`,
    downloaded: (name: string) => `Cópia ${name} enviada para as transferências do browser.`,
    wrongPassword: 'Esta não é a palavra-passe da conta.',
    notWritten: 'Não foi possível escrever o ficheiro na pasta. Escolhe-a outra vez.',
    busy: (time: string) =>
      `O servidor já leu muito hoje e a cópia podia parar o Shelly. Tenta depois das ${time}.`,
    remind: 'Lembrar-me de fazer uma cópia',
    remindChoices: {
      7: 'Ao fim de 7 dias',
      15: 'Ao fim de 15 dias',
      30: 'Ao fim de 1 mês',
      0: 'Nunca',
    },
    remindNote:
      'Aparece aqui e no Início; em Definições › Avisos podes recebê-lo também por notificação.',
    reminderSaved: 'Lembrete guardado.',
    restoreTitle: 'Repor uma cópia',
    restoreIntro:
      'Junta à casa o que a cópia tem e a casa não: não apaga nem muda nada do que já existe. O plano gratuito escreve um número limitado de linhas por dia, por isso um ano de minutos pode levar vários dias; a reposição continua sozinha sempre que abres a app.',
    restorePick: 'Escolher o ficheiro da cópia',
    opening: 'A abrir a cópia…',
    notACopy: 'Este ficheiro não é uma cópia da casa do Wattómetro.',
    unknownVersion: 'Esta cópia foi feita por uma versão mais recente da app. Atualiza a app.',
    openWrongPassword:
      'A cópia não abre com esta palavra-passe. Se mudaste a palavra-passe da conta depois de a guardar, usa a que tinhas nessa altura.',
    badContent: 'A cópia está danificada ou incompleta.',
    needsPassword: 'Escreve primeiro a palavra-passe com que a cópia foi guardada.',
    confirm: (name: string, date: string, rows: string) =>
      `Juntar à casa a cópia «${name}» de ${date} (${rows} linhas)? Fica tudo o que a casa já tem.`,
    notKept: 'O browser não deixou guardar a cópia para a repor (espaço cheio ou janela privada).',
    progress: (date: string, percent: number) => `A repor a cópia de ${date}: ${percent} %.`,
    waiting: (time: string) =>
      `O servidor já escreveu o que podia hoje. Continua depois das ${time}, quando abrires a app.`,
    stopped: 'A reposição parou (sem ligação). Continua quando abrires a app.',
    refused: 'O servidor recusou uma parte da cópia. O que já foi reposto fica.',
    finished: (date: string, rows: string) =>
      `Cópia de ${date} reposta: ${rows} linhas que a casa não tinha.`,
    goOn: 'Continuar agora',
    cancel: 'Parar a reposição',
    dismiss: 'OK',
    cancelConfirm:
      'Parar a reposição? O que já foi reposto fica; para o resto tens de escolher o ficheiro outra vez.',
    homeLate: (count: number) => `A última cópia da casa tem ${days(count)}.`,
    homeNever: 'Ainda não guardaste nenhuma cópia da casa.',
    homeLink: 'Guardar cópia',
    unavailable: 'Não foi possível contactar o servidor. Tenta outra vez.',
  },
} as const;
