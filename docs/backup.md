# Cópia da casa (com conta)

Em **Definições › Dados e Shelly › Cópia da casa**, cada utilizador com conta guarda a sua casa num ficheiro cifrado e repõe-na a partir dele. Decidido pelo utilizador a 2026-11-24 (`planning/plan.md`, Decisões): cópias feitas à mão na app, sem agendamento; a casa de cada utilizador, não a base inteira; repor junta, nunca substitui. O modo sem conta tem a sua própria cópia, em JSON (`docs/local-mode.md`). A cópia da base inteira, à mão pelo administrador, está em `docs/admin.md`.

## O que entra

O formato está em `src/backup/format.ts`, partilhado pela app e pelo servidor. Cada secção é uma tabela, com as linhas em tuplos pela ordem das colunas. A ordem das secções é a de escrever e de repor: as pequenas primeiro.

| Secção | Tabela |
|---|---|
| `household` | zona de qualidade e localidade (`households`), `household_installation`, `household_budget` |
| `tariffs`, `devices`, `equipment`, `appliances`, `alwaysOn` | as tabelas com esses nomes (`always_on`) |
| `signatures`, `signatureSeconds` | calibrações, com os segundos copiados |
| `outages`, `daily`, `quarters`, `voltage`, `nilmDays` | `outages`, `daily`, `readings_15m` (Shelly e E-Redes), `voltage_10m`, `nilm_days` |
| `minutes` | `readings_1m` |

Fica de fora:
- `readings_1s` (90 dias): expira sozinha, e os aparelhos encontrados nesses segundos estão em `nilm_days`;
- a conta (email e palavra-passe), as subscrições de avisos e as chaves de IA (cifradas com um segredo do servidor);
- o que não é da casa (preços OMIE, contadores do servidor, visitas).

Os dispositivos levam o `token_hash`. Numa base nova, um Shelly que já enviava continua a enviar com o mesmo token. Numa base onde o dispositivo já existe, nada muda: um token revogado continua revogado.

## O ficheiro

`wattometro-casa-AAAA-MM-DD.wmbk` (dia de Lisboa). Dentro, depois de aberto, há uma linha por página:
- a primeira linha é `{"format":"wattometro-casa","version":1,"createdAt":…,"householdName":…}`;
- cada linha seguinte é `["secção",[[…],…]]`.

Os blobs vão em base64url. O ficheiro é comprimido com gzip e cifrado no browser com a **palavra-passe da conta**: PBKDF2-SHA256 com 600 000 iterações, depois AES-256-GCM, com o cabeçalho autenticado (`src/backup/seal.ts`). É o mesmo formato de envelope da cópia do administrador ("WMBK", versão 1), por isso `pnpm db:backup --decrypt <ficheiro>` também abre estas cópias.

- **Antes de cifrar**, a app confirma a palavra-passe no servidor (`POST /v1/backup/password`, com os limites do login). Uma palavra-passe mal escrita daria uma cópia que nunca abre.
- **Se mudares a palavra-passe**, as cópias antigas abrem com a palavra-passe que tinhas quando as guardaste.
- **Se esqueceres essa palavra-passe**, essas cópias não abrem. Não há outra chave.

## Onde fica

- **No Chrome e no Edge de um computador**, escolhe-se uma pasta uma vez (File System Access API), e o browser lembra-a (`src/backup/folder.ts`, IndexedDB `wattometro-backup`). O browser só mostra o nome da pasta, nunca o caminho, e pode pedir de novo autorização ao primeiro clique de cada sessão.
- **Para a cópia ir também para a cloud**, escolhe-se uma pasta sincronizada pelo OneDrive, Google Drive ou Dropbox do PC. O browser escreve num ficheiro temporário e só o troca pelo final quando está completo, por isso o programa da cloud nunca envia meia cópia.
- **No telemóvel, no Firefox e no Safari**, o ficheiro vai para as transferências.

O servidor guarda só a data da última cópia (`household_backup`, migração 0033, gravada com `POST /v1/backup/done` depois de o ficheiro estar escrito).

## Limites do plano gratuito

**Fazer a cópia** lê a casa toda: cerca de um milhão de linhas por ano de minutos de um Shelly com dois canais, ou seja, 20 % do limite diário de 5 000 000.
- A secção mostra antes uma estimativa, feita a partir dos totais diários (`backupEstimate`).
- O servidor lê página a página ao longo das chaves primárias (2000 linhas por página nos minutos), nunca a tabela inteira (`server/src/repo/backup.ts`; os testes verificam o plano de cada consulta).
- Quando as linhas lidas do dia passam 60 % do limite (`EXPORT_READ_SHARE`), responde 503 `busy`. A app diz a que horas tentar de novo, a meia-noite UTC.

**Repor** escreve linhas, e o plano gratuito permite 100 000 por dia. Cada linha de minutos conta duas vezes, por causa do índice, por isso um ano de minutos leva várias semanas.
- O servidor deixa de aceitar quando as escritas do dia passam 60 % do limite (`RESTORE_WRITE_SHARE`). Os outros 40 % ficam para o Shelly e para o Cron.
- O browser guarda o ficheiro ainda cifrado, a chave sem a poder exportar (`CryptoKey` não extraível) e até onde chegou.
- Continua sozinho sempre que a app abre depois da meia-noite UTC (`resumeRestore` em `AppShell`), e a secção mostra a percentagem.
- As secções pequenas e os quartos de hora vêm primeiro, e os minutos no fim.
- Terminar a sessão para a reposição e apaga o ficheiro deste browser; o que já foi reposto fica.

## Repor = juntar

`INSERT OR IGNORE`: o que a casa já tem fica como está, e só entra o que falta.
- Repor a mesma cópia duas vezes não escreve nada.
- As definições (zona, localidade, instalação, orçamento) só entram se a casa ainda não as tiver.
- O servidor deixa de fora as linhas de dispositivos ou calibrações de outra casa.
- Uma ligação a um equipamento que a casa não tem é apagada, e o aparelho fica.
- Cada pedido leva até 500 linhas e até 1 MB (`MAX_RESTORE_ROWS`, `MAX_RESTORE_BYTES`), validadas com zod pelo esquema da secção.

## Lembrete

"Lembrar-me de fazer uma cópia" pode ser ao fim de 7 dias (por omissão), 15 dias, 1 mês ou nunca.
- **Na app:** quando passa o prazo, ou se nunca houve cópia, a secção e o Início mostram o aviso (`isBackupLate`).
- **Por notificação:** é o aviso "É altura de guardar uma cópia da casa", em Definições › Avisos (`decideBackup`, `docs/alerts.md`). Vem de manhã e de novo uma semana depois enquanto durar.

## API

| Rota | O quê |
|---|---|
| `GET /v1/backup` | `{lastAt, remindDays, estimateRows, rowsReadLimit}` |
| `PUT /v1/backup/reminder` | `{days: 7 \| 15 \| 30 \| 0}` |
| `POST /v1/backup/password` | `{password}` → 204, 403, 429 |
| `GET /v1/backup/export?section&cursor` | `{rows, next}`; 503 `busy` |
| `POST /v1/backup/done` | `{lastAt}` |
| `POST /v1/backup/restore` | `{section, rows}` → `{written}`; 400, 413, 503 `busy` |

A demonstração não mostra a secção. O modo sem conta tem a sua própria cópia.
