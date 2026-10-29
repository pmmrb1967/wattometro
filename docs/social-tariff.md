# Tarifa social da eletricidade

O que o cartão «Tarifa social» em Tarifários (`src/app/SocialTariff.tsx`, `src/domain/social-tariff.ts`) usa. Adaptado do Faturómetro (`src/domain/social-tariff.ts`, `github.com/pmmrb1967/faturometro`), que verifica também o gás e a Internet; aqui só a eletricidade. Rever todos os anos, quando a ERSE publicar o folheto novo.

## Critérios (ERSE, folheto «Tarifa social», outubro de 2026)

Fonte: <https://www.erse.pt/media/xvtbbuq4/tarifa-social_eletricidade_gas_out2026_pt.pdf>, como copiado no Faturómetro (consultado a 2026-10-18).

- Tem direito quem receber uma destas prestações: complemento solidário para idosos, rendimento social de inserção, prestação de desemprego, abono de família (qualquer escalão, na eletricidade), pensão social de invalidez (regime especial de proteção na invalidez ou complemento da prestação social para a inclusão), pensão social de velhice.
- Ou com rendimento anual do agregado até **6 272,64 €**, mais 50 % por cada membro sem rendimentos (incluindo o requerente), até 10.
- Contrato em nome do beneficiário, só para consumo doméstico na habitação permanente, com potência contratada **até 6,9 kVA**.
- Desconto médio de **33,8 %** (sem taxas e impostos) e isenção do IEC.
- Atribuição automática pela DGEG; o comercializador avisa. Sem aviso, entregar ao comercializador um comprovativo da Segurança Social ou das Finanças. DGEG: <https://www.dgeg.gov.pt/pt/areas-transversais/politicas-de-protecao-ao-consumidor-de-energia/tarifa-social-de-energia/>

## Estimativa da poupança

Com o custo dos últimos 12 meses no tarifário atual (o mesmo do comparador de ofertas):

- 33,8 % da energia e da potência, com IVA (o IVA baixa na mesma proporção);
- mais o IEC com o seu IVA (23 %, `docs/electricity-vat.md`): a diferença entre o custo com o IEC do tarifário e com IEC a zero.

É uma estimativa: o desconto real incide nas tarifas de acesso às redes, é fixado pela ERSE todos os anos e não é igual a 33,8 % em todas as faturas. Quem já tem a tarifa social copia os descontos da fatura para o tarifário (Definições → Tarifário, «Desc. Social»), e o custo da app passa a incluí-los; o cartão só o diz, sem estimar nada.

As respostas (prestações, rendimento, pessoas) ficam no ecrã: não se guardam nem se enviam.
