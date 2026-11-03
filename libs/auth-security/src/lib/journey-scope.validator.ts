import { Injectable } from '@angular/core';
import { JourneyScope, JwtClaims } from './auth.models';
import { InvalidTokenError, decodeJwt, isExpired } from './jwt';

/**
 * @description Erro lançado quando o token do cliente NÃO possui o escopo de jornada exigido
 * por um endpoint. Não estende `HttpErrorResponse` de propósito: trata-se de uma falha
 * *local* (a requisição sequer sai do navegador) e, por isso, não deve disparar o
 * `globalLogoutInterceptor` (que reage apenas a 401/403 vindos do servidor).
 */
export class JourneyScopeError extends Error {
  /**
   * @description Cria o erro de escopo insuficiente.
   * @param requiredScope Escopo exigido pelo endpoint.
   * @param grantedScopes Escopos efetivamente presentes no token.
   */
  constructor(
    readonly requiredScope: JourneyScope,
    readonly grantedScopes: readonly JourneyScope[],
  ) {
    super(
      `Escopo de jornada "${requiredScope}" exigido; token possui [${grantedScopes.join(', ') || 'nenhum'}].`,
    );
    this.name = 'JourneyScopeError';
  }
}

/**
 * @description Resultado discriminado da validação de escopo — união discriminada evita
 * `boolean` ambíguo e obriga o chamador a tratar cada motivo de falha.
 */
export type ScopeValidationResult =
  | { readonly valid: true; readonly claims: JwtClaims }
  | { readonly valid: false; readonly reason: 'MISSING_TOKEN' | 'MALFORMED' | 'EXPIRED' | 'SCOPE_MISSING' };

/**
 * @description Serviço que valida se um JWT possui o escopo de jornada exigido por um endpoint.
 * É usado pelo `authInterceptor` *antes* do disparo da requisição, economizando um
 * round-trip que certamente resultaria em 403.
 */
@Injectable({ providedIn: 'root' })
export class JourneyScopeValidator {
  /**
   * @description Valida token + escopo.
   * @param token JWT bruto (ou `null` se não autenticado).
   * @param requiredScope Escopo exigido pelo endpoint.
   * @param nowMs Instante atual em milissegundos (padrão `Date.now()`).
   * @returns Resultado discriminado com as claims quando válido.
   * @example
   * const result = validator.validate(token, 'PRIVATE_BANKING');
   * if (!result.valid) console.warn(result.reason);
   */
  validate(token: string | null, requiredScope: JourneyScope, nowMs: number = Date.now()): ScopeValidationResult {
    if (!token) {
      return { valid: false, reason: 'MISSING_TOKEN' };
    }
    let claims: JwtClaims;
    try {
      claims = decodeJwt(token);
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        return { valid: false, reason: 'MALFORMED' };
      }
      throw error;
    }
    if (isExpired(claims, nowMs)) {
      return { valid: false, reason: 'EXPIRED' };
    }
    if (!claims.journeyScopes.includes(requiredScope)) {
      return { valid: false, reason: 'SCOPE_MISSING' };
    }
    return { valid: true, claims };
  }

  /**
   * @description Variante "assertiva": lança {@link JourneyScopeError} se o escopo faltar.
   * @param token JWT bruto.
   * @param requiredScope Escopo exigido.
   * @returns As claims decodificadas quando válido.
   * @throws {JourneyScopeError} Quando o token é válido mas não possui o escopo.
   * @throws {InvalidTokenError} Quando o token está ausente, malformado ou expirado.
   * @example
   * const claims = validator.assertScope(token, 'RETAIL');
   */
  assertScope(token: string | null, requiredScope: JourneyScope, nowMs: number = Date.now()): JwtClaims {
    const result = this.validate(token, requiredScope, nowMs);
    if (result.valid) {
      return result.claims;
    }
    if (result.reason === 'SCOPE_MISSING') {
      const granted = token ? decodeJwt(token).journeyScopes : [];
      throw new JourneyScopeError(requiredScope, granted);
    }
    throw new InvalidTokenError(`Token inválido: ${result.reason}.`);
  }
}
