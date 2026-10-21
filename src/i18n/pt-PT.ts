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
  footer: {
    license: 'Software livre (AGPL-3.0).',
    source: 'Código-fonte',
    version: (commit: string) => `Versão ${commit}`,
  },
} as const;
