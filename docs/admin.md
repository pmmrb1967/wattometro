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
| IA gratuita: neurons hoje e nos últimos 7 dias (UTC), e pedidos de hoje | Estimados a partir dos tokens de cada resposta do Workers AI (`server/src/ai-free.ts`, `docs/ai.md`), em `maintenance_state` (`ai_neurons:AAAA-MM-DD`, `ai_calls:AAAA-MM-DD`). Sem o binding `AI`, aparece "Desligada" | 10 000 por dia (a app para aos 9 000) |
| Tamanho da base | Medido pelo Cron uma vez por dia | 500 MB |
| Agregações | Até onde o Cron agregou os minutos (a casa mais atrasada) e a última limpeza | O Cron corre de 5 em 5 min |
| Cópias da base de dados | A hora da última `pnpm db:backup` (`maintenance_state`, `backup_at`; ver abaixo) | Marcada a partir de 8 dias |
| Shelly | Por dispositivo ativo, sem nome: modelo, versão do script, última mensagem e minutos recebidos hoje (canal 0) contra os esperados desde a meia-noite de Lisboa | — |
| Contas | Número de utilizadores, casas e aparelhos com avisos | — |
| Visitas | Visitas por página e dia de Lisboa, nos últimos 30 dias | — |

Os contadores do D1 voltam a zero à meia-noite UTC, como os da Cloudflare. A contagem própria é uma aproximação: não conta o que o D1 lê ao aplicar migrações nem pedidos feitos fora do Worker (wrangler).

Quando as linhas lidas passam 80 % do limite, o Cron envia o aviso "Base de dados perto do limite" (`docs/alerts.md`) com ligação para este painel. O Início já não mostra a percentagem.

## Visitas (regra 1 do CLAUDE.md)

Sem Cloudflare Web Analytics nem outro serviço externo. A app envia `POST /v1/visit {page}` quando a sessão está aberta e muda de página; a página tem de ser uma das de `src/lib/pages.ts` (nunca o endereço escrito). Guarda-se só `(dia de Lisboa, página, número)` na tabela `page_views` (migração 0022): sem utilizador, casa, IP, browser nem hora. O Cron apaga as visitas com mais de 90 dias. A demonstração não envia nada.

## Cópias da base de dados

Três proteções, para coisas diferentes. Decidido a 2026-11-24 (`planning/plan.md`, Decisões). Cada casa guarda também a sua própria cópia na app, à mão, e repõe-na juntando (`docs/backup.md`): é essa a que tem lembrete.

| | Time Travel (Cloudflare) | `pnpm db:backup` (este computador) |
|---|---|---|
| Para quê | Um erro recente: migração, purga ou script mal feitos | Perder a conta Cloudflare ou precisar de voltar mais atrás |
| Até onde volta | 7 dias no plano gratuito, 30 no Workers Paid ([documentação](https://developers.cloudflare.com/d1/reference/time-travel/), consultada a 2026-11-24) | As `BACKUP_KEEP` cópias guardadas (8 por omissão) |
| Onde fica | Na Cloudflare, na UE | Numa pasta tua, cifrada |

### Fazer uma cópia

No `.env` (ver `.env.example`): `BACKUP_DIR` (uma pasta **fora do repositório**), `BACKUP_PASSWORD` (mínimo 12 caracteres; guarda-a também num gestor de palavras-passe: sem ela nenhuma cópia abre) e, se quiseres, `BACKUP_KEEP`.

```bash
pnpm db:backup
```

- Faz `wrangler d1 export --remote` (com o login do wrangler deste computador), comprime o SQL, cifra-o no computador (PBKDF2-SHA256 com 600 000 iterações → AES-256-GCM, `scripts/backup/backup-file.ts`) e grava `wattometro-AAAA-MM-DDTHHMMZ.sql.gz.enc` em `BACKUP_DIR`. Apaga as cópias mais antigas além de `BACKUP_KEEP` (só ficheiros com este nome).
- **Para a ter também na cloud:** usa como `BACKUP_DIR` uma pasta sincronizada pelo programa do OneDrive, Google Drive ou Dropbox deste computador. O ficheiro é escrito primeiro como `.part` e só depois mudado de nome, para o programa da cloud nunca enviar meia cópia. O que lá vai está cifrado, por isso os dados das casas não ficam legíveis fora da Cloudflare (regra 1 do `CLAUDE.md`).
- **A base fica bloqueada enquanto exporta** (limitação do D1). O Shelly volta a enviar esses minutos depois, como em qualquer falha, mas a app não responde durante esse tempo: faz a cópia a uma hora calma. A exportação lê a base inteira, por isso conta para as linhas lidas do dia.
- **À mão, sem agendamento.** Escolhido pelo utilizador a 2026-11-24: nada de Agendador do Windows. Corre-se quando se quer, por exemplo antes de uma migração grande. Se o login do wrangler expirar, corre `pnpm exec wrangler login`.
- **Saber quando foi.** No fim de cada cópia, o script grava a hora em `maintenance_state` (`backup_at`: só a hora, nada da cópia). O painel (Definições › Servidor, "Cópias da base de dados") mostra há quanto tempo foi e marca-a a partir de 8 dias (`src/lib/backup.ts`). Não há aviso por notificação para esta cópia: o aviso de cópia é o da casa (`docs/backup.md`).

### Repor

**Até 7 dias atrás: Time Travel.** Substitui a base atual pelo estado nesse momento (devolve um marcador para desfazer):

```bash
pnpm exec wrangler d1 time-travel info wattometro -c server/wrangler.toml
pnpm exec wrangler d1 time-travel restore wattometro --timestamp=2026-11-24T04:00:00Z -c server/wrangler.toml
```

**A partir de um ficheiro: para uma base nova**, sem tocar na atual:

1. `pnpm db:backup --decrypt <ficheiro>` escreve o SQL na pasta temporária do sistema (ou em `--out <ficheiro.sql>`, nunca dentro do repositório).
2. `CLOUDFLARE_ACCOUNT_ID=<conta> pnpm exec wrangler d1 create wattometro-reposta --jurisdiction eu` (a conta está em `server/wrangler.toml`).
3. Em `server/wrangler.toml`, troca o `database_id` pelo da base nova (o `database_name` fica `wattometro`, para os comandos continuarem iguais).
4. `pnpm exec wrangler d1 execute wattometro --remote -c server/wrangler.toml --file <ficheiro.sql>`. O SQL traz as tabelas, os dados e a tabela das migrações aplicadas, por isso `pnpm db:migrate:remote` só aplica as que vieram depois da cópia.
5. `pnpm deploy:server` (ou um push ao `main`) e apaga o ficheiro `.sql`. A base antiga fica na Cloudflare até a apagares.
