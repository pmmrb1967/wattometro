// SPDX-License-Identifier: AGPL-3.0-or-later
/** Every text the user sees, in European Portuguese (post-1990 agreement, "tu"). */
export const t = {
  appName: 'Wattómetro',
  tagline: 'O consumo elétrico da casa transformado em poupança concreta.',
  loading: 'A carregar…',
  login: {
    title: 'Entrar',
    email: 'Email',
    password: 'Password',
    submit: 'Entrar',
    submitting: 'A entrar…',
    invalid: 'Email ou password errados.',
    locked: (minutes: number) =>
      `Demasiadas tentativas. Tenta outra vez daqui a ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`,
    unavailable: 'Não foi possível contactar o servidor. Tenta outra vez.',
    noAccount: 'As contas são criadas pelo responsável da instalação.',
  },
  home: {
    signedInAs: (email: string) => `Entraste como ${email}`,
    logout: 'Sair',
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
  server: {
    checking: 'A verificar o servidor…',
    ok: 'Servidor ligado',
    unavailable: 'Servidor indisponível',
  },
  footer: {
    license: 'Software livre (AGPL-3.0).',
    source: 'Código-fonte',
    version: (commit: string) => `Versão ${commit}`,
  },
} as const;
