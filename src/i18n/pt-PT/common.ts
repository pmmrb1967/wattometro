// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): The app around the pages: navigation, errors, the landing page, signing in, installing, the footer. */
import { minutes } from './shared';

export const commonTexts = {
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
    title: 'Quanto pode a tua casa poupar na luz?',
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
