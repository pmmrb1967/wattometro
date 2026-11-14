# Inteligência artificial: fornecedores

A IA é opcional (regra 2 do CLAUDE.md) e só explica números que a app já calculou (regra 3). O utilizador escolhe em Definições → Inteligência artificial quem responde. A conversa com ferramentas, as explicações e a leitura de fotografias de equipamentos funcionam com os três fornecedores. Tudo passa pela abstração `AiProvider` (`src/ai/provider.ts`).

| Fornecedor | Chave | Por onde vai | Custo | Código |
|---|---|---|---|---|
| Anthropic (Claude) | do utilizador | browser → `api.anthropic.com` | o utilizador paga à Anthropic | `src/ai/anthropic.ts` |
| Google (Gemini) | do utilizador | browser → `generativelanguage.googleapis.com` (REST, chave no cabeçalho `x-goog-api-key`) | o utilizador paga à Google | `src/ai/gemini.ts` |
| IA gratuita (Workers AI, Gemma 4) | nenhuma | browser → Worker `/v1/ai/free` → Workers AI | sai dos neurons gratuitos diários da conta Cloudflare | `src/ai/free.ts`, `server/src/ai-free.ts` |

As chaves guardam-se na conta, cifradas com `AI_KEY_SECRET` (`user_ai_settings.key_sealed` para a Anthropic e `gemini_key_sealed` para a Google, migração 0031), e são copiadas para cada browser (`src/app/ai-sync.ts`). Quem usa a IA gratuita não guarda chave nenhuma: fica só o modelo escolhido.

O modelo define o fornecedor (`src/ai/models.ts`, com os preços de tabela e a data em que foram consultados). O histórico da conversa fica no formato de cada fornecedor, por isso mudar de modelo começa uma conversa nova.

## Gemini na UE

Desde 2026-03-23, os termos da Gemini API (aistudio.google.com/docs/terms) só permitem os Paid Services em apps oferecidas a utilizadores no EEE. A chave tem de pertencer a um projeto Google Cloud com a faturação ativa, e as Definições dizem-no (como no Faturómetro). Preços consultados em ai.google.dev/gemini-api/docs/pricing a 2026-11-14.

## IA gratuita

Segue o Faturómetro (`server/src/ai-free.ts`), o Prazómetro e o Validómetro, com duas diferenças:

- **Precisa de sessão iniciada.** As contas criam-se por script, por isso o servidor aceita as mensagens da app tal como vêm e verifica só a forma e o tamanho (zod, no máximo 4 MB). No modo sem conta e na demonstração, onde o `/v1` responde no browser, não aparece.
- **Também serve a conversa.** O Gemma 4 no Workers AI aceita ferramentas no formato da OpenAI (`tools`, `tool_calls`; developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it, consultado a 2026-11-14). As ferramentas continuam a correr no browser e o Worker só reencaminha cada volta. Esperar pelo Workers AI não gasta CPU, por isso cabe nos 10 ms do plano gratuito.

O raciocínio do modelo fica desligado (`enable_thinking: false`), porque gastaria neurons.

**Limite:** 10 000 neurons por dia UTC, para a conta Cloudflare inteira e sem cartão. A app para aos 9 000, para uma pergunta a meio não falhar. Os neurons contam-se com o valor que o Workers AI devolve em `usage.neurons` (visto a 2026-11-14), arredondado para cima em cada pedido. Quando não vem, são **estimados** a partir dos tokens com o preço de catálogo do modelo (0,10 US$ por milhão de tokens de entrada, 0,30 US$ por milhão de saída) e o preço do neuron (0,011 US$ por 1000), como no Validómetro. O número exato está no painel da Cloudflare. Uma pergunta típica da conversa tem 2 a 3 voltas de cerca de 5 000 tokens cada, o que dá à volta de 100 neurons por volta e 30 a 40 perguntas por dia.

**Privacidade (regra 1):** vão para a Cloudflare a pergunta e os mesmos resumos já calculados que iriam para a Anthropic, nunca as medições ao minuto nem séries temporais. Nada do pedido nem da resposta é guardado ou registado. Por dia UTC ficam só o número de pedidos e os neurons estimados (`maintenance_state`, `ai_calls:AAAA-MM-DD` e `ai_neurons:AAAA-MM-DD`), apagados ao fim de 7 dias com as linhas lidas. O Workers AI pode processar os pedidos fora da UE, e as Definições dizem-no.

O painel do administrador mostra os neurons de hoje e dos últimos 7 dias contra o limite (`docs/admin.md`).
