# Painel do administrador (Definições → Servidor)

Para quem gere a instalação ver se a app está perto dos limites do plano gratuito da Cloudflare, sem abrir o painel da Cloudflare.

## Quem vê

Só os emails no segredo `ADMIN_EMAILS` do Worker `api` (separados por vírgulas; maiúsculas não contam):

```bash
npx wrangler secret put ADMIN_EMAILS -c server/wrangler.toml
```

Os emails nunca entram no repositório. `GET /v1/auth/me` diz `admin: true` a esses utilizadores (a app mostra a secção "Servidor"); `GET /v1/admin/stats` responde 403 a todos os outros.

## O que mostra (só totais)

| Indicador | Origem | Limite (plano gratuito) |
|---|---|---|
| Linhas lidas hoje e nos últimos 7 dias (UTC) | `meta.rows_read` de cada resultado do D1, somado por pedido e por execução do Cron (`server/src/worker.ts`) em `maintenance_state` (`rows_read:AAAA-MM-DD`) | 5 000 000 por dia |
| Linhas escritas hoje e nos últimos 7 dias (UTC) | `meta.rows_written`, da mesma forma (`rows_written:AAAA-MM-DD`) | 100 000 por dia |
| Tamanho da base | Medido pelo Cron uma vez por dia | 500 MB |
| Agregações | Até onde o Cron agregou os minutos (a casa mais atrasada) e a última limpeza | O Cron corre de 5 em 5 min |
| Shelly | Por dispositivo ativo, sem nome: modelo, versão do script, última mensagem e minutos recebidos hoje (canal 0) contra os esperados desde a meia-noite de Lisboa | — |
| Contas | Número de utilizadores, casas e aparelhos com avisos | — |
| Visitas | Visitas por página e dia de Lisboa, nos últimos 30 dias | — |

Os contadores do D1 voltam a zero à meia-noite UTC, como os da Cloudflare. A contagem própria é uma aproximação: não conta o que o D1 lê ao aplicar migrações nem pedidos feitos fora do Worker (wrangler).

Quando as linhas lidas passam 80 % do limite, o Cron envia o aviso "Base de dados perto do limite" (`docs/alerts.md`) com ligação para este painel. O Início já não mostra a percentagem.

## Visitas (regra 1 do CLAUDE.md)

Sem Cloudflare Web Analytics nem outro serviço externo. A app envia `POST /v1/visit {page}` quando a sessão está aberta e muda de página; a página tem de ser uma das de `src/lib/pages.ts` (nunca o endereço escrito). Guarda-se só `(dia de Lisboa, página, número)` na tabela `page_views` (migração 0022): sem utilizador, casa, IP, browser nem hora. O Cron apaga as visitas com mais de 90 dias. A demonstração não envia nada.
