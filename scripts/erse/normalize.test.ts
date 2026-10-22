// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Faturómetro (scripts/erse/normalize.test.ts).
import { describe, expect, it } from 'vitest';
import { OFFERS_SCHEMA_VERSION, OFFERS_URL, powerKey } from '../../src/domain/erse';
import { dataDateFromName, isUpToDate, normalize, parseCsv } from './normalize';

// Synthetic rows in the ERSE format (column names as in the real CSV).
const CONDITIONS = [
  '\uFEFFCOM;COD_Proposta;NomeProposta;Segmento;TipoContagem;Fornecimento;DuracaoContrato;Data ini;Data fim;Filtrofaturacao;FiltroPagamento;FiltroFidelização;FiltroRenovavel_ELE;FiltroRestrições;FiltroPrecosIndex_ELE;FiltroServicosAdic;CustoServicos_c/IVA (€/ano);ReembFixo (€/ano);ReembTF_ELE (%);ReembTW_ELE (%);ReembW_ELE (€/kWh);DescontNovoCliente_c/IVA (€/ano);Desc. TF_ELE (%) - Novo Cliente;Desc. TW_ELE (%) - Novo Cliente;Desc. W_ELE (€/kWh) - Novo Cliente;LinkOfertaCom;TxTFidelização',
  'ACME;ACME_01;Oferta Teste;Dom;12;ELE;12;01/10/2026;31/12/2026;10;100;N;S;N;N;N;;12,5;10;;;;;;;https://example.com/oferta;Não tem fidelização',
  'ACME;ACME_GN;Gás Teste;Dom;;GN;12;01/10/2026;31/12/2026;10;100;N;N;N;N;N;;;;;;;;;;;',
  'ACME;ACME_DUAL;Luz e Gás;Dom;1;DUAL;12;01/10/2026;31/12/2026;10;100;N;N;N;N;N;;;;;;;;;;;',
  'ACME;ACME_EMP;Empresas;Ndom;1;ELE;12;01/10/2026;31/12/2026;10;100;N;N;N;N;N;;;;;;;;;;;',
  'ACME;ACME_02;Sem preços;Dom;1;ELE;12;01/10/2026;31/12/2026;10;100;S;N;N;N;N;;;;;;;;;;;',
].join('\r\n');

const PRICES = [
  '\uFEFFCOM;Pot_Cont;Escalao;ORD;COD_Proposta;Contagem;TF;TV|TVFV|TVP;TVV|TVC;TVVz;TFGN;TVGN',
  'ACME;6,9;;;ACME_01;1;0,5636;0,1665;;;;',
  'ACME;6,9;;;ACME_01;2;0,5636;0,2045;0,1143;;;',
  'ACME;6,9;;;ACME_01;3;0,5636;0,2645;0,1745;0,1043;;',
  'ACME;3,45;;;ACME_01;1;0,3;0,17;;;;',
  'ACME;;1;;ACME_GN;;;;;;0,12;0,10',
  'ACME;6,9;;;ACME_DUAL;1;0,55;0,16;;;;',
  'ACME;;1;;ACME_DUAL;;;;;;0,11;0,095',
  'ACME;6,9;;;ACME_EMP;1;0,5;0,15;;;;',
].join('\r\n');

describe('ERSE normalize', () => {
  const file = normalize(parseCsv(CONDITIONS), parseCsv(PRICES), {
    source: '20261013 122404 CSV.zip',
    dataDate: '2026-10-13',
    fetchedAt: '2026-10-13T12:00:00.000Z',
  });

  it('keeps household electricity offers with prices (and the electricity of dual offers)', () => {
    expect(file.offers.map((offer) => offer.id)).toEqual(['ACME_01', 'ACME_DUAL']);
    const dual = file.offers.find((offer) => offer.id === 'ACME_DUAL');
    expect(dual?.prices).toEqual({ '6.9': { '1': { fixedPerDay: 0.55, simple: 0.16 } } });
  });

  it('maps prices by power and cycle (simple, bi- and tri-hourly columns)', () => {
    expect(file.offers[0]?.prices).toEqual({
      '6.9': {
        '1': { fixedPerDay: 0.5636, simple: 0.1665 },
        '2': { fixedPerDay: 0.5636, offEmpty: 0.2045, empty: 0.1143 },
        '3': { fixedPerDay: 0.5636, peak: 0.2645, full: 0.1745, empty: 0.1043 },
      },
      '3.45': { '1': { fixedPerDay: 0.3, simple: 0.17 } },
    });
    expect(powerKey(6900)).toBe('6.9');
    expect(powerKey(3450)).toBe('3.45');
  });

  it('decodes conditions, filters and discounts', () => {
    expect(file.offers[0]).toMatchObject({
      supplier: 'ACME',
      segment: 'Dom',
      durationMonths: 12,
      validFrom: '2026-10-01',
      validTo: '2026-12-31',
      loyalty: false,
      renewable: true,
      payment: { directDebit: true, multibanco: false, cash: false },
      billing: { electronic: true, paper: false },
      discounts: { fixedPerYear: 12.5, fixedTermPct: 10, energyPct: 0, energyPerKwh: 0 },
      links: { offer: 'https://example.com/oferta' },
      texts: { loyalty: 'Não tem fidelização' },
    });
  });

  it('asks for the file by format version, so a cached older file is not used', () => {
    expect(OFFERS_URL).toBe(`/data/erse-offers.json?v=${OFFERS_SCHEMA_VERSION}`);
    expect(file.schemaVersion).toBe(OFFERS_SCHEMA_VERSION);
  });

  it('rewrites a file of an older format even with the same ZIP', () => {
    expect(isUpToDate({ source: 'a.zip', schemaVersion: OFFERS_SCHEMA_VERSION }, 'a.zip')).toBe(
      true,
    );
    expect(isUpToDate({ source: 'a.zip', schemaVersion: 0 }, 'a.zip')).toBe(false);
    expect(isUpToDate({ source: 'b.zip', schemaVersion: OFFERS_SCHEMA_VERSION }, 'a.zip')).toBe(
      false,
    );
  });

  it('fails loudly when the format changes', () => {
    const broken = CONDITIONS.replace('FiltroPagamento', 'Pagamento');
    expect(() =>
      normalize(parseCsv(broken), parseCsv(PRICES), {
        source: 'x',
        dataDate: '2026-10-13',
        fetchedAt: 'x',
      }),
    ).toThrow(/missing columns FiltroPagamento/);
  });

  it('reads the data date from the file name', () => {
    expect(dataDateFromName('20261013 122404 CSV.zip')).toBe('2026-10-13');
    expect(dataDateFromName('ofertas.zip')).toBeNull();
  });
});
