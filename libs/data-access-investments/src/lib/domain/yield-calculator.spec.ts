import { TaxaRentabilidade } from './branded';
import { buildPortfolioSummary, daysBetween } from './portfolio';
import {
  aliquotaIR,
  annualGrossRate,
  compareCdbVsIsento,
  roundMoney,
  simulateYield,
} from './yield-calculator';
import { InvestmentAsset } from './models';

describe('IR regressivo', () => {
  it.each([
    [1, 0.225],
    [180, 0.225],
    [181, 0.2],
    [360, 0.2],
    [361, 0.175],
    [720, 0.175],
    [721, 0.15],
    [3650, 0.15],
  ])('prazo de %i dias → alíquota %d', (dias, esperado) => {
    expect(aliquotaIR(dias)).toBe(esperado);
  });

  it('lança RangeError para prazo inválido', () => {
    expect(() => aliquotaIR(-1)).toThrow(RangeError);
    expect(() => aliquotaIR(Number.NaN)).toThrow(RangeError);
  });
});

describe('simulateYield', () => {
  const rates = { cdi: 14.65 as TaxaRentabilidade, ipca: 4.62 as TaxaRentabilidade };

  it('calcula taxa anual por indexador', () => {
    expect(annualGrossRate({ indexador: 'CDI', taxa: 110 }, rates)).toBeCloseTo(0.16115, 5);
    expect(annualGrossRate({ indexador: 'IPCA', taxa: 6 }, rates)).toBeCloseTo(1.0462 * 1.06 - 1, 6);
    expect(annualGrossRate({ indexador: 'PRE', taxa: 13.4 }, rates)).toBeCloseTo(0.134, 6);
  });

  it('CDB 110% CDI por 720 dias aplica IR de 17,5% sobre o rendimento', () => {
    const result = simulateYield({ indexador: 'CDI', taxa: 110, isentoIR: false }, rates, { valor: 10_000, prazoDias: 720 });
    const bruto = 10_000 * Math.pow(1.16115, 720 / 365);
    expect(result.valorBruto).toBeCloseTo(bruto, 1);
    expect(result.aliquotaIR).toBe(0.175);
    expect(result.valorIR).toBeCloseTo((bruto - 10_000) * 0.175, 1);
    expect(result.valorLiquido).toBeCloseTo(10_000 + (bruto - 10_000) * 0.825, 1);
    expect(result.isento).toBe(false);
  });

  it('ativo isento não paga IR', () => {
    const result = simulateYield({ indexador: 'CDI', taxa: 92, isentoIR: true }, rates, { valor: 10_000, prazoDias: 400 });
    expect(result.aliquotaIR).toBe(0);
    expect(result.valorIR).toBe(0);
    expect(result.valorLiquido).toBe(result.valorBruto);
  });

  it('desconta a taxa de administração dos fundos', () => {
    const base = { indexador: 'CDI' as const, taxa: 100, isentoIR: false };
    const semTaxa = simulateYield(base, rates, { valor: 10_000, prazoDias: 365 });
    const comTaxa = simulateYield({ ...base, taxaAdministracao: 2 }, rates, { valor: 10_000, prazoDias: 365 });
    expect(comTaxa.valorLiquido).toBeLessThan(semTaxa.valorLiquido);
  });

  it('rejeita valor e prazo inválidos', () => {
    const asset = { indexador: 'PRE' as const, taxa: 10, isentoIR: false };
    expect(() => simulateYield(asset, rates, { valor: 0, prazoDias: 10 })).toThrow(RangeError);
    expect(() => simulateYield(asset, rates, { valor: 10, prazoDias: 0 })).toThrow(RangeError);
  });

  it('roundMoney arredonda para centavos', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.344)).toBe(2.34);
  });
});

describe('compareCdbVsIsento', () => {
  const rates = { cdi: 14.65 as TaxaRentabilidade, ipca: 4.62 as TaxaRentabilidade };

  it('LCI/LCA vence quando o gross-up do CDB é menor', () => {
    const result = compareCdbVsIsento({ valor: 10_000, prazoDias: 720, cdbPercentCdi: 100, isentoPercentCdi: 92 }, rates);
    expect(result.vencedor).toBe('ISENTO');
    expect(result.diferencaLiquida).toBeGreaterThan(0);
    expect(result.cdbEquivalentePercentCdi).toBeCloseTo(92 / (1 - 0.175), 6);
  });

  it('CDB vence quando paga muito mais', () => {
    const result = compareCdbVsIsento({ valor: 10_000, prazoDias: 720, cdbPercentCdi: 120, isentoPercentCdi: 80 }, rates);
    expect(result.vencedor).toBe('CDB');
  });

  it('prazo curto (alíquota 22,5%) favorece ainda mais a isenta', () => {
    const curto = compareCdbVsIsento({ valor: 10_000, prazoDias: 90, cdbPercentCdi: 105, isentoPercentCdi: 90 }, rates);
    expect(curto.aliquotaIR).toBe(0.225);
    expect(curto.vencedor).toBe('ISENTO');
  });
});

describe('buildPortfolioSummary', () => {
  const asset = {
    kind: 'CDB',
    isin: 'BRCDBBRA0016',
    indexador: 'CDI',
    taxa: 110,
    isentoIR: false,
  } as unknown as InvestmentAsset;
  const rates = {
    cdi: 14.65,
    selic: 14.75,
    ipca: 4.62,
    referencia: '2026-11-03',
  } as unknown as Parameters<typeof buildPortfolioSummary>[2];

  it('daysBetween independe de fuso', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-03-01', '2026-02-01')).toBe(-28);
  });

  it('valoriza posições, ignora ativos desconhecidos e resume o patrimônio', () => {
    const summary = buildPortfolioSummary(
      [
        { isin: 'BRCDBBRA0016', valorAplicado: 10_000, dataAplicacao: '2025-06-10' },
        { isin: 'BRDESCONHEC0', valorAplicado: 999, dataAplicacao: '2025-06-10' },
      ] as never,
      [asset],
      rates,
    );
    expect(summary.quantidadeAtivos).toBe(1);
    expect(summary.totalAplicado).toBe(10_000);
    expect(summary.patrimonioLiquido).toBeGreaterThan(10_000);
    expect(summary.rendimentoLiquido).toBeCloseTo(summary.patrimonioLiquido - 10_000, 2);
    expect(summary.irEstimado).toBeGreaterThan(0);
  });

  it('posição criada na data de referência não rende nem paga IR', () => {
    const summary = buildPortfolioSummary(
      [{ isin: 'BRCDBBRA0016', valorAplicado: 5000, dataAplicacao: '2026-11-03' }] as never,
      [asset],
      rates,
    );
    expect(summary.patrimonioLiquido).toBe(5000);
    expect(summary.irEstimado).toBe(0);
  });

  it('sem taxas, retorna resumo vazio', () => {
    expect(buildPortfolioSummary([], [], null).quantidadeAtivos).toBe(0);
  });
});
