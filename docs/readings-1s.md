# Valores ao segundo (`readings_1s.data`)

Uma linha de `readings_1s` guarda um minuto de um canal de um aparelho. A coluna `data` é um BLOB binário com versão. O código que o lê e escreve é `src/lib/readings-1s.ts`, partilhado pelo servidor e pelo browser.

## Formato 1

| Bytes | Conteúdo |
|---|---|
| 0 | versão do formato (`1`) |
| 1–120 | 60 × **potência ativa** (W), int16 little-endian |
| 121–240 | 60 × **potência não ativa** `sqrt(S² − P²)` (VAr, sem sinal), int16 little-endian |
| 241–360 | 60 × **tensão** (decivolts, ex.: `2312` = 231,2 V), int16 little-endian |

- Total: **361 bytes** por minuto (≈ 0,5 MB por dia; ≈ 47 MB em 90 dias de retenção).
- A posição `i` de cada série é o segundo `i` do minuto (`ts + i`), com `ts` múltiplo de 60.
- **Segundo em falta:** `-32768` (`0x8000`). Nunca é zero: zero é uma medição válida.
- Valores válidos: −32767 a 32767. A potência ativa pode ser negativa (pinça invertida ou energia devolvida).

## Porquê estas grandezas

Para a deteção de aparelhos (Fase 8):
- **Potência ativa** com resolução de 1 W: os saltos que interessam são de dezenas de watts.
- **Potência não ativa** em vez do fator de potência: o FP da casa toda com 1 % de resolução esconde 70–145 VAr com 2 kW de base; a grandeza derivada no script a partir dos valores decimais tem resolução de ~1 VAr.
- **Tensão:** para normalizar a potência a 230 V (uma resistência de 2000 W consome ~9 % mais a 240 V do que a 230 V).

## Versões

Um formato novo recebe o número seguinte no byte 0. O descodificador continua a ler todas as versões anteriores (os dados ficam 90 dias; as assinaturas de calibração não expiram).
