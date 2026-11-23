// SPDX-License-Identifier: AGPL-3.0-or-later
/** Texts (pt-PT): the public privacy page (/privacidade), adapted from Faturómetro's. */
export const privacyTexts = {
  privacyPage: {
    link: 'Privacidade',
    title: 'Privacidade',
    updated: 'Última atualização: 23 de novembro de 2026.',
    intro:
      'O Wattómetro foi feito para que os consumos da tua casa fiquem contigo. Esta página explica, sem letra miudinha, que dados existem, onde ficam e quem os pode ver.',
    sections: [
      {
        title: 'Quem é responsável',
        body: [
          'O Wattómetro é um projeto pessoal e gratuito de Paulo Barbosa, com o código aberto no GitHub. Não tem publicidade nem vende dados.',
          'Para dúvidas ou pedidos, usa o endereço de «Enviar opinião», no rodapé da app.',
        ],
      },
      {
        title: 'Sem conta: tudo neste browser',
        body: [
          'Sem conta, a casa (consumos da E-Redes que importares, tarifário, equipamentos e o resto do que registares) fica no armazenamento deste browser (IndexedDB). Nada vai para o servidor do Wattómetro.',
          'Quem usar este browser consegue ver esses dados. Se limpares os dados do site, desaparecem: por isso existe a cópia em ficheiro (Definições › Dados).',
        ],
      },
      {
        title: 'Sincronização pela tua cloud: OneDrive, Google Drive ou Dropbox (só se a ligares)',
        body: [
          'Sem conta, podes ligar a casa a uma pasta tua num destes serviços. A app leva-te à página do serviço (Microsoft, Google ou Dropbox) para entrares na tua conta e pede só acesso a uma pasta própria: no OneDrive, Aplicações/Wattometro; no Dropbox, Apps/Wattometro; no Google Drive, a pasta Wattometro em O meu disco, vendo apenas os ficheiros que a app lá criou. Não vê os teus outros ficheiros.',
          'Nessa pasta ficam a chave da casa, cifrada com a palavra-passe que escolheres e com a chave de recuperação, e ficheiros cifrados neste browser com a casa de cada aparelho e as cópias semanais. O serviço guarda-os nos seus termos, mas não os consegue ler.',
          'A autorização que o serviço dá à app fica guardada neste browser e só é enviada a esse serviço.',
          'No Google Drive há uma exceção: a Google só dá uma autorização duradoura a quem tem o segredo da app, que fica no servidor do Wattómetro. Por isso, ao entrares e ao renovar o acesso (cerca de uma vez por hora com a app aberta), o pedido passa pelo servidor, que junta o segredo e o envia à Google. O servidor não guarda nem regista esse pedido nem a resposta, e nunca vê os teus ficheiros.',
          'Ao desligares, a autorização é esquecida neste browser e os ficheiros ficam no teu serviço até os apagares lá. Para retirar de vez o acesso da app, remove-a nas definições da tua conta Microsoft, Google ou Dropbox.',
        ],
      },
      {
        title: 'Com conta: no servidor do Wattómetro, na UE',
        body: [
          'Com conta, os dados da casa (medições do Shelly, consumos da E-Redes, tarifário, equipamentos, aparelhos reconhecidos) ficam numa base de dados da Cloudflare na União Europeia, na conta do dono do projeto. As contas são criadas à mão; não há registo público.',
          'Da conta guarda-se o email e a palavra-passe em forma irreversível (hash). A sessão usa um único cookie, só para te manter com a sessão iniciada.',
          'Para travar tentativas de adivinhar palavras-passe, o endereço de onde chegam falhas de entrada guarda-se apenas em forma irreversível e é esquecido ao fim de 15 minutos.',
          'Para saber que páginas são usadas, conta-se só o número de visitas por página e por dia, sem utilizador, casa, endereço nem browser.',
        ],
      },
      {
        title: 'Outros serviços',
        body: [
          'IA (só se a usares): com a tua chave da Anthropic ou da Google, ou com a IA gratuita da Cloudflare, vão apenas a pergunta e resumos já calculados, nunca as medições em bruto. As chaves que guardares na conta ficam cifradas.',
          'Clima: a Open-Meteo recebe as coordenadas da localidade da casa, sem mais nada.',
          'Produção solar: o PVGIS recebe, pelo servidor, as coordenadas da localidade e os dados dos painéis, só quando carregas em «Calcular».',
          'Avisos no telemóvel ou no computador (só se os ativares): vão pelos serviços de notificações do browser, cifrados de ponta a ponta, sem medições.',
          'Não há publicidade, analytics de terceiros nem registos remotos com os teus consumos.',
        ],
      },
    ],
    back: 'Voltar à app',
  },
} as const;
