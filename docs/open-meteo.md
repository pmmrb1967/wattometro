# Clima (Open-Meteo)

Consultado em **2026-10-24**. Base da Fase 6 (previsão da fatura do mês, anomalias).

## Fontes

1. **Open-Meteo, Historical Weather API**: <https://open-meteo.com/en/docs/historical-weather-api>
2. **Open-Meteo, Weather Forecast API**: <https://open-meteo.com/en/docs>
3. **Open-Meteo, Geocoding API**: <https://open-meteo.com/en/docs/geocoding-api>
4. **Open-Meteo, Terms & Privacy**: <https://open-meteo.com/en/terms>

## Pedidos usados pela app

Todos feitos **no browser** (a CSP em `security-headers.ts` autoriza estes três endereços). Nenhum leva dados de consumo.

| Para quê | Endereço | Parâmetros |
|---|---|---|
| Histórico | `https://archive-api.open-meteo.com/v1/archive` | `latitude`, `longitude`, `start_date`, `end_date` (`aaaa-mm-dd`), `hourly=temperature_2m`, `timeformat=unixtime` |
| Dias recentes e previsão | `https://api.open-meteo.com/v1/forecast` | `latitude`, `longitude`, `hourly=temperature_2m`, `timeformat=unixtime`, `past_days` (0–92), `forecast_days` (0–16, por omissão 7) |
| Localidade → coordenadas | `https://geocoding-api.open-meteo.com/v1/search` | `name` (≥ 2 caracteres; com 3 ou mais, prefixo sem acentos nem maiúsculas), `count` (≤ 100), `language=pt`, `countryCode=PT` |

- **Resposta (histórico e previsão):** `hourly.time` (com `timeformat=unixtime`, segundos UTC) e `hourly.temperature_2m` (°C, pode ter `null`), `hourly_units`, `utc_offset_seconds`, `timezone`. Sem `timezone`, as horas são GMT — é o que a app quer (guarda UTC e converte para Lisboa em `src/lib/time.ts`).
- **Resposta (geocodificação):** `results[]` com `id`, `name`, `latitude`, `longitude`, `country_code`, `admin1`, `admin2`, `admin3`, `population`, `postcodes`; campos vazios são omitidos; sem resultados, `results` não vem.
- **Erros:** HTTP 400 com `{"error": true, "reason": "…"}`.
- Tudo é validado com zod (`src/weather/`).

## Atrasos e horizontes

- Histórico, modelo por omissão "Best match" (ECMWF IFS HRES + ERA5 + ERA5-Land): ERA5/ERA5-Land com **5 dias de atraso**; IFS sem atraso. ERA5 desde 1940.
- Previsão: até **16 dias** para a frente e até **92 dias** para trás (`past_days`). A app usa o arquivo para o que tem mais de ~10 dias e a previsão (`past_days`) para os dias recentes e os 16 dias seguintes.
- Para os dias do mês para lá da previsão, a app usa a **média histórica** da temperatura dessa altura do ano (calculada a partir do arquivo).

## Limites e licença (uso não comercial)

- Gratuito para uso **não comercial** (apps privadas, sem publicidade nem subscrições, "personal home automation"). Limites por IP: **600 pedidos/min, 5 000/h, 10 000/dia, 300 000/mês**. A app faz poucos pedidos por dia por utilizador (cache no browser).
- Dados sob **CC BY 4.0**: a app mostra "Dados meteorológicos: Open-Meteo" com link onde mostra temperaturas. Localidades com base no **GeoNames** (atribuição pedida pela Geocoding API).
- Uso comercial (Fase 9, grande público com publicidade ou subscrições) exige plano pago com `apikey` e endereço `customer-…` — rever antes dessa passagem.

## Privacidade

- A Open-Meteo guarda os IP e os URL (com as coordenadas) nos registos do servidor durante **90 dias**.
- Por isso a app só envia coordenadas arredondadas a **0,01°** (~1 km), nunca a morada. Ficam guardadas em `households` (migração `0010`). Duas formas de as indicar, em Definições:
  - **Pesquisa pelo nome** da localidade: o centro dado pela geocodificação. A geocodificação da Open-Meteo **não conhece códigos postais portugueses** (testado a 2026-10-24 com `4455-237` e `4455`: sem resultados) — procura-se pelo nome da localidade.
  - **Localização do dispositivo** (`navigator.geolocation`, baixa precisão), só quando o utilizador carrega no botão; o browser pede autorização (`Permissions-Policy: geolocation=(self)`), a posição é arredondada logo a 0,01° e mostrada com um link para o mapa, e só é guardada depois de o utilizador confirmar.
