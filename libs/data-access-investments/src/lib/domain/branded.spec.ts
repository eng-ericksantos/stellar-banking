import { MOCK_FIXED_INCOME, MOCK_FUNDS } from '@invest/http-core';
import {
  cnpjCheckDigits,
  formatCnpj,
  isValidCnpj,
  isValidIsin,
  isinCheckDigit,
  parseCnpj,
  parseIsin,
  parseTaxa,
  parseTicker,
  unwrap,
  DomainValidationError,
} from './branded';
import { toAsset, toAssets, toRates } from './mappers';

describe('Branded Types', () => {
  it('valida CNPJ com dígitos verificadores e aceita máscara', () => {
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('11222333000182')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(cnpjCheckDigits('112223330001')).toBe('81');
    const parsed = parseCnpj('11.222.333/0001-81');
    expect(parsed.ok && formatCnpj(parsed.value)).toBe('11.222.333/0001-81');
    expect(parseCnpj('123').ok).toBe(false);
  });

  it('valida ISIN com dígito verificador', () => {
    expect(isinCheckDigit('BRCDBBRA001')).toBe(6);
    expect(isValidIsin('BRCDBBRA0016')).toBe(true);
    expect(isValidIsin('BRCDBBRA0017')).toBe(false);
    expect(isValidIsin('XX')).toBe(false);
    expect(unwrap(parseIsin(' brcdbbra0016 '))).toBe('BRCDBBRA0016');
  });

  it('normaliza Ticker e rejeita formatos inválidos', () => {
    expect(unwrap(parseTicker('ntnb2035'))).toBe('NTNB2035');
    expect(parseTicker('a!').ok).toBe(false);
  });

  it('TaxaRentabilidade exige valor finito, positivo e ≤ 1000', () => {
    expect(parseTaxa(110).ok).toBe(true);
    for (const invalid of [0, -1, Number.NaN, Infinity, 1001]) {
      expect(parseTaxa(invalid).ok).toBe(false);
    }
  });

  it('unwrap lança DomainValidationError em valor inválido', () => {
    expect(() => unwrap(parseIsin('ruim'))).toThrow(DomainValidationError);
  });
});

describe('Anti-Corruption Layer (mappers)', () => {
  it('todos os ativos do mock passam na validação de domínio (ISIN/CNPJ/Ticker válidos)', () => {
    const { assets, rejected } = toAssets([...MOCK_FIXED_INCOME, ...MOCK_FUNDS]);
    expect(rejected.map((error) => error.message)).toEqual([]);
    expect(assets).toHaveLength(MOCK_FIXED_INCOME.length + MOCK_FUNDS.length);
  });

  it('rejeita ativo com ISIN inválido sem derrubar o lote', () => {
    const [first, second] = MOCK_FIXED_INCOME;
    const result = toAssets([{ ...first!, isin: 'BRCDBBRA0017' }, second!]);
    expect(result.assets).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });

  it('exige ticker para Tesouro/CRI/CRA', () => {
    const tesouro = MOCK_FIXED_INCOME.find((asset) => asset.kind === 'TESOURO_IPCA')!;
    const withoutTicker = { ...tesouro, ticker: undefined };
    const result = toAsset(withoutTicker);
    expect(result.ok).toBe(false);
  });

  it('mapeia isenção de IR pela família do ativo', () => {
    const { assets } = toAssets(MOCK_FIXED_INCOME);
    expect(assets.filter((asset) => asset.isentoIR).map((asset) => asset.kind).sort()).toEqual([
      'CRA',
      'CRI',
      'LCA',
      'LCA',
      'LCI',
    ]);
  });

  it('toRates valida taxas', () => {
    expect(toRates({ cdi: 14.65, selic: 14.75, ipca: 4.62, referencia: '2026-11-03' }).cdi).toBe(14.65);
    expect(() => toRates({ cdi: -1, selic: 1, ipca: 1, referencia: '2026-11-03' })).toThrow(DomainValidationError);
  });
});
