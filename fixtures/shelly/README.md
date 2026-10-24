# Respostas do Shelly EM Gen3 (sintéticas)

Formato igual ao das respostas reais capturadas a 2026-10-24 (firmware 2.1.0; as reais ficam em `fixtures/private/shelly/`), com identificadores, MAC e valores trocados. Ver `docs/shelly.md`.

- `device-info.json` — `Shelly.GetDeviceInfo`
- `em1-status.json` — `EM1.GetStatus?id=0` (medições do segundo atual)
- `em1data-status.json` — `EM1Data.GetStatus?id=0` (contadores de energia, Wh; um total redondo vem sem casas decimais)
- `sys-status.json` — `Sys.GetStatus` (resumido aos campos que o script usa e a alguns de contexto)
- `script-status-out-of-memory.json` — `Script.GetStatus?id=1` depois de o script ficar sem memória (script 0.2.1, com a internet em baixo)
