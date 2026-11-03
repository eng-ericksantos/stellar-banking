import { JwtClaims, Permission } from '@invest/auth-security';
import { API_ENDPOINTS, OrderRequestDto, PositionDto, SimulationRequestDto } from './api-contracts';
import {
  MOCK_FIXED_INCOME,
  MOCK_FUNDS,
  MOCK_PORTFOLIO,
  MOCK_RATES,
  apiError,
  buildOrderReceipt,
  buildSimulationReceipt,
} from './mock-data';

/** @description Resultado de uma chamada ao backend simulado. */
export interface MockResult {
  readonly status: number;
  readonly body: unknown;
}

/** @description Contexto mínimo da requisição para o roteador simulado. */
export interface MockRequest {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
  /** Claims extraídas do `Authorization`; `null` quando o token é ausente/inválido. */
  readonly claims: JwtClaims | null;
}

/**
 * @description Type guard do corpo de uma ordem.
 * @param body Corpo desconhecido.
 * @returns `true` se estruturalmente válido.
 */
function isOrderRequest(body: unknown): body is OrderRequestDto {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as Record<string, unknown>)['isin'] === 'string' &&
    typeof (body as Record<string, unknown>)['valor'] === 'number'
  );
}

/**
 * @description Type guard do corpo de uma simulação.
 * @param body Corpo desconhecido.
 * @returns `true` se estruturalmente válido.
 */
function isSimulationRequest(body: unknown): body is SimulationRequestDto {
  return (
    isOrderRequest(body) && typeof (body as unknown as Record<string, unknown>)['prazoDias'] === 'number'
  );
}

/**
 * @description Verifica a permissão como o *servidor real* faria (defesa em profundidade: o
 * front-end oculta botões, mas o backend é quem de fato autoriza).
 * @param claims Claims do token.
 * @param permission Permissão exigida.
 * @returns `true` se concedida.
 */
function hasPermission(claims: JwtClaims, permission: Permission): boolean {
  return claims.permissions.includes(permission);
}

/** @description Estado mutável do backend simulado (carteira e sequencial de protocolos). */
export interface MockBackendState {
  readonly positions: PositionDto[];
  sequence: number;
}

/**
 * @description Cria um estado inicial isolado do backend simulado. Cada injector (e, portanto, cada
 * requisição SSR e cada aba do browser) possui o seu: assim, as ordens enviadas aparecem na carteira após um
 * "Atualizar" sem que dados de um usuário vazem para outro (um estado de módulo seria compartilhado no servidor).
 * @returns Estado novo, com a carteira inicial do cliente.
 * @example
 * const state = createMockBackendState();
 */
export function createMockBackendState(): MockBackendState {
  return { positions: MOCK_PORTFOLIO.map((position) => ({ ...position })), sequence: 100 };
}

/**
 * @description Registra uma ordem aceita na carteira (soma ao valor se o ativo já existir).
 * @param state Estado do backend simulado.
 * @param isin ISIN do ativo.
 * @param valor Valor aplicado.
 */
function applyOrder(state: MockBackendState, isin: string, valor: number): void {
  const index = state.positions.findIndex((position) => position.isin === isin);
  const existing = state.positions[index];
  if (existing) {
    state.positions[index] = { ...existing, valorAplicado: existing.valorAplicado + valor };
  } else {
    state.positions.push({ isin, valorAplicado: valor, dataAplicacao: MOCK_RATES.referencia });
  }
}

/**
 * @description Roteador do backend simulado: devolve status + corpo para cada rota.
 * @param request Requisição normalizada.
 * @param state Estado mutável (carteira/sequencial); por padrão, um estado novo descartável.
 * @returns Resultado simulado.
 * @example
 * handleMockRequest({ method: 'GET', path: '/api/v1/rates', body: null, claims });
 */
export function handleMockRequest(request: MockRequest, state: MockBackendState = createMockBackendState()): MockResult {
  const { method, path, body, claims } = request;
  if (!claims) {
    return { status: 401, body: apiError('NAO_AUTENTICADO', 'Token ausente, inválido ou expirado.') };
  }

  if (method === 'GET' && path === API_ENDPOINTS.rates) {
    return { status: 200, body: MOCK_RATES };
  }
  if (method === 'GET' && path === API_ENDPOINTS.fixedIncome) {
    return hasPermission(claims, 'FIXED_INCOME_READ')
      ? { status: 200, body: MOCK_FIXED_INCOME }
      : { status: 403, body: apiError('SEM_PERMISSAO', 'Permissão FIXED_INCOME_READ ausente.') };
  }
  if (method === 'GET' && path === API_ENDPOINTS.funds) {
    return claims.journeyScopes.includes('PRIVATE_BANKING') && hasPermission(claims, 'FUNDS_READ')
      ? { status: 200, body: MOCK_FUNDS }
      : { status: 403, body: apiError('SEM_ESCOPO', 'Fundos exigem a jornada PRIVATE_BANKING.') };
  }
  if (method === 'GET' && path === API_ENDPOINTS.portfolio) {
    return { status: 200, body: state.positions };
  }
  if (method === 'POST' && path === API_ENDPOINTS.simulations) {
    if (!hasPermission(claims, 'SIMULATION_RUN')) {
      return { status: 403, body: apiError('SEM_PERMISSAO', 'Permissão SIMULATION_RUN ausente.') };
    }
    if (!isSimulationRequest(body) || body.valor <= 0 || body.prazoDias <= 0) {
      return { status: 422, body: apiError('SIMULACAO_INVALIDA', 'Parâmetros de simulação inválidos.') };
    }
    return { status: 201, body: buildSimulationReceipt(++state.sequence) };
  }
  if (method === 'POST' && path === API_ENDPOINTS.orders) {
    if (!hasPermission(claims, 'INVESTMENT_EXECUTE') || !claims.journeyScopes.includes('PRIVATE_BANKING')) {
      return { status: 403, body: apiError('SEM_PERMISSAO', 'Permissão INVESTMENT_EXECUTE ausente.') };
    }
    if (!isOrderRequest(body)) {
      return { status: 422, body: apiError('ORDEM_INVALIDA', 'Corpo da ordem inválido.') };
    }
    const asset = [...MOCK_FIXED_INCOME, ...MOCK_FUNDS].find((candidate) => candidate.isin === body.isin);
    if (!asset) {
      return { status: 404, body: apiError('ATIVO_NAO_ENCONTRADO', 'ISIN não encontrado.') };
    }
    if (body.valor < asset.aplicacaoMinima) {
      return {
        status: 422,
        body: apiError('VALOR_ABAIXO_DO_MINIMO', `Aplicação mínima: R$ ${asset.aplicacaoMinima}.`),
      };
    }
    applyOrder(state, body.isin, body.valor);
    return { status: 201, body: buildOrderReceipt(++state.sequence, body.isin, body.valor) };
  }
  return { status: 404, body: apiError('ROTA_NAO_ENCONTRADA', `${method} ${path} não existe.`) };
}
