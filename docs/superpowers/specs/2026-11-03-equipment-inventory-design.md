# Equipamentos da casa: registo e ajuda à identificação (fases 1 e 2)

Data: 2026-11-03. Estado: para aprovação.

## Intenção

O utilizador conhece os equipamentos da sua casa; a app só vê potência ao
segundo. Um registo **opcional** dos equipamentos (nome, marca, modelo,
divisão, potência da chapa, programas do manual) tem dois propósitos, nas
palavras do utilizador:

1. ficar com um registo dos principais equipamentos da casa;
2. ser um **facilitador** para a app ligar consumos a equipamentos, com mais
   precisão.

Validado em 2026-11-03 com equipamentos reais da casa do autor (dados em
`fixtures/private/appliances/`, fora do Git):

- **A chapa é um teto, não o valor medido.** Airfryer Moulinex AL402: chapa
  2200 W, medido 2,08 kW (95 %). Máquina LG F4WV5009S0W: chapa 2100 W,
  aquecimento medido 1,90–1,96 kW (92 %). Um grupo bem acima da chapa não pode
  ser esse equipamento; abaixo, pode (um fogão usa uma só zona).
- **A tabela de programas do manual é a fonte mais útil por modelo.** O
  regulamento (UE) 2019/2023 obriga o fabricante de máquinas de lavar a
  publicar, por programa principal, a duração, a energia por ciclo e a água.
  As lavagens calibradas (1 h 29–1 h 30, 0,54–0,57 kWh) batem com o programa
  "Mix" do manual (1 h 21, 0,458 kWh): o utilizador confirmou que é o mais
  usado. Gastaram 18–24 % mais do que o manual.
- **Não há fonte credível da "assinatura" por modelo.** A EPREL (base da UE)
  responde por número de registo sem chave, com energia do ciclo Eco, duração
  e espera, mas não dá a potência nem a forma do ciclo, recusa pesquisa por
  modelo (403) e só cobre aparelhos com etiqueta energética. A forma do ciclo
  depende do tipo de aparelho, não da marca; a assinatura continua a vir das
  medições e calibrações.

## Objetivos

**Fase 1, registo e ligação**

- Registar equipamentos com: nome (obrigatório), tipo, marca, modelo, divisão,
  potência da chapa (W), classe energética, notas. Tudo opcional menos o nome.
  Cada campo dá valor sozinho; nada é obrigatório para usar a app.
- Ligar os aparelhos reconhecidos (`appliances`, os descritores do NILM) a um
  equipamento do registo: em vez de "1,96 kW", "Máquina da roupa · lavandaria".
- Ao dar nome a um grupo ("Dar nome", "Mudar o nome", "Reconhecer nos outros
  dias"), propor primeiro os equipamentos registados **compatíveis com a
  chapa**; continuar a aceitar texto livre.
- Na página "Calibrar aparelhos", mostrar os equipamentos registados que ainda
  não têm nenhum aparelho reconhecido ligado ("Por calibrar").
- Funcionar em todos os modos: conta (D1), sem conta (IndexedDB) e
  demonstração (com alguns equipamentos de exemplo).

**Fase 2, programas do manual**

- Num equipamento, escrever à mão a tabela de programas: nome, duração,
  energia por ciclo; temperatura e carga opcionais.
- Para cada uso reconhecido de um equipamento com programas, indicar o
  **programa provável** (o de duração mais próxima, dentro de uma tolerância)
  e comparar a energia medida com a do manual ("Mix: manual 0,46 kWh, esta
  lavagem 0,57 kWh, +24 %").
- Na página do equipamento, os últimos usos com programa e diferença, e a
  diferença média. Só com Shelly. Sem conclusão de desgaste nesta fase (ver
  "Decisões minhas").

## Não objetivos (agora)

- Fase 3, separar Airfryer e fogão pelo ritmo dos impulsos: tarefa à parte,
  depois destas fases (não depende do registo).
- Fase 4, a IA ler a fotografia da chapa ou da tabela: depois destas fases.
  Regras já decididas pelo utilizador: **as imagens não ficam gravadas na
  base de dados** (nem no servidor nem no IndexedDB); ficam só os números,
  depois de o utilizador confirmar cada um (regra 3 do projeto).
- Ficha EPREL pelo QR da etiqueta: talvez mais tarde; acrescenta pouco ao
  manual.
- Fase 5, estimativas de "onde vai o consumo" para quem só tem a E-Redes,
  usando o registo: depois destas fases, com desenho próprio.
- Juntar a centrifugação à lavagem como um só uso: é uma mudança na deteção
  (`src/nilm/`), não no registo.
- Procurar características na internet: rejeitado (regra 6, números
  inventados ou de outro modelo).

## Anti-objetivos (falharia mesmo a funcionar)

- Parecer um formulário obrigatório, ou pedir dados para mostrar coisas que já
  se mostravam.
- Bloquear um nome por a chapa não bater (o utilizador pode ter escrito mal a
  chapa); o filtro só ordena e avisa.
- Apresentar o manual como medição, ou a diferença como defeito: é
  "comparado com o manual", e o manual mede em condições de ensaio.
- Pedir ou guardar o número de série (identifica o aparelho; não serve para
  nada aqui).

## Restrições (do `CLAUDE.md`)

- Unidades inteiras: potência em W, energia em **Wh** (0,458 kWh → 458),
  durações em segundos. Conversões em `src/lib/units.ts`.
- `household_id` em todas as tabelas; SQL só em `server/src/repo/`; migração
  nova com teste; rotas em `/v1/...`, validadas com zod.
- Modo sem conta: `src/local/server.ts` responde às rotas novas; o formato
  local sobe `LOCAL_VERSION` com um passo em `MIGRATIONS`, e a cópia em
  ficheiro inclui o registo. Demonstração em `src/demo/server.ts`.
- Texto em pt-PT em `src/i18n/pt-PT.ts`; lógica em `src/domain/` testada com
  casos à mão; sem `any`; cabeçalho SPDX.
- Sem ligações externas novas; sem IA nestas fases.
- Orçamento D1 de 500 MB: um equipamento é uma linha pequena; nada de imagens.

## Decisões do utilizador

- O registo é sempre opcional, apresentado como facilitador da identificação.
- Campos: nome, marca, modelo, potência, classe, divisão da casa "etc.".
- Fases 1 e 2 agora; depois, as fases 3, 4 (sem guardar imagens) e 5.

## Decisões minhas (o utilizador pode mudar)

- **Nome na app:** "Equipamentos" (o que a casa tem), para não confundir com
  "Aparelhos" (o que a app reconhece nas medições). Página própria
  `/equipamentos`, com entrada em Consumo › Aparelhos e em Definições.
- **Tipo:** lista fechada pequena, guardada como código (`washer`, `dishwasher`,
  `dryer`, `fridge`, `freezer`, `oven`, `hob`, `microwave`, `airfryer`,
  `kettle`, `coffee`, `heater`, `air_conditioner`, `water_heater`, `ev_charger`,
  `tv`, `computer`, `other`), com os nomes em pt-PT no i18n. Os programas só
  aparecem para máquinas de lavar roupa e loiça.
- **Divisão:** texto livre com sugestões das divisões já usadas na casa.
- **Ligação:** coluna nova `equipment_id` (anulável) em `appliances`. Vários
  descritores podem ligar ao mesmo equipamento (os programas de uma máquina já
  são vários descritores com o mesmo nome). O nome do equipamento manda:
  mudar o nome do equipamento muda o `label` dos descritores ligados; apagar o
  equipamento desliga-os (não os apaga).
- **Ligar os já existentes:** ao registar um equipamento com o mesmo nome de
  aparelhos já reconhecidos, propor ligá-los (sem o fazer sozinho).
- **Teto da chapa:** um grupo é compatível quando a potência a 230 V do seu
  primeiro estado não passa de 110 % da chapa. Os compatíveis aparecem
  primeiro; os outros ficam disponíveis com um aviso. Sem chapa, é compatível.
- **Programa provável:** o de duração mais próxima, se a diferença for até
  25 %; senão "programa não identificado". A diferença de energia mostra-se em
  percentagem, arredondada à unidade.
- **Limites:** 100 equipamentos por casa; 20 programas por equipamento.
- **"O que está sempre ligado"** (`always_on`) fica como está; juntá-lo ao
  registo fica para depois.
- **Nomes únicos:** o nome de um equipamento é único na casa (sem distinguir
  maiúsculas), no servidor, no modo sem conta e na demonstração. A app já
  agrupa aparelhos, custos e programas pelo nome; dois "Aquecedor" somariam
  num só. O utilizador já distingue assim ("Aquecedor 1R", "Aquecedor 2R").
- **Ligar liga todos os descritores com esse nome**, como a app já os trata
  como um aparelho.
- **Um equipamento com vários níveis** (decidido com o utilizador a
  2026-11-03): o aquecedor de dois botões foi nomeado como dois aparelhos,
  "Aquecedor 1R" (621 W) e "Aquecedor 2R" (1453 W). Com o registo, é um só
  equipamento: ao ligar, pode escolher-se aparelhos reconhecidos de **nomes
  diferentes** para o mesmo equipamento, e todos passam a ter o nome dele. O
  nível vê-se pela potência ("Aquecedor · 1,45 kW"); a app já escolhe o
  descritor pela potência medida. Limite conhecido, para a fase 3: ligar o
  segundo botão com o primeiro já ligado dá dois degraus (+620 W e depois
  +830 W), e o segundo não é nenhum dos níveis.
- **Mudar nomes depois de ligado:** o nome muda-se só no equipamento, e isso
  muda o `label` dos descritores ligados **e das calibrações** (`signatures`)
  com o nome antigo, na mesma escrita. Em "Aparelhos que a app reconhece" e em
  "Aparelhos calibrados", um aparelho ligado mostra o nome sem campo de edição
  e com ligação ao equipamento. "Mudar o nome" no cartão "Ao segundo" continua
  a ser uma correção ("não é este"): cria um descritor à parte para o outro
  nome, como hoje.
- **"Por calibrar"** é um equipamento sem nenhum aparelho reconhecido ligado.
  As calibrações não ganham `equipment_id`: ligam-se pelo nome.
- **Usos para o programa provável:** só os programas inteiros que a deteção já
  junta (ciclos com `heats`, `src/nilm/programmes.ts`): máquinas de lavar
  roupa e loiça. A tabela de programas só se pede para esses dois tipos; a
  máquina de secar fica de fora até a deteção juntar os seus programas. Sem
  mudanças na deteção nesta fase. Quando a deteção corta o fim de um programa
  (a cauda do motor), a duração fica curta e o resultado é "programa não
  identificado", não um programa errado.
- **Sem "a crescer" nem "desgaste":** a página mostra os usos e a diferença
  média ao manual, sem conclusão. Um critério de desgaste precisa de meses de
  dados reais para ser calibrado; fica para depois, com dados.

## Deixado a quem constrói

- Formato exato das tabelas e das rotas (um JSON de programas na linha do
  equipamento, ou uma tabela à parte), dentro das restrições acima.
- Desenho dos ecrãs, seguindo o estilo atual (cartões, `.form`).
- Onde o programa provável aparece no cartão "Ao segundo" (no grupo, ou só ao
  abrir as vezes) e quantos usos entram na diferença média.
- Os equipamentos de exemplo da demonstração.
- Documentação em `docs/` e a decisão no `planning/plan.md`.
