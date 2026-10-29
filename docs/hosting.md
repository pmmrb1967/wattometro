# Capacidade e formas de abrir a app a outras pessoas

Análise de 29/10/2026, para decidir como divulgar o Wattómetro. Nada disto está feito; as tarefas estão em `planning/plan.md` (Fase 9).

## Limites da Cloudflare

Consultados a 29/10/2026:

| | Plano gratuito | Workers Paid (mínimo 5 USD/mês) |
|---|---|---|
| D1: linhas lidas | 5 milhões por dia | 25 mil milhões por mês incluídas |
| D1: linhas escritas | 100 mil por dia | 50 milhões por mês incluídas |
| D1: armazenamento | 500 MB por base, 5 GB por conta, 10 bases | 10 GB por base, 5 GB incluídos, 50 000 bases |
| Workers: pedidos | 100 mil por dia | 10 milhões por mês incluídos |
| Workers: CPU | 10 ms por pedido | 30 s por pedido |

No plano gratuito, ao passar um limite diário, o D1 recusa as consultas até à meia-noite UTC.

Fontes: [limites do D1](https://developers.cloudflare.com/d1/platform/limits/), [preços do D1](https://developers.cloudflare.com/d1/platform/pricing/), [preços dos Workers](https://developers.cloudflare.com/workers/platform/pricing/).

## Quanto gasta uma casa

Medido na base de produção (`wrangler d1 info`) nas 24 h até 29/10/2026, com uma casa com Shelly e um ano de E-Redes importado:

| | Uso | Parte do limite gratuito |
|---|---|---|
| Linhas lidas | 2 989 287 | 60 % |
| Linhas escritas | 52 272 | 52 % |
| Consultas de leitura / escrita | 13 251 / 9 351 | — |
| Tamanho da base | 10,2 MB (5 dias de Shelly) | 2 % |

**Conclusão:** no plano gratuito cabe **uma casa com Shelly**; uma segunda passaria os dois limites. As escritas vêm sobretudo do Shelly (uma linha por minuto em `readings_1m` e outra em `readings_1s`, mais as agregações do Cron); as leituras, do Cron e das páginas abertas.

Uma casa **só com a E-Redes** gasta muito menos: a importação de um ano escreve ~35 000 linhas uma vez, e depois só o que as páginas leem.

No Workers Paid, a esta taxa (~90 M de linhas lidas e ~1,6 M escritas por mês por casa com Shelly), o que limita são as **escritas**: as 50 M incluídas chegam para **cerca de 30 casas com Shelly** (as leituras incluídas chegariam para ~270). Acima disso, cada milhão de linhas escritas custa 1 USD, ou seja ~1,6 USD por mês por casa com Shelly. Casas só com a E-Redes quase não contam.

## Opções para quem quiser usar a app

### 1. Modo local, só com a E-Redes, sem conta (recomendada para divulgar)

A pessoa abre a app, carrega o CSV da E-Redes e tudo fica no browser (IndexedDB), sem passar pelo servidor.

- **Custo:** zero. Os ficheiros estáticos (Workers Assets) não contam para os limites do plano gratuito.
- **Escala:** sem limite de pessoas; o servidor não guarda nada.
- **Privacidade:** a melhor; não há dados pessoais no servidor nem RGPD de contas.
- **Base existente:** a demonstração já responde à API dentro do browser (`src/demo/`); o modo local seria isso com os dados da pessoa guardados no Dexie.
- **O que dá:** tarifários (ofertas ERSE), potência contratada aproximada, consumo base, fatura prevista, carro elétrico, painéis solares (o PVGIS teria de ser pedido pelo Worker sem sessão, só com coordenadas).
- **O que não dá:** tudo o que precisa do Shelly (aparelhos, tensão, avisos, tempo real) e a sincronização entre aparelhos.

### 2. Cada pessoa na sua conta Cloudflare gratuita (para quem tem Shelly)

Funciona hoje, seguindo o README ("Usar o código na tua própria instalação"): conta Cloudflare própria, base D1 na UE, `account_id` e `database_id` nos `wrangler*.toml`, `SESSION_SECRET`, deploy e `pnpm user:create`. O código da app não muda (o endereço de envio do Shelly vem de `window.location.origin`). Exige terminal e alguma prática.

Para o tornar fácil, o botão [Deploy to Cloudflare](https://developers.cloudflare.com/workers/platform/deploy-buttons/) copia o repositório para o GitHub da pessoa, cria a base D1 e pede os segredos. Limitações a resolver antes:

- o botão publica **um** Worker; a app tem dois (`app` e `api`): juntá-los num só, ou um botão por Worker;
- monorepos não são totalmente suportados;
- as migrações D1 têm de correr no script `deploy`;
- a primeira conta teria de ser criada numa página da app (primeiro acesso), não por script;
- **confirmar que a base fica na jurisdição UE** (regra 1); não verificado.

### 3. Instalar em casa (Raspberry Pi, Docker, Home Assistant)

O Hono corre em Node e os testes do servidor já usam SQLite em memória (`server/test/sqlite.ts`). Faltaria uma entrada Node (servidor HTTP + `setInterval` no lugar do Cron) e um adaptador `Sql` para SQLite em ficheiro. Gratuito e os dados ficam em casa, mas exige mais de quem instala; o Shelly enviaria para o endereço local.

### 4. Instância partilhada no plano pago

A mais fácil para quem usa (só se regista), mas não é gratuita e exige:

- Workers Paid (5 USD/mês até ~30 casas com Shelly; depois ~1,6 USD por casa e por mês, ou menos se se reduzirem as linhas escritas);
- registo público, recuperação de password (implica um serviço de email, a autorizar pela regra 1) e limites por IP;
- política de privacidade, exportação e eliminação de dados (RGPD);
- o dono passa a ser responsável pelos dados de outras pessoas.

## Recomendação

1. Divulgar com o **modo local** (opção 1): gratuito, sem limite de pessoas e sem dados no servidor.
2. Para quem tem Shelly, a **conta Cloudflare própria** (opção 2), primeiro pelo README, depois com o botão.
3. A **instância partilhada** (opção 4) só quando houver procura que justifique o custo e as obrigações.

Reduzir as linhas por casa (por exemplo, juntar `readings_1m` e `readings_1s` numa só linha por minuto, ou agregar com menos frequência) aumenta a capacidade de todas as opções com servidor.
