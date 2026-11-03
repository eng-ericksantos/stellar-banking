import {
  CustomerProfile,
  JOURNEY_SCOPES,
  JourneyScope,
  JwtClaims,
  PERMISSIONS,
  Permission,
  isJourneyScope,
  isPermission,
} from './auth.models';

/**
 * @description Erro lançado quando um JWT é malformado, não decodificável ou semanticamente inválido.
 */
export class InvalidTokenError extends Error {
  /**
   * @description Cria o erro de token inválido.
   * @param message Descrição legível do motivo da invalidez.
   */
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

/**
 * @description Codifica bytes UTF-8 em Base64URL (RFC 4648 §5), formato exigido pelo JWT.
 * @param text Texto UTF-8 a codificar.
 * @returns Texto Base64URL sem padding.
 * @example
 * base64UrlDecode(base64UrlEncode('João')); // 'João'
 */
export function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * @description Decodifica Base64URL para texto UTF-8.
 * @param value Texto em Base64URL.
 * @returns Texto UTF-8 original.
 * @throws {InvalidTokenError} Quando o conteúdo não é Base64URL válido.
 * @example
 * base64UrlDecode(base64UrlEncode('Renda Fixa')); // 'Renda Fixa'
 */
export function base64UrlDecode(value: string): string {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    throw new InvalidTokenError('Conteúdo Base64URL inválido.');
  }
}

/**
 * @description Constrói um JWT *não assinado de demonstração* (`alg: none`-like, assinatura fictícia).
 * Em produção o token é emitido e ASSINADO pelo Identity Provider; o front-end apenas o
 * decodifica para decisões de UX — a autorização real é sempre reavaliada no backend.
 * @param claims Claims a serem embutidas no payload.
 * @returns JWT no formato `header.payload.signature`.
 * @example
 * const token = createDemoJwt(claims);
 */
export function createDemoJwt(claims: JwtClaims): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify(claims));
  return `${header}.${payload}.demo-signature`;
}

/**
 * @description Verifica se um valor desconhecido é um array de strings aceitas por um guard.
 * @param value Valor a verificar.
 * @param guard Type guard dos elementos.
 * @returns `true` se for array cujos elementos satisfazem o guard.
 */
function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is readonly T[] {
  return Array.isArray(value) && value.every(guard);
}

/**
 * @description Decodifica e valida estruturalmente um JWT, retornando as claims tipadas.
 * Não valida assinatura (responsabilidade do backend / IdP).
 * @param token JWT no formato `header.payload.signature`.
 * @returns Claims tipadas do token.
 * @throws {InvalidTokenError} Se o token for malformado ou faltar claim obrigatória.
 * @example
 * const claims = decodeJwt(token);
 * console.log(claims.journeyScopes);
 */
export function decodeJwt(token: string): JwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new InvalidTokenError('JWT deve possuir três segmentos.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(base64UrlDecode(parts[1] ?? ''));
  } catch (error) {
    if (error instanceof InvalidTokenError) {
      throw error;
    }
    throw new InvalidTokenError('Payload do JWT não é JSON válido.');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new InvalidTokenError('Payload do JWT deve ser um objeto.');
  }
  const record = raw as Record<string, unknown>;
  const { sub, name, iss, iat, exp, profile, permissions, journeyScopes } = record;
  if (
    typeof sub !== 'string' ||
    typeof name !== 'string' ||
    typeof iss !== 'string' ||
    typeof iat !== 'number' ||
    typeof exp !== 'number' ||
    !isJourneyScope(profile) ||
    !isArrayOf(permissions, isPermission) ||
    !isArrayOf(journeyScopes, isJourneyScope)
  ) {
    throw new InvalidTokenError('Claims obrigatórias ausentes ou inválidas.');
  }
  return { sub, name, iss, iat, exp, profile, permissions, journeyScopes };
}

/**
 * @description Indica se as claims estão expiradas em relação ao instante informado.
 * @param claims Claims decodificadas.
 * @param nowMs Instante atual em milissegundos (injetável para testes determinísticos).
 * @returns `true` se `exp` já passou.
 * @example
 * isExpired(claims, Date.now());
 */
export function isExpired(claims: Pick<JwtClaims, 'exp'>, nowMs: number): boolean {
  return claims.exp * 1000 <= nowMs;
}

/**
 * @description Matriz de concessão por perfil: define *o que cada perfil comercial recebe* no token.
 * Mantida declarativa (`Record`) para facilitar auditoria da ACL.
 */
export const PROFILE_GRANTS: Readonly<
  Record<CustomerProfile, { readonly permissions: readonly Permission[]; readonly scopes: readonly JourneyScope[] }>
> = {
  RETAIL: {
    permissions: ['FIXED_INCOME_READ', 'SIMULATION_RUN'],
    scopes: ['RETAIL'],
  },
  PRIVATE_BANKING: {
    permissions: [...PERMISSIONS],
    scopes: [...JOURNEY_SCOPES],
  },
};

/**
 * @description Monta as claims de demonstração para um perfil.
 * @param profile Perfil comercial desejado.
 * @param nowMs Instante atual em milissegundos.
 * @param ttlSeconds Tempo de vida do token em segundos (padrão 15 minutos).
 * @returns Claims prontas para serem assinadas por {@link createDemoJwt}.
 * @example
 * const claims = buildDemoClaims('PRIVATE_BANKING', Date.now());
 */
export function buildDemoClaims(profile: CustomerProfile, nowMs: number, ttlSeconds = 900): JwtClaims {
  const grants = PROFILE_GRANTS[profile];
  const iat = Math.floor(nowMs / 1000);
  return {
    sub: profile === 'PRIVATE_BANKING' ? 'cli-000987' : 'cli-000123',
    name: profile === 'PRIVATE_BANKING' ? 'Helena Albuquerque' : 'Carlos Menezes',
    iss: 'https://idp.stellar-banking.example',
    iat,
    exp: iat + ttlSeconds,
    profile,
    permissions: grants.permissions,
    journeyScopes: grants.scopes,
  };
}
