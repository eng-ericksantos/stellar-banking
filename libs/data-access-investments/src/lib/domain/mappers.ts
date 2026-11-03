import {
  AssetDto,
  PositionDto,
  RatesDto,
} from '@invest/http-core';
import {
  CNPJ,
  DomainValidationError,
  ISIN,
  ParseOutcome,
  TaxaRentabilidade,
  Ticker,
  parseCnpj,
  parseIsin,
  parseTaxa,
  parseTicker,
} from './branded';
import { InvestmentAsset, MarketRates, Position } from './models';

/**
 * @file Anti-Corruption Layer: converte DTOs (dados crus da rede) em tipos de domínio *validados*.
 * Dados que não passam pela validação são rejeitados na fronteira, impedindo que valores inválidos
 * (ex.: ISIN com dígito errado) contaminem o estado (Elf) e a UI.
 */

/** @description Resultado do mapeamento em lote. */
export interface MappedAssets {
  readonly assets: readonly InvestmentAsset[];
  readonly rejected: readonly DomainValidationError[];
}

/**
 * @description Combina resultados de parse em sequência, interrompendo no primeiro erro.
 * @param outcome Resultado individual.
 * @returns O valor ou lança o erro (capturado por {@link toAsset}).
 * @throws {DomainValidationError} Quando o parse falhou.
 */
function need<T>(outcome: ParseOutcome<T>): T {
  if (!outcome.ok) {
    throw outcome.error;
  }
  return outcome.value;
}

/**
 * @description Exige um ticker presente e válido.
 * @param raw Ticker bruto do DTO.
 * @returns Ticker branded.
 * @throws {DomainValidationError} Se ausente ou inválido.
 */
function needTicker(raw: string | undefined): Ticker {
  if (raw === undefined) {
    throw new DomainValidationError('Ticker', raw, 'obrigatório para este tipo de ativo');
  }
  return need(parseTicker(raw));
}

/**
 * @description Converte um {@link AssetDto} em {@link InvestmentAsset}, validando todos os Branded Types.
 * @param dto DTO recebido da API.
 * @returns Resultado discriminado com o ativo de domínio ou o erro de validação.
 * @example
 * const result = toAsset(dto);
 * if (result.ok) store.upsert(result.value);
 */
export function toAsset(dto: AssetDto): ParseOutcome<InvestmentAsset> {
  try {
    const isin: ISIN = need(parseIsin(dto.isin));
    const cnpj: CNPJ = need(parseCnpj(dto.cnpj));
    const taxa: TaxaRentabilidade = need(parseTaxa(dto.taxa));
    const base = {
      isin,
      cnpj,
      taxa,
      nome: dto.nome,
      emissor: dto.emissor,
      indexador: dto.indexador,
      vencimento: dto.vencimento,
      liquidez: dto.liquidez,
      risco: dto.risco,
      aplicacaoMinima: dto.aplicacaoMinima,
      garantiaFgc: dto.garantiaFgc,
    };
    let asset: InvestmentAsset;
    switch (dto.kind) {
      case 'CDB':
        asset = { ...base, kind: 'CDB', isentoIR: false };
        break;
      case 'LCI':
        asset = { ...base, kind: 'LCI', isentoIR: true };
        break;
      case 'LCA':
        asset = { ...base, kind: 'LCA', isentoIR: true };
        break;
      case 'TESOURO_IPCA':
        asset = { ...base, kind: 'TESOURO_IPCA', isentoIR: false, ticker: needTicker(dto.ticker) };
        break;
      case 'CRI':
        asset = { ...base, kind: 'CRI', isentoIR: true, ticker: needTicker(dto.ticker) };
        break;
      case 'CRA':
        asset = { ...base, kind: 'CRA', isentoIR: true, ticker: needTicker(dto.ticker) };
        break;
      case 'FUNDO_MULTIMERCADO':
        asset = {
          ...base,
          kind: 'FUNDO_MULTIMERCADO',
          isentoIR: false,
          taxaAdministracao: dto.taxaAdministracao ?? 0,
          cotizacaoDias: dto.cotizacaoDias ?? 0,
        };
        break;
    }
    return { ok: true, value: asset };
  } catch (error) {
    if (error instanceof DomainValidationError) {
      return { ok: false, error };
    }
    throw error;
  }
}

/**
 * @description Converte uma lista de DTOs, separando ativos válidos dos rejeitados.
 * @param dtos DTOs da API.
 * @returns Ativos válidos + erros de validação.
 * @example
 * const { assets, rejected } = toAssets(dtos);
 */
export function toAssets(dtos: readonly AssetDto[]): MappedAssets {
  const assets: InvestmentAsset[] = [];
  const rejected: DomainValidationError[] = [];
  for (const dto of dtos) {
    const result = toAsset(dto);
    if (result.ok) {
      assets.push(result.value);
    } else {
      rejected.push(result.error);
    }
  }
  return { assets, rejected };
}

/**
 * @description Converte {@link RatesDto} em {@link MarketRates}.
 * @param dto DTO de taxas.
 * @returns Taxas de mercado validadas.
 * @throws {DomainValidationError} Se alguma taxa for inválida.
 * @example
 * const rates = toRates(dto);
 */
export function toRates(dto: RatesDto): MarketRates {
  return {
    cdi: need(parseTaxa(dto.cdi)),
    selic: need(parseTaxa(dto.selic)),
    ipca: need(parseTaxa(dto.ipca)),
    referencia: dto.referencia,
  };
}

/**
 * @description Converte posições do DTO, descartando as com ISIN inválido.
 * @param dtos Posições da API.
 * @returns Posições de domínio.
 * @example
 * const positions = toPositions(dtos);
 */
export function toPositions(dtos: readonly PositionDto[]): readonly Position[] {
  const positions: Position[] = [];
  for (const dto of dtos) {
    const isin = parseIsin(dto.isin);
    if (isin.ok) {
      positions.push({ isin: isin.value, valorAplicado: dto.valorAplicado, dataAplicacao: dto.dataAplicacao });
    }
  }
  return positions;
}
