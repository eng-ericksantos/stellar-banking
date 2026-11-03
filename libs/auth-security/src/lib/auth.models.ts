/**
 * @file Contratos fortemente tipados de autenticação/autorização da plataforma de investimentos.
 *
 * Decisão arquitetural: permissões e escopos de jornada são *uniões literais* (e não `string`)
 * para que o compilador acuse, em tempo de build, qualquer permissão digitada incorretamente
 * em templates (`*hasPermission`), rotas (`data.permission`) ou interceptors.
 */

/**
 * @description Escopos de jornada que um JWT pode carregar. Um escopo representa
 * *em qual esteira de atendimento* o cliente está autorizado a operar.
 */
export const JOURNEY_SCOPES = ['RETAIL', 'PRIVATE_BANKING'] as const;

/** @description União literal dos escopos de jornada suportados. */
export type JourneyScope = (typeof JOURNEY_SCOPES)[number];

/**
 * @description Permissões granulares (ACL) suportadas pela plataforma.
 * - `FIXED_INCOME_READ`: consultar o catálogo de renda fixa.
 * - `FUNDS_READ`: consultar fundos (exclusivo Private).
 * - `SIMULATION_RUN`: executar simulações de rentabilidade.
 * - `INVESTMENT_EXECUTE`: enviar ordens de aplicação.
 */
export const PERMISSIONS = [
  'FIXED_INCOME_READ',
  'FUNDS_READ',
  'SIMULATION_RUN',
  'INVESTMENT_EXECUTE',
] as const;

/** @description União literal das permissões suportadas. */
export type Permission = (typeof PERMISSIONS)[number];

/** @description Perfis comerciais demonstrados no painel de simulação. */
export type CustomerProfile = JourneyScope;

/**
 * @description Claims do JWT utilizadas pela aplicação (subconjunto do RFC 7519 + claims privadas).
 */
export interface JwtClaims {
  /** Identificador do sujeito (cliente). */
  readonly sub: string;
  /** Nome de exibição do cliente. */
  readonly name: string;
  /** Emissor do token. */
  readonly iss: string;
  /** Instante de emissão em segundos desde a época Unix. */
  readonly iat: number;
  /** Instante de expiração em segundos desde a época Unix. */
  readonly exp: number;
  /** Perfil comercial do cliente. */
  readonly profile: CustomerProfile;
  /** Lista de permissões granulares concedidas. */
  readonly permissions: readonly Permission[];
  /** Escopos de jornada concedidos. */
  readonly journeyScopes: readonly JourneyScope[];
}

/**
 * @description Type guard para {@link JourneyScope}.
 * @param value Valor desconhecido a ser verificado.
 * @returns `true` quando o valor é um escopo de jornada válido.
 * @example
 * isJourneyScope('RETAIL'); // true
 */
export function isJourneyScope(value: unknown): value is JourneyScope {
  return typeof value === 'string' && (JOURNEY_SCOPES as readonly string[]).includes(value);
}

/**
 * @description Type guard para {@link Permission}.
 * @param value Valor desconhecido a ser verificado.
 * @returns `true` quando o valor é uma permissão válida.
 * @example
 * isPermission('INVESTMENT_EXECUTE'); // true
 */
export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

/**
 * @description Motivos pelos quais uma sessão pode ser encerrada globalmente.
 * Uma união discriminada simples permite ao modal exibir mensagens específicas.
 */
export type SessionTerminationReason = 'UNAUTHORIZED' | 'FORBIDDEN' | 'EXPIRED' | 'USER_REQUEST';
