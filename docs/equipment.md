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
cópia em ficheiro (formato local versão 3); na demonstração, três exemplos
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

## Fontes avaliadas e postas de lado

- **EPREL** (base europeia de etiquetas energéticas): responde por número de
  registo sem chave, mas não dá potência nem forma do ciclo, recusa pesquisa por
  modelo (403) e só cobre aparelhos com etiqueta. Testado em 2026-11-03.
- Procurar características na internet: números de outro modelo ou inventados.
