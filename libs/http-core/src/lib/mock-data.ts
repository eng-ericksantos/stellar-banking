import {
  ApiErrorDto,
  AssetDto,
  OrderReceiptDto,
  PositionDto,
  RatesDto,
  SimulationReceiptDto,
} from './api-contracts';

/**
 * @file Base de dados simulada, com títulos plausíveis do mercado financeiro brasileiro.
 * Emissores, CNPJs e taxas são FICTÍCIOS e ilustrativos (ISINs/CNPJs com dígitos verificadores
 * válidos para exercitar os Branded Types). Não constituem oferta de investimento.
 */

/** @description Taxas de mercado simuladas (% a.a.). */
export const MOCK_RATES: RatesDto = {
  cdi: 14.65,
  selic: 14.75,
  ipca: 4.62,
  referencia: '2026-11-03',
};

/** @description Catálogo de renda fixa (acessível ao escopo RETAIL). */
export const MOCK_FIXED_INCOME: readonly AssetDto[] = [
  {
    isin: 'BRCDBBRA0016',
    kind: 'CDB',
    nome: 'CDB Aurora 110% CDI',
    emissor: 'Banco Aurora S.A.',
    cnpj: '12345678000195',
    indexador: 'CDI',
    taxa: 110,
    vencimento: '2028-03-15',
    liquidez: 'NO_VENCIMENTO',
    risco: 'BAIXO',
    aplicacaoMinima: 1000,
    garantiaFgc: true,
    isentoIR: false,
  },
  {
    isin: 'BRCDBPAN0022',
    kind: 'CDB',
    nome: 'CDB Atlântico Liquidez Diária',
    emissor: 'Banco Atlântico Digital S.A.',
    cnpj: '98765432000198',
    indexador: 'CDI',
    taxa: 102,
    vencimento: '2027-09-01',
    liquidez: 'DIARIA',
    risco: 'BAIXO',
    aplicacaoMinima: 500,
    garantiaFgc: true,
    isentoIR: false,
  },
  {
    isin: 'BRCDBSFR0129',
    kind: 'CDB',
    nome: 'CDB Safira Prefixado 13,4%',
    emissor: 'Banco Safira S.A.',
    cnpj: '33445566000186',
    indexador: 'PRE',
    taxa: 13.4,
    vencimento: '2029-02-10',
    liquidez: 'NO_VENCIMENTO',
    risco: 'MEDIO',
    aplicacaoMinima: 1000,
    garantiaFgc: true,
    isentoIR: false,
  },
  {
    isin: 'BRLCIITA0036',
    kind: 'LCI',
    nome: 'LCI Itapema 92% CDI',
    emissor: 'Banco Itapema S.A.',
    cnpj: '11222333000181',
    indexador: 'CDI',
    taxa: 92,
    vencimento: '2027-06-30',
    liquidez: 'NO_VENCIMENTO',
    risco: 'BAIXO',
    aplicacaoMinima: 1000,
    garantiaFgc: true,
    isentoIR: true,
  },
  {
    isin: 'BRLCABRD0048',
    kind: 'LCA',
    nome: 'LCA Brasa Rural 94% CDI',
    emissor: 'Banco Brasa Rural S.A.',
    cnpj: '44555666000181',
    indexador: 'CDI',
    taxa: 94,
    vencimento: '2027-12-10',
    liquidez: 'NO_VENCIMENTO',
    risco: 'BAIXO',
    aplicacaoMinima: 1000,
    garantiaFgc: true,
    isentoIR: true,
  },
  {
    isin: 'BRLCAXPI0056',
    kind: 'LCA',
    nome: 'LCA Xingu IPCA+ 6,2%',
    emissor: 'Banco Xingu S.A.',
    cnpj: '77888999000181',
    indexador: 'IPCA',
    taxa: 6.2,
    vencimento: '2028-04-20',
    liquidez: 'NO_VENCIMENTO',
    risco: 'BAIXO',
    aplicacaoMinima: 2000,
    garantiaFgc: true,
    isentoIR: true,
  },
  {
    isin: 'BRNTNB350062',
    kind: 'TESOURO_IPCA',
    nome: 'Tesouro IPCA+ 2035',
    emissor: 'Tesouro Nacional',
    cnpj: '00394460005887',
    ticker: 'NTNB2035',
    indexador: 'IPCA',
    taxa: 7.45,
    vencimento: '2035-05-15',
    liquidez: 'DIARIA',
    risco: 'BAIXO',
    aplicacaoMinima: 150,
    garantiaFgc: false,
    isentoIR: false,
  },
  {
    isin: 'BRNTNB450078',
    kind: 'TESOURO_IPCA',
    nome: 'Tesouro IPCA+ 2045',
    emissor: 'Tesouro Nacional',
    cnpj: '00394460005887',
    ticker: 'NTNB2045',
    indexador: 'IPCA',
    taxa: 7.3,
    vencimento: '2045-05-15',
    liquidez: 'DIARIA',
    risco: 'MEDIO',
    aplicacaoMinima: 150,
    garantiaFgc: false,
    isentoIR: false,
  },
  {
    isin: 'BRCRIMRV0080',
    kind: 'CRI',
    nome: 'CRI Vértice Residencial IPCA+ 8,9%',
    emissor: 'Vértice Securitizadora S.A.',
    cnpj: '55667788000186',
    ticker: 'CRIVRT24E1',
    indexador: 'IPCA',
    taxa: 8.9,
    vencimento: '2031-05-15',
    liquidez: 'NO_VENCIMENTO',
    risco: 'MEDIO',
    aplicacaoMinima: 1000,
    garantiaFgc: false,
    isentoIR: true,
  },
  {
    isin: 'BRCRAKLB0098',
    kind: 'CRA',
    nome: 'CRA Kauai Agro 108% CDI',
    emissor: 'Kauai Agroindustrial S.A.',
    cnpj: '00100200000116',
    ticker: 'CRAKAU24B1',
    indexador: 'CDI',
    taxa: 108,
    vencimento: '2030-08-20',
    liquidez: 'NO_VENCIMENTO',
    risco: 'ALTO',
    aplicacaoMinima: 5000,
    garantiaFgc: false,
    isentoIR: true,
  },
];

/** @description Fundos Multimercado (exclusivos do escopo PRIVATE_BANKING). */
export const MOCK_FUNDS: readonly AssetDto[] = [
  {
    isin: 'BRFMMVRT0105',
    kind: 'FUNDO_MULTIMERCADO',
    nome: 'Vértice Macro Multimercado FIC FIM',
    emissor: 'Vértice Gestão de Recursos Ltda.',
    cnpj: '12345678000195',
    indexador: 'CDI',
    taxa: 118,
    vencimento: null,
    liquidez: 'D_MAIS_30',
    risco: 'ALTO',
    aplicacaoMinima: 5000,
    garantiaFgc: false,
    isentoIR: false,
    taxaAdministracao: 1.8,
    cotizacaoDias: 30,
  },
  {
    isin: 'BRFMMKPT0118',
    kind: 'FUNDO_MULTIMERCADO',
    nome: 'Kapitel Estratégia Dinâmica FIM',
    emissor: 'Kapitel Asset Management Ltda.',
    cnpj: '98765432000198',
    indexador: 'CDI',
    taxa: 105,
    vencimento: null,
    liquidez: 'D_MAIS_30',
    risco: 'MEDIO',
    aplicacaoMinima: 1000,
    garantiaFgc: false,
    isentoIR: false,
    taxaAdministracao: 1.2,
    cotizacaoDias: 2,
  },
];

/** @description Carteira inicial simulada do cliente. */
export const MOCK_PORTFOLIO: readonly PositionDto[] = [
  { isin: 'BRCDBBRA0016', valorAplicado: 25000, dataAplicacao: '2025-06-10' },
  { isin: 'BRLCAXPI0056', valorAplicado: 15000, dataAplicacao: '2026-01-20' },
  { isin: 'BRNTNB350062', valorAplicado: 10000, dataAplicacao: '2025-11-03' },
];

/**
 * @description Constrói um erro padronizado de API.
 * @param codigo Código de erro de negócio.
 * @param mensagem Mensagem legível.
 * @returns DTO de erro.
 */
export function apiError(codigo: string, mensagem: string): ApiErrorDto {
  return { codigo, mensagem };
}

/**
 * @description Gera um protocolo de ordem pseudo-único para a simulação.
 * @param sequence Número sequencial.
 * @returns Protocolo no formato `ORD-000123`.
 */
export function buildProtocol(sequence: number): string {
  return `ORD-${String(sequence).padStart(6, '0')}`;
}

/**
 * @description Constrói o comprovante de uma ordem aceita.
 * @param sequence Sequencial.
 * @param isin ISIN do ativo.
 * @param valor Valor aplicado.
 * @returns Comprovante de ordem.
 */
export function buildOrderReceipt(sequence: number, isin: string, valor: number): OrderReceiptDto {
  return {
    protocolo: buildProtocol(sequence),
    status: 'ACEITA',
    isin,
    valor,
    registradaEm: new Date().toISOString(),
  };
}

/**
 * @description Constrói o comprovante de registro de uma simulação.
 * @param sequence Sequencial.
 * @returns Comprovante de simulação.
 */
export function buildSimulationReceipt(sequence: number): SimulationReceiptDto {
  return { id: `SIM-${String(sequence).padStart(6, '0')}`, registradaEm: new Date().toISOString() };
}
