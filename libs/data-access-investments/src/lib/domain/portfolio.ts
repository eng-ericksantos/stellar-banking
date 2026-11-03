import { InvestmentAsset, MarketRates, Position } from './models';
import { roundMoney, simulateYield } from './yield-calculator';

/** @description Posição valorizada até a data de referência. */
export interface PortfolioItem {
  readonly position: Position;
  readonly asset: InvestmentAsset;
  readonly diasCorridos: number;
  readonly valorAplicado: number;
  readonly valorBruto: number;
  readonly valorIR: number;
  readonly valorLiquido: number;
  readonly rendimentoLiquido: number;
}

/** @description Resumo patrimonial exibido nos cards de KPI. */
export interface PortfolioSummary {
  readonly itens: readonly PortfolioItem[];
  readonly totalAplicado: number;
  readonly patrimonioLiquido: number;
  readonly rendimentoLiquido: number;
  readonly irEstimado: number;
  /** Rentabilidade líquida sobre o capital aplicado (decimal). */
  readonly rentabilidade: number;
  readonly quantidadeAtivos: number;
}

/**
 * @description Resumo vazio (estado inicial/sem dados).
 */
export const EMPTY_PORTFOLIO_SUMMARY: PortfolioSummary = {
  itens: [],
  totalAplicado: 0,
  patrimonioLiquido: 0,
  rendimentoLiquido: 0,
  irEstimado: 0,
  rentabilidade: 0,
  quantidadeAtivos: 0,
};

const MS_PER_DAY = 86_400_000;

/**
 * @description Diferença em dias corridos entre duas datas `YYYY-MM-DD` (UTC, imune a fuso/horário de verão).
 * @param from Data inicial.
 * @param to Data final.
 * @returns Dias corridos (pode ser negativo).
 * @example
 * daysBetween('2026-01-01', '2026-01-31'); // 30
 */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * @description Valoriza a carteira até a data de referência das taxas, aplicando o IR regressivo
 * pelo tempo de permanência de cada posição. Usar a data de referência das taxas (e não
 * `Date.now()`) torna o resultado determinístico entre servidor e browser (sem mismatch na hidratação).
 * @param positions Posições do cliente.
 * @param assets Ativos conhecidos.
 * @param rates Taxas de mercado (de onde vem a data de referência).
 * @returns Resumo patrimonial.
 * @example
 * const summary = buildPortfolioSummary(positions, assets, rates);
 */
export function buildPortfolioSummary(
  positions: readonly Position[],
  assets: readonly InvestmentAsset[],
  rates: MarketRates | null,
): PortfolioSummary {
  if (!rates) {
    return EMPTY_PORTFOLIO_SUMMARY;
  }
  const byIsin = new Map(assets.map((asset) => [asset.isin as string, asset]));
  const itens: PortfolioItem[] = [];
  for (const position of positions) {
    const asset = byIsin.get(position.isin);
    if (!asset) {
      continue;
    }
    const diasCorridos = daysBetween(position.dataAplicacao, rates.referencia);
    if (diasCorridos <= 0) {
      itens.push({
        position,
        asset,
        diasCorridos: 0,
        valorAplicado: position.valorAplicado,
        valorBruto: position.valorAplicado,
        valorIR: 0,
        valorLiquido: position.valorAplicado,
        rendimentoLiquido: 0,
      });
      continue;
    }
    const result = simulateYield(asset, rates, { valor: position.valorAplicado, prazoDias: diasCorridos });
    itens.push({
      position,
      asset,
      diasCorridos,
      valorAplicado: position.valorAplicado,
      valorBruto: result.valorBruto,
      valorIR: result.valorIR,
      valorLiquido: result.valorLiquido,
      rendimentoLiquido: result.rendimentoLiquido,
    });
  }
  const totalAplicado = roundMoney(itens.reduce((sum, item) => sum + item.valorAplicado, 0));
  const patrimonioLiquido = roundMoney(itens.reduce((sum, item) => sum + item.valorLiquido, 0));
  const rendimentoLiquido = roundMoney(patrimonioLiquido - totalAplicado);
  return {
    itens,
    totalAplicado,
    patrimonioLiquido,
    rendimentoLiquido,
    irEstimado: roundMoney(itens.reduce((sum, item) => sum + item.valorIR, 0)),
    rentabilidade: totalAplicado > 0 ? rendimentoLiquido / totalAplicado : 0,
    quantidadeAtivos: itens.length,
  };
}
