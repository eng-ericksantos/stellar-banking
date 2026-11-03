import { CNPJ, ISIN, TaxaRentabilidade, Ticker } from './branded';

/**
 * @file Modelo de domínio de investimentos.
 *
 * Os ativos formam uma **união discriminada** pelo campo `kind`: ao fazer `switch (asset.kind)` o
 * TypeScript estreita o tipo e expõe apenas os campos que existem naquela família (ex.: somente
 * fundos possuem `taxaAdministracao`). Adicionar uma nova família sem tratá-la nos `switch`
 * exaustivos gera erro de compilação.
 */

/** @description Famílias de produtos. */
export const ASSET_KINDS = ['CDB', 'LCI', 'LCA', 'TESOURO_IPCA', 'CRI', 'CRA', 'FUNDO_MULTIMERCADO'] as const;

/** @description União literal das famílias de produto. */
export type AssetKind = (typeof ASSET_KINDS)[number];

/** @description Indexadores de rentabilidade. */
export type Indexador = 'CDI' | 'IPCA' | 'PRE';

/** @description Filtro de indexador na UI (inclui "todos"). */
export type IndexadorFilter = 'TODOS' | Indexador;

/** @description Classificação de risco. */
export type Risco = 'BAIXO' | 'MEDIO' | 'ALTO';

/** @description Regras de liquidez. */
export type Liquidez = 'DIARIA' | 'NO_VENCIMENTO' | 'D_MAIS_30';

/** @description Campos comuns a todo ativo. */
interface AssetBase<TKind extends AssetKind, TIsento extends boolean> {
  readonly kind: TKind;
  readonly isin: ISIN;
  readonly nome: string;
  readonly emissor: string;
  readonly cnpj: CNPJ;
  readonly indexador: Indexador;
  readonly taxa: TaxaRentabilidade;
  /** `YYYY-MM-DD` ou `null` para fundos abertos. */
  readonly vencimento: string | null;
  readonly liquidez: Liquidez;
  readonly risco: Risco;
  readonly aplicacaoMinima: number;
  readonly garantiaFgc: boolean;
  readonly isentoIR: TIsento;
}

/** @description Certificado de Depósito Bancário (tributado). */
export type CdbAsset = AssetBase<'CDB', false>;

/** @description Letra de Crédito Imobiliário (isenta de IR para PF). */
export type LciAsset = AssetBase<'LCI', true>;

/** @description Letra de Crédito do Agronegócio (isenta de IR para PF). */
export type LcaAsset = AssetBase<'LCA', true>;

/** @description Tesouro IPCA+ (tributado, com ticker). */
export type TesouroIpcaAsset = AssetBase<'TESOURO_IPCA', false> & { readonly ticker: Ticker };

/** @description Certificado de Recebíveis Imobiliários (isento, com ticker). */
export type CriAsset = AssetBase<'CRI', true> & { readonly ticker: Ticker };

/** @description Certificado de Recebíveis do Agronegócio (isento, com ticker). */
export type CraAsset = AssetBase<'CRA', true> & { readonly ticker: Ticker };

/** @description Fundo Multimercado (tributado, com taxa de administração e cotização). */
export type FundoMultimercadoAsset = AssetBase<'FUNDO_MULTIMERCADO', false> & {
  readonly taxaAdministracao: number;
  readonly cotizacaoDias: number;
};

/** @description União discriminada de todos os ativos negociáveis. */
export type InvestmentAsset =
  | CdbAsset
  | LciAsset
  | LcaAsset
  | TesouroIpcaAsset
  | CriAsset
  | CraAsset
  | FundoMultimercadoAsset;

/** @description Seleciona a variante de ativo por `kind` (Utility Type sobre a união). */
export type AssetByKind<TKind extends AssetKind> = Extract<InvestmentAsset, { readonly kind: TKind }>;

/**
 * @description Subconjunto estrutural de um ativo necessário para simulações. Usa `number` simples
 * (e não o branded `TaxaRentabilidade`) para permitir simular taxas hipotéticas digitadas pelo usuário;
 * qualquer {@link InvestmentAsset} é atribuível a este tipo.
 */
export interface YieldableAsset {
  readonly indexador: Indexador;
  readonly taxa: number;
  readonly isentoIR: boolean;
  readonly taxaAdministracao?: number;
}

/** @description Rótulos amigáveis por família (Record garante exaustividade). */
export const ASSET_KIND_LABEL: Readonly<Record<AssetKind, string>> = {
  CDB: 'CDB',
  LCI: 'LCI',
  LCA: 'LCA',
  TESOURO_IPCA: 'Tesouro IPCA+',
  CRI: 'CRI',
  CRA: 'CRA',
  FUNDO_MULTIMERCADO: 'Fundo Multimercado',
};

/** @description Rótulos amigáveis para liquidez (frases completas, prontas para exibição). */
export const LIQUIDEZ_LABEL: Readonly<Record<Liquidez, string>> = {
  DIARIA: 'Liquidez diária',
  NO_VENCIMENTO: 'Liquidez no vencimento',
  D_MAIS_30: 'Resgate em D+30',
};

/** @description Rótulos amigáveis para risco. */
export const RISCO_LABEL: Readonly<Record<Risco, string>> = {
  BAIXO: 'Baixo',
  MEDIO: 'Médio',
  ALTO: 'Alto',
};

/**
 * @description Type guard: o ativo é um fundo multimercado?
 * @param asset Ativo qualquer.
 * @returns `true` quando `kind === 'FUNDO_MULTIMERCADO'` (estreita o tipo).
 * @example
 * if (isFundo(asset)) console.log(asset.taxaAdministracao);
 */
export function isFundo(asset: InvestmentAsset): asset is FundoMultimercadoAsset {
  return asset.kind === 'FUNDO_MULTIMERCADO';
}

/**
 * @description Type guard: o ativo possui ticker de negociação?
 * @param asset Ativo qualquer.
 * @returns `true` para Tesouro, CRI e CRA (estreita o tipo).
 * @example
 * if (hasTicker(asset)) console.log(asset.ticker);
 */
export function hasTicker(asset: InvestmentAsset): asset is TesouroIpcaAsset | CriAsset | CraAsset {
  return asset.kind === 'TESOURO_IPCA' || asset.kind === 'CRI' || asset.kind === 'CRA';
}

/**
 * @description Descreve a taxa de um ativo de forma legível (ex.: `110% do CDI`, `IPCA + 7,45% a.a.`).
 * Usa `switch` exaustivo sobre {@link Indexador}.
 * @param asset Ativo com indexador e taxa.
 * @returns Texto formatado em pt-BR.
 * @example
 * describeRate({ indexador: 'CDI', taxa: 110 as TaxaRentabilidade }); // '110% do CDI'
 */
export function describeRate(asset: Pick<InvestmentAsset, 'indexador' | 'taxa'>): string {
  const value = asset.taxa.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  switch (asset.indexador) {
    case 'CDI':
      return `${value}% do CDI`;
    case 'IPCA':
      return `IPCA + ${value}% a.a.`;
    case 'PRE':
      return `${value}% a.a.`;
  }
}

/** @description Taxas de mercado (% a.a.) já validadas. */
export interface MarketRates {
  readonly cdi: TaxaRentabilidade;
  readonly selic: TaxaRentabilidade;
  readonly ipca: TaxaRentabilidade;
  /** Data de referência `YYYY-MM-DD`. */
  readonly referencia: string;
}

/** @description Posição do cliente em um ativo. */
export interface Position {
  readonly isin: ISIN;
  readonly valorAplicado: number;
  /** `YYYY-MM-DD`. */
  readonly dataAplicacao: string;
}

/** @description Parâmetros de uma simulação. */
export interface SimulationInput {
  readonly valor: number;
  readonly prazoDias: number;
}
