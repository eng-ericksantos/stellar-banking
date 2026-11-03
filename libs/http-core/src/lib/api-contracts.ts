/**
 * @file Contratos "de fio" (wire contracts) da API financeira.
 *
 * Os DTOs usam tipos primitivos (`string`/`number`): representam o JSON recebido *antes* de qualquer
 * validação. A camada `data-access-investments` atua como Anti-Corruption Layer, convertendo DTOs
 * em tipos de domínio com Branded Types (ISIN, CNPJ, Ticker, TaxaRentabilidade).
 */

/** @description Caminho-base versionado da API. */
export const API_BASE_PATH = '/api/v1';

/** @description Endpoints expostos (e simulados) pela API. */
export const API_ENDPOINTS = {
  rates: `${API_BASE_PATH}/rates`,
  fixedIncome: `${API_BASE_PATH}/fixed-income`,
  funds: `${API_BASE_PATH}/funds`,
  portfolio: `${API_BASE_PATH}/portfolio`,
  simulations: `${API_BASE_PATH}/simulations`,
  orders: `${API_BASE_PATH}/orders`,
} as const;

/** @description Famílias de produtos negociáveis. */
export type AssetKindDto = 'CDB' | 'LCI' | 'LCA' | 'TESOURO_IPCA' | 'CRI' | 'CRA' | 'FUNDO_MULTIMERCADO';

/** @description Indexadores de rentabilidade. */
export type IndexadorDto = 'CDI' | 'IPCA' | 'PRE';

/** @description Classificação de risco. */
export type RiscoDto = 'BAIXO' | 'MEDIO' | 'ALTO';

/** @description Regras de liquidez. */
export type LiquidezDto = 'DIARIA' | 'NO_VENCIMENTO' | 'D_MAIS_30';

/**
 * @description Ativo financeiro como trafega na rede.
 */
export interface AssetDto {
  /** Código ISIN (ISO 6166). */
  readonly isin: string;
  /** Família do produto. */
  readonly kind: AssetKindDto;
  /** Nome comercial. */
  readonly nome: string;
  /** Razão social do emissor/gestor. */
  readonly emissor: string;
  /** CNPJ do emissor/gestor (14 dígitos, sem máscara). */
  readonly cnpj: string;
  /** Código de negociação (títulos públicos/CRI/CRA). */
  readonly ticker?: string;
  /** Indexador de rentabilidade. */
  readonly indexador: IndexadorDto;
  /** Taxa: % do CDI (CDI), spread a.a. (IPCA) ou taxa a.a. (PRE). */
  readonly taxa: number;
  /** Vencimento (`YYYY-MM-DD`) ou `null` para fundos abertos. */
  readonly vencimento: string | null;
  /** Regra de liquidez. */
  readonly liquidez: LiquidezDto;
  /** Classificação de risco. */
  readonly risco: RiscoDto;
  /** Aplicação mínima em reais. */
  readonly aplicacaoMinima: number;
  /** Se possui cobertura do FGC. */
  readonly garantiaFgc: boolean;
  /** Se é isento de IR para pessoa física. */
  readonly isentoIR: boolean;
  /** Taxa de administração a.a. (fundos). */
  readonly taxaAdministracao?: number;
  /** Dias para cotização do resgate (fundos). */
  readonly cotizacaoDias?: number;
}

/** @description Taxas de mercado (% a.a.). */
export interface RatesDto {
  readonly cdi: number;
  readonly selic: number;
  readonly ipca: number;
  /** Data de referência `YYYY-MM-DD`. */
  readonly referencia: string;
}

/** @description Posição do cliente em um ativo. */
export interface PositionDto {
  readonly isin: string;
  readonly valorAplicado: number;
  /** Data da aplicação `YYYY-MM-DD`. */
  readonly dataAplicacao: string;
}

/** @description Corpo do registro de simulação. */
export interface SimulationRequestDto {
  readonly isin: string;
  readonly valor: number;
  readonly prazoDias: number;
}

/** @description Comprovante de registro de simulação. */
export interface SimulationReceiptDto {
  readonly id: string;
  readonly registradaEm: string;
}

/** @description Corpo de uma ordem de aplicação. */
export interface OrderRequestDto {
  readonly isin: string;
  readonly valor: number;
}

/** @description Comprovante de ordem de aplicação. */
export interface OrderReceiptDto {
  readonly protocolo: string;
  readonly status: 'ACEITA';
  readonly isin: string;
  readonly valor: number;
  readonly registradaEm: string;
}

/** @description Corpo padrão de erros da API. */
export interface ApiErrorDto {
  readonly codigo: string;
  readonly mensagem: string;
}
