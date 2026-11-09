# Equipamentos da casa

Registo opcional do que a casa tem (`src/domain/equipment.ts`, migração
`0026_equipment.sql`, página `/equipamentos`), para ajudar a ligar o que o
Shelly mede a equipamentos concretos. Desenho completo:
`docs/superpowers/specs/2026-11-03-equipment-inventory-design.md`.

## O que se guarda

- Nome (obrigatório, único na casa sem distinguir maiúsculas), tipo (lista
  fechada), marca, modelo, divisão, potência da chapa em W, classe energética,
  notas.
- Para máquinas de lavar roupa e loiça, os programas do manual: nome, duração
  (s), energia por ciclo (Wh inteiros), temperatura e carga opcionais.
- **Não se guarda:** número de série, fotografias (nem no servidor nem no
  IndexedDB), nada vindo da internet.

Na conta, no D1 (`equipment`, com `household_id`); sem conta, no IndexedDB e na
cópia em ficheiro (formato local versão 3); na demonstração, quatro exemplos
inventados.

## Ligação aos aparelhos reconhecidos

`appliances.equipment_id` liga um descritor do NILM a um equipamento. O nome do
equipamento manda: ligar dá-lhe esse nome (e às calibrações com o nome antigo),
mudar o nome do equipamento muda-o em todos, apagar o equipamento desliga-os sem
os apagar. Um aparelho novo nomeado com o nome de um equipamento fica ligado.
Nas listas de aparelhos e calibrações, um aparelho ligado não tem campo de nome.

## A chapa é um teto

Medido em 2026-10 e 2026-11 na casa do autor: uma airfryer de chapa 2200 W tirou
2,08 kW (95 %); uma máquina de lavar de chapa 2100 W aqueceu a 1,90–1,96 kW
(92 %). Por isso um grupo é compatível com um equipamento quando a potência a
230 V do primeiro estado não passa de **110 % da chapa** (`fitsPlate`). Os
compatíveis aparecem primeiro ao dar nome; os outros ficam com aviso. Nunca se
bloqueia: a chapa pode ter sido mal escrita.

## Programas do manual

O Regulamento Delegado (UE) 2019/2014 (etiquetagem) e o Regulamento (UE)
2019/2023 (conceção ecológica) das máquinas de lavar roupa obrigam a indicar, por
programa principal, a duração e a energia por ciclo (consultado em 2026-11-03).
A app compara cada programa inteiro medido (ciclos com aquecimentos,
`src/nilm/programmes.ts`) com a tabela escrita pelo utilizador
(`src/domain/equipment-programmes.ts`):

- programa provável: o de duração mais próxima, se a diferença for até **25 %**
  da duração dele; senão, "programa não identificado" (um programa cortado no
  fim pela deteção fica curto e cai aqui, em vez de num programa errado);
- energia: diferença em percentagem inteira para a do manual.

O manual mede em condições de ensaio (carga e temperatura da água): a diferença
mostra-se como comparação, nunca como defeito, e não há conclusão de desgaste.

## Ler de fotografias (com IA)

Só com a chave de IA do utilizador; sem ela o formulário é o mesmo
(`src/app/EquipmentPhotos.tsx`).

- Até **3 fotografias** de cada vez: chapa, etiqueta energética, tabela de
  programas do manual.
- No browser, cada fotografia é reduzida ao que a API lê (até ~1,15 MP e 1568 px
  no lado maior) e desenhada outra vez em JPEG, o que deixa de fora os metadados
  da câmara (EXIF: localização, data, aparelho) — `src/lib/image.ts`.
- Vai diretamente para `api.anthropic.com` com a chave do utilizador; nunca
  passa pelo Worker e não fica guardada em lado nenhum. O custo estimado
  (~1600 tokens por fotografia, por excesso) mostra-se sempre antes de enviar,
  mesmo com o envio automático ligado.
- A IA **copia o texto impresso** ("2,1 kW", "0,46 kWh", "3 h 48 min"), sem
  converter nem calcular (`src/ai/prompts/equipment-photo.ts`, com versão);
  a resposta é validada com zod e tentada mais uma vez no máximo. A resposta
  não tem campo para números de série.
- Os números lê-os o código (`src/domain/equipment-reading.ts`, com
  `parsePrintedPowerW`/`parsePrintedEnergyWh` em `src/lib/units.ts` e
  `parsePrintedDurationS` em `src/lib/time.ts`), com as regras do registo; um
  programa sem duração ou energia legível fica de fora, com aviso. Uma gama de
  potência ("1850-2200 W") dá o topo, o teto da chapa.
- O utilizador confirma valor a valor (`src/app/photo-choices.ts`): vem marcado
  o que preenche um campo vazio; o que substituiria um valor diferente, ou um
  programa do mesmo nome, vem por marcar. Nada é gravado sem "Guardar".

Sem IA, um OCR no browser (Tesseract.js) poderia ler a chapa (potência, marca,
modelo), mas não as colunas de uma tabela; fica como passo seguinte possível.

## Onde vai o consumo (estimativa, só com a E-Redes)

Numa casa sem Shelly, os quartos de hora da E-Redes só dão a soma da casa: a
15 minutos, uma máquina de 2 kW durante 20 minutos parece uma de 700 W durante
uma hora. A app não tenta reconhecer aparelhos nesses dados; faz a conta com o
que o utilizador indica de cada equipamento e compara com o medido
(`src/domain/equipment-estimate.ts`, cartão em `src/app/ConsumptionEstimate.tsx`).

Sem valores típicos: só entram números do utilizador, da etiqueta energética do
próprio equipamento ou da chapa, e o uso que ele indica. Um equipamento sem
estimativa não conta e aparece como "sem estimativa"; o resto fica por explicar.

Unidade do consumo na etiqueta energética (consultado em 2026-11-04):

| Produtos | Regulamento delegado (UE) | Na etiqueta |
|---|---|---|
| Frigoríficos e arcas | 2019/2016 | kWh/ano |
| Máquinas de lavar roupa | 2019/2014 | kWh/100 ciclos (programa eco 40-60) |
| Máquinas de lavar loiça | 2019/2017 | kWh/100 ciclos (programa eco) |
| Máquinas de secar roupa | 2023/2534 | kWh/100 ciclos (média ponderada) |
| Televisões e monitores | 2019/2013 | kWh/1000 h (SDR e HDR) |

Fontes: página da Comissão Europeia sobre a etiqueta das máquinas de lavar
loiça (energy-efficient-products.ec.europa.eu, "energy consumption for 100
cycles") e dos ecrãs ("energy consumption in SDR and HDR", Regulamento
2019/2013); EUR-Lex, Regulamento Delegado (UE) 2023/2534 (máquinas de secar,
consumo ponderado por 100 ciclos); Wikipédia, "European Union energy label"
(frigoríficos, kWh por ano); Topten e fabricantes (TV, kWh/1000 h).

A conta, em Wh inteiros, para os últimos 30 dias de dados:

- etiqueta por ano: `kWh/ano × dias / 365`;
- por 100 ciclos: `kWh/100 × ciclos por semana × dias / 700`;
- por 1000 h: `kWh/1000 h × minutos por dia × dias / 60 000`;
- chapa: `W × minutos por dia × dias / 60`. A chapa é um teto (a medida costuma
  ficar abaixo), por isso fica por cima.

Os dias são o tempo que os quartos de hora cobrem (quartos / 96): um dia com
dados só até ao meio-dia conta meio dia, e o dia de 25 h conta 25/24. Um
equipamento pela chapa sem a potência da chapa fica de fora e é dito à parte.

O custo de cada um é a sua parte do custo da energia desses dias (energia, IEC e
IVA; sem o termo de potência), ao preço médio, com o tarifário em vigor em cada
dia; os dias antes do primeiro tarifário levam o preço médio dos outros. O
frigorífico e a arca (etiqueta por ano) mostram-se também em potência média
(`kWh/ano / 8760 h`) ao lado do consumo base medido de noite (`baseload.ts`).

O cartão aparece só numa casa sem Shelly; com Shelly, cada aparelho tem o que o
Shelly mediu. A leitura de fotografias lê também a energia da etiqueta com a
unidade ("58 kWh/100", `parsePrintedLabelEnergy` em `src/lib/units.ts`), que o
utilizador confirma como os outros valores.

## Fontes avaliadas e postas de lado

- **EPREL** (base europeia de etiquetas energéticas): responde por número de
  registo sem chave, mas não dá potência nem forma do ciclo, recusa pesquisa por
  modelo (403) e só cobre aparelhos com etiqueta. Testado em 2026-11-03.
- Procurar características na internet: números de outro modelo ou inventados.
