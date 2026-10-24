# Feriados

Consultado em **2026-10-24**. Usado pela previsão da fatura e pelas anomalias (Fase 6): num feriado o consumo da casa parece-se com o de um domingo. **Não** muda os períodos horários: em BTN um feriado segue o dia da semana (`docs/time-cycles.md`).

Código: `src/domain/holidays.ts`.

## Fontes

1. **Código do Trabalho, artigo 234.º, n.º 1**, na redação da **Lei n.º 8/2016, de 1 de abril** (Diário da República, 1.ª série, n.º 64, 1 de abril de 2016, p. 1112; em vigor desde 2 de abril de 2016):

   > "São feriados obrigatórios os dias 1 de janeiro, de Sexta-Feira Santa, de Domingo de Páscoa, 25 de abril, 1 de maio, de Corpo de Deus, 10 de junho, 15 de agosto, 5 de outubro, 1 de novembro, 1, 8 e 25 de dezembro."

   Cópia consultada: <https://www.garrigues.com/sites/default/files/noticias/files/l_8_2016.pdf> (reprodução da página do Diário da República). Não se encontrou alteração posterior ao n.º 1.
2. **Código do Trabalho, artigos 234.º, n.º 2, e 235.º** (via reproduções secundárias, p. ex. <https://informador.pt/?p=161486>): a Sexta-Feira Santa pode ser observada noutro dia com significado local na Páscoa; o **Carnaval** e o **feriado municipal** são facultativos.

## Regras na app

- **Fixos:** 1/1, 25/4, 1/5, 10/6, 15/8, 5/10, 1/11, 1/12, 8/12, 25/12.
- **Móveis**, a partir do Domingo de Páscoa (calendário gregoriano, algoritmo "anónimo" de Meeus/Jones/Butcher):
  - Sexta-Feira Santa = Páscoa − 2 dias
  - Domingo de Páscoa (já é domingo; listado por completude)
  - Corpo de Deus = Páscoa + 60 dias (quinta-feira a seguir ao domingo da Santíssima Trindade)
- Datas de controlo (Páscoa): 2024-03-31, 2025-04-20, 2026-04-05, 2027-03-28.
- Só os feriados de 2016-04-02 em diante têm Corpo de Deus, 5/10, 1/11 e 1/12; entre 2013 e 2015 esses quatro não eram feriados (Lei n.º 23/2012). A app aplica isto pela data.

## Fora por agora

- Carnaval e feriado municipal (facultativos, variam por casa). Podem vir a ser uma opção da casa, se a previsão mostrar erros nesses dias.
