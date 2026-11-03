import { MarketRates, SimulationInput, YieldableAsset } from './models';

/**
 * @file Regras de negócio puras (sem Angular) de rentabilidade e Imposto de Renda regressivo.
 * Funções puras são triviais de testar (TDD) e reutilizáveis no servidor (SSR) e no browser.
 *
 * Simplificações documentadas: capitalização por dias corridos (base 365) e IOF desconsiderado
 * (incide apenas em resgates com menos de 30 dias).
 */

/** @description Dias por ano usados na capitalização. */
const DAYS_IN_YEAR = 365;

/**
 * @description Faixas da tabela regressiva de IR sobre renda fixa: `[limite superior em dias, alíquota]`.
 */
const IR_BRACKETS: readonly (readonly [number, number])[] = [
  [180, 0.225],
  [360, 0.2],
  [720, 0.175],
];

/** @description Alíquota para prazos superiores a 720 dias. */
const IR_LONG_TERM = 0.15;

/**
 * @description Arredonda um valor monetário para centavos (evita ruído de ponto flutuante na UI).
 * @param value Valor em reais.
 * @returns Valor arredondado a 2 casas.
 * @example
 * roundMoney(10.005); // 10.01
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * @description Alíquota de IR da tabela regressiva: 22,5% (até 180 dias), 20% (181–360),
 * 17,5% (361–720) e 15% (acima de 720).
 * @param prazoDias Dias corridos entre a aplicação e o resgate.
 * @returns Alíquota decimal (ex.: `0.15`).
 * @throws {RangeError} Se o prazo for negativo ou não finito.
 * @example
 * aliquotaIR(365); // 0.175
 */
export function aliquotaIR(prazoDias: number): number {
  if (!Number.isFinite(prazoDias) || prazoDias < 0) {
    throw new RangeError(`Prazo inválido: ${prazoDias}`);
  }
  for (const [limit, rate] of IR_BRACKETS) {
    if (prazoDias <= limit) {
      return rate;
    }
  }
  return IR_LONG_TERM;
}

/**
 * @description Taxa bruta efetiva anual (decimal) de um ativo conforme o indexador:
 * - `CDI`: `CDI × (taxa/100)`
 * - `IPCA`: `(1 + IPCA) × (1 + spread) − 1`
 * - `PRE`: a própria taxa
 * @param asset Ativo (indexador e taxa).
 * @param rates Taxas de mercado vigentes.
 * @returns Taxa anual decimal (ex.: `0.1612`).
 * @example
 * annualGrossRate({ indexador: 'CDI', taxa: 110 }, { cdi: 14.65, ipca: 4.62 }); // 0.16115
 */
export function annualGrossRate(
  asset: Pick<YieldableAsset, 'indexador' | 'taxa'>,
  rates: Pick<MarketRates, 'cdi' | 'ipca'>,
): number {
  switch (asset.indexador) {
    case 'CDI':
      return (rates.cdi / 100) * (asset.taxa / 100);
    case 'IPCA':
      return (1 + rates.ipca / 100) * (1 + asset.taxa / 100) - 1;
    case 'PRE':
      return asset.taxa / 100;
  }
}

/** @description Resultado de uma simulação de rentabilidade. */
export interface SimulationResult {
  readonly valorInvestido: number;
  readonly prazoDias: number;
  /** Taxa anual bruta efetiva (decimal). */
  readonly taxaAnualBruta: number;
  readonly valorBruto: number;
  readonly rendimentoBruto: number;
  /** Alíquota efetivamente aplicada (0 para ativos isentos). */
  readonly aliquotaIR: number;
  readonly valorIR: number;
  readonly rendimentoLiquido: number;
  readonly valorLiquido: number;
  /** Rentabilidade líquida acumulada no período (decimal). */
  readonly rentabilidadeLiquidaPeriodo: number;
  readonly isento: boolean;
}

/**
 * @description Simula o investimento de um valor por um prazo.
 * Fundos têm a taxa de administração descontada da rentabilidade anual bruta.
 * @param asset Ativo (indexador, taxa, isenção e, opcionalmente, taxa de administração).
 * @param rates Taxas de mercado.
 * @param input Valor e prazo (dias corridos).
 * @returns Resultado completo com IR regressivo.
 * @throws {RangeError} Se valor ou prazo forem inválidos.
 * @example
 * const r = simulateYield(cdb, rates, { valor: 10_000, prazoDias: 720 });
 */
export function simulateYield(asset: YieldableAsset, rates: Pick<MarketRates, 'cdi' | 'ipca'>, input: SimulationInput): SimulationResult {
  if (!Number.isFinite(input.valor) || input.valor <= 0) {
    throw new RangeError(`Valor inválido: ${input.valor}`);
  }
  if (!Number.isFinite(input.prazoDias) || input.prazoDias <= 0) {
    throw new RangeError(`Prazo inválido: ${input.prazoDias}`);
  }
  const fee = (asset.taxaAdministracao ?? 0) / 100;
  const grossRate = annualGrossRate(asset, rates);
  const netOfFeesRate = (1 + grossRate) / (1 + fee) - 1;
  const grossValue = input.valor * Math.pow(1 + netOfFeesRate, input.prazoDias / DAYS_IN_YEAR);
  const grossYield = grossValue - input.valor;
  const rate = asset.isentoIR ? 0 : aliquotaIR(input.prazoDias);
  const tax = grossYield * rate;
  const netYield = grossYield - tax;
  return {
    valorInvestido: roundMoney(input.valor),
    prazoDias: input.prazoDias,
    taxaAnualBruta: netOfFeesRate,
    valorBruto: roundMoney(grossValue),
    rendimentoBruto: roundMoney(grossYield),
    aliquotaIR: rate,
    valorIR: roundMoney(tax),
    rendimentoLiquido: roundMoney(netYield),
    valorLiquido: roundMoney(input.valor + netYield),
    rentabilidadeLiquidaPeriodo: netYield / input.valor,
    isento: asset.isentoIR,
  };
}

/** @description Parâmetros do simulador comparativo CDB × LCI/LCA. */
export interface ComparisonInput extends SimulationInput {
  /** Taxa do CDB em % do CDI. */
  readonly cdbPercentCdi: number;
  /** Taxa da LCI/LCA isenta em % do CDI. */
  readonly isentoPercentCdi: number;
}

/** @description Resultado do comparativo. */
export interface ComparisonResult {
  readonly cdb: SimulationResult;
  readonly isento: SimulationResult;
  readonly vencedor: 'CDB' | 'ISENTO' | 'EMPATE';
  /** Diferença líquida a favor do vencedor (sempre ≥ 0). */
  readonly diferencaLiquida: number;
  /** Alíquota de IR do CDB no prazo. */
  readonly aliquotaIR: number;
  /** % do CDI que um CDB precisaria pagar para igualar a LCI/LCA isenta (gross-up do IR). */
  readonly cdbEquivalentePercentCdi: number;
}

/**
 * @description Compara um CDB tributado com uma LCI/LCA isenta no mesmo valor e prazo.
 * A taxa equivalente é o *gross-up*: `taxaIsenta / (1 − alíquota)`.
 * @param input Valor, prazo e as duas taxas em % do CDI.
 * @param rates Taxas de mercado.
 * @returns Resultado com vencedor e diferença líquida.
 * @example
 * compareCdbVsIsento({ valor: 10_000, prazoDias: 720, cdbPercentCdi: 110, isentoPercentCdi: 92 }, rates);
 */
export function compareCdbVsIsento(input: ComparisonInput, rates: Pick<MarketRates, 'cdi' | 'ipca'>): ComparisonResult {
  const base = { valor: input.valor, prazoDias: input.prazoDias };
  const cdb = simulateYield({ indexador: 'CDI', taxa: input.cdbPercentCdi, isentoIR: false }, rates, base);
  const isento = simulateYield({ indexador: 'CDI', taxa: input.isentoPercentCdi, isentoIR: true }, rates, base);
  const difference = roundMoney(cdb.valorLiquido - isento.valorLiquido);
  const aliquota = aliquotaIR(input.prazoDias);
  return {
    cdb,
    isento,
    vencedor: difference === 0 ? 'EMPATE' : difference > 0 ? 'CDB' : 'ISENTO',
    diferencaLiquida: Math.abs(difference),
    aliquotaIR: aliquota,
    cdbEquivalentePercentCdi: input.isentoPercentCdi / (1 - aliquota),
  };
}
